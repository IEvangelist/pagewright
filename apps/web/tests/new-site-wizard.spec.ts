import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function chooseTemplate(page: Page, template: "Landing Page" | "Blog" | "Portfolio") {
  await page.goto("/new");
  await page.getByRole("button", { name: `Use ${template}` }).click();
  await expect(page.getByRole("heading", { name: "Set up your site" })).toBeVisible();
}

async function expectNoWcagViolations(page: Page, theme: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    results.violations,
    `${theme} theme WCAG violations:\n${JSON.stringify(results.violations, null, 2)}`,
  ).toEqual([]);
}

async function expectTextContrast(locator: Locator, minimum: number, label: string) {
  const colors = await locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      foreground: styles.color,
      background: styles.backgroundColor,
    };
  });

  const parseRgb = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`);
    return channels;
  };
  const luminance = (value: string) =>
    parseRgb(value)
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  const foreground = luminance(colors.foreground);
  const background = luminance(colors.background);
  const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);

  expect(
    ratio,
    `${label} contrast was ${ratio.toFixed(2)}:1 (${colors.foreground} on ${colors.background})`,
  ).toBeGreaterThanOrEqual(minimum);
}

async function expectDualFocusIndicator(locator: Locator) {
  await locator.focus();
  const boxShadow = await locator.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(boxShadow).toContain("rgb(255, 255, 255)");
  expect(boxShadow).toContain("rgb(9, 9, 11)");
}

test("recovers from invalid input and keeps the setup summary in sync", async ({ page }) => {
  await chooseTemplate(page, "Landing Page");

  const siteName = page.getByLabel("Site name");
  const repoName = page.getByLabel("Repository name");
  const continueButton = page.getByRole("button", { name: "Continue with GitHub" });

  await expect(siteName).toHaveValue("My Landing Page");
  await expect(repoName).toHaveValue("my-landing-page");

  await siteName.clear();
  await continueButton.click();

  await expect(siteName).toBeFocused();
  await expect(page.getByText("Enter a name for your site.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/new$/);

  await siteName.fill("Launch Notes");
  await expect(repoName).toHaveValue("launch-notes");
  await repoName.clear();
  await continueButton.click();
  await expect(repoName).toBeFocused();
  await expect(page.getByText("Enter a repository name.", { exact: true })).toBeVisible();

  await repoName.fill("Launch $$ Notes");
  await expect(repoName).toHaveValue("launch-notes");

  await page.getByRole("radio", { name: "Rose", exact: true }).click();
  await page.getByRole("radio", { name: /^Dark/ }).click();
  await page.getByRole("radio", { name: /^Private/ }).click();

  const summary = page.getByRole("complementary", { name: "Site setup summary" });
  await expect(summary.getByText("Rose", { exact: true })).toBeVisible();
  await expect(summary.getByText("Dark", { exact: true })).toBeVisible();
  await expect(summary.getByText("Private", { exact: true })).toBeVisible();
  await expect(continueButton).toBeEnabled();
});

test("completes the full mock provisioning flow", async ({ page }) => {
  await page.goto("/api/auth/login?returnTo=/new");
  await expect(page).toHaveURL(/\/new$/);

  await page.getByRole("button", { name: "Use Blog" }).click();
  await page.getByLabel("Site name").fill("Automated Release Notes");
  await page.getByLabel("Repository name").fill(`release-notes-${Date.now()}`);
  await page.getByRole("button", { name: "Create site" }).click();

  await expect(page.getByRole("heading", { name: "Creating your site" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your site is ready" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: "View deployment" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Repository" })).toBeVisible();
});

test("meets WCAG AA automation in light and dark themes", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pw-theme", "light"));
  await chooseTemplate(page, "Portfolio");

  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expectNoWcagViolations(page, "Light");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoWcagViolations(page, "Dark");
});

test("keeps the landing page WCAG AA compliant in light and dark themes", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pw-theme", "light"));
  await page.goto("/");

  const cta = page.locator(".pw-landing__primary");
  await expect(cta).toBeVisible();
  await expectTextContrast(cta, 4.5, "Landing page light CTA");
  await expectDualFocusIndicator(cta);
  await expectNoWcagViolations(page, "Landing page light");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectTextContrast(cta, 4.5, "Landing page dark CTA");
  await expectNoWcagViolations(page, "Landing page dark");
});

test("keeps generated template CTAs accessible in light and dark themes", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await page.goto(`/templates/landing/frame?theme=${theme}`);
    const cta = page.locator(".pw-cta .pw-btn--primary");

    await expect(cta).toBeVisible();
    await expectTextContrast(cta, 4.5, `Generated template ${theme} CTA`);
    await expectDualFocusIndicator(cta);
    await expectNoWcagViolations(page, `Generated template ${theme}`);
  }
});

test("stays usable without horizontal overflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await chooseTemplate(page, "Portfolio");

  let hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const continueButton = page.getByRole("button", { name: "Continue with GitHub" });
  await continueButton.scrollIntoViewIfNeeded();
  await expect(continueButton).toBeVisible();

  await page.goto("/api/auth/login?returnTo=/new");
  await expect(
    page.getByRole("button", {
      name: "Open account menu for pagewright-mobile-reflow-test-account-1",
    }),
  ).toBeVisible();
  hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
