import test from "node:test";
import assert from "node:assert/strict";
import {
  getLandingCtas,
  resolveTemplateId,
  templateDemoHref,
  templateUseHref,
} from "../src/lib/landing-content.js";

test("landing CTAs change at the server auth boundary", () => {
  const signedOut = getLandingCtas(false);
  const signedIn = getLandingCtas(true);

  assert.deepEqual(signedOut.heroPrimary, {
    label: "Browse templates",
    href: "/templates",
  });
  assert.deepEqual(signedOut.final, { label: "Create a site", href: "/new" });

  assert.deepEqual(signedIn.heroPrimary, { label: "Create a site", href: "/new" });
  assert.deepEqual(signedIn.heroSecondary, {
    label: "Browse templates",
    href: "/templates",
  });
  assert.deepEqual(signedIn.final, { label: "Open dashboard", href: "/dashboard" });
  assert.doesNotMatch(JSON.stringify(signedIn), /sign in/i);
});

test("template routes preserve the selected starter", () => {
  const ids = ["landing", "blog", "portfolio"];

  assert.equal(templateDemoHref("blog"), "/templates/blog");
  assert.equal(templateUseHref("blog"), "/new?template=blog");
  assert.equal(resolveTemplateId("blog", ids), "blog");
  assert.equal(resolveTemplateId("unknown", ids), null);
  assert.equal(resolveTemplateId(null, ids), null);
});
