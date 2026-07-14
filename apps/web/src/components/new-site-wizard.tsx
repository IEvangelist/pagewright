"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Cloud,
  ExternalLink,
  Globe,
  LayoutDashboard,
  Loader2,
  Lock,
  Monitor,
  Moon,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sun,
  XCircle,
} from "lucide-react";
import type { Block, SiteConfig } from "@pagewright/blocks";
import { GitHubMark } from "@/components/icons/github-mark";
import { TemplateCard } from "@/components/template-card";
import { TemplatePreview } from "@/components/template-preview";
import {
  ACCENT_PRESETS,
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplateMeta,
  type TemplateCategory,
} from "@/lib/templates";
import {
  PROVISION_STEPS,
  slugifyRepoName,
  type ProvisionEvent,
  type ProvisionResult,
  type ProvisionStepId,
  type ProvisionStepStatus,
} from "@/lib/provision/shared";
import type { TemplateId } from "@pagewright/registry";
import { resolveTemplateId } from "@/lib/landing-content";

type Phase = "choose" | "configure" | "provisioning" | "done" | "error";
type ThemeChoice = "light" | "dark" | "system";

const DRAFT_KEY = "pagewright:new-site-draft";

interface Draft {
  templateId: TemplateId | null;
  siteName: string;
  repoName: string;
  repoNameTouched: boolean;
  description: string;
  accentId: string;
  defaultTheme: ThemeChoice;
  isPrivate: boolean;
}

const EMPTY_DRAFT: Draft = {
  templateId: null,
  siteName: "",
  repoName: "",
  repoNameTouched: false,
  description: "",
  accentId: ACCENT_PRESETS[0]!.id,
  defaultTheme: "system",
  isPrivate: false,
};

export function NewSiteWizard({
  login,
  previews = {},
}: {
  login?: string | null;
  previews?: Record<string, { blocks: Block[]; site: SiteConfig | null }>;
}) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Gallery filters.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TemplateCategory | "All">("All");

  // Provisioning progress.
  const [stepStatus, setStepStatus] = useState<Record<ProvisionStepId, ProvisionStepStatus>>(
    initialStepStatus,
  );
  const [stepMessage, setStepMessage] = useState<Partial<Record<ProvisionStepId, string>>>({});
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const siteNameRef = useRef<HTMLInputElement | null>(null);
  const repoNameRef = useRef<HTMLInputElement | null>(null);

  // Restore any in-progress draft from a previous visit (localStorage autosave).
  useEffect(() => {
    let restoredTemplate = false;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        restoredTemplate = Boolean(parsed.templateId);
        setDraft((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore malformed drafts.
    }
    // If the user was bounced through sign-in from the configure step (?resume=1), drop them back
    // where they left off instead of the gallery.
    try {
      const resume = new URLSearchParams(window.location.search).get("resume");
      if (resume === "1" && restoredTemplate && login) {
        setPhase("configure");
      }
    } catch {
      // Ignore — SSR/no-window.
    }
    setHydrated(true);
  }, [login]);

  // Deep link from a template demo page ("Use this template" → /new?template=blog): preselect the
  // template and jump straight to the configure step once the draft has hydrated.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const tpl = resolveTemplateId(
        new URLSearchParams(window.location.search).get("template"),
        TEMPLATES.map((template) => template.id),
      );
      if (tpl) {
        chooseTemplate(tpl as TemplateId);
      }
    } catch {
      // Ignore — SSR/no-window.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Autosave the draft as the user works.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full / unavailable — non-fatal.
    }
  }, [draft, hydrated]);

  // Gallery motion is limited to a staggered entrance. Pointer-following effects make browsing
  // visually noisy and can be uncomfortable, so hover feedback stays local and CSS-only.
  useEffect(() => {
    if (phase !== "choose") return;
    const gallery = galleryRef.current;
    if (!gallery) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gallery.classList.add("pw-motion");
    const cards = Array.from(gallery.querySelectorAll<HTMLElement>(".pw-tplcard"));
    const cleanups: Array<() => void> = [];

    cards.forEach((card, i) => {
      card.style.setProperty("--pw-reveal-delay", `${Math.min(i, 8) * 45}ms`);
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("pw-reveal--in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    cards.forEach((card) => io.observe(card));
    cleanups.push(() => io.disconnect());

    return () => cleanups.forEach((fn) => fn());
  }, [phase, hydrated, query, category]);

  const selectedTemplate = draft.templateId ? getTemplateMeta(draft.templateId) : undefined;
  const accent =
    ACCENT_PRESETS.find((a) => a.id === draft.accentId) ?? ACCENT_PRESETS[0]!;

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q))
      );
    });
  }, [query, category]);

  const patch = useCallback((changes: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...changes }));
  }, []);

  function chooseTemplate(id: TemplateId) {
    const meta = getTemplateMeta(id);
    setValidationAttempted(false);
    setDraft((prev) => {
      const nextSiteName = prev.siteName || (meta ? `My ${meta.name}` : "");
      return {
        ...prev,
        templateId: id,
        siteName: nextSiteName,
        repoName: prev.repoNameTouched ? prev.repoName : slugifyRepoName(nextSiteName),
      };
    });
    setPhase("configure");
  }

  function onSiteNameChange(value: string) {
    patch({
      siteName: value,
      repoName: draft.repoNameTouched ? draft.repoName : slugifyRepoName(value),
    });
  }

  const repoSlug = draft.repoName;
  const siteNameError = draft.siteName.trim() ? null : "Enter a name for your site.";
  const repoNameError = repoSlug ? null : "Enter a repository name.";
  const canSubmit = Boolean(draft.templateId && !siteNameError && !repoNameError);
  const themeLabel =
    draft.defaultTheme === "system"
      ? "Match each device"
      : draft.defaultTheme === "light"
        ? "Light"
        : "Dark";

  async function startProvisioning() {
    setValidationAttempted(true);
    if (!draft.templateId) {
      resetToGallery();
      return;
    }
    if (siteNameError) {
      siteNameRef.current?.focus();
      return;
    }
    if (repoNameError) {
      repoNameRef.current?.focus();
      return;
    }
    if (!canSubmit) return;
    // Provisioning is the first "real" operation — it needs the user's GitHub token. Anyone can get
    // this far unauthenticated (browsing + configuring), so bounce them through sign-in here and
    // bring them right back to this step (?resume=1) with their draft intact.
    if (!login) {
      window.location.href = `/api/auth/login?returnTo=${encodeURIComponent("/new?resume=1")}`;
      return;
    }
    setPhase("provisioning");
    setErrorMessage(null);
    setResult(null);
    setStepStatus(runningFirstStep());
    setStepMessage({});

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/sites/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          templateId: draft.templateId,
          siteName: draft.siteName.trim(),
          repoName: repoSlug,
          description: draft.description.trim(),
          private: draft.isPrivate,
          accent: accent.hex,
          defaultTheme: draft.defaultTheme,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "Provisioning failed." }));
        throw new Error(data.error ?? "Provisioning failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) handleEvent(JSON.parse(line) as ProvisionEvent);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrorMessage(error instanceof Error ? error.message : "Provisioning failed.");
      setPhase("error");
    }
  }

  function handleEvent(event: ProvisionEvent) {
    if (event.type === "step") {
      setStepStatus((prev) => ({ ...prev, [event.stepId]: event.status }));
      if (event.message) {
        setStepMessage((prev) => ({ ...prev, [event.stepId]: event.message }));
      }
    } else if (event.type === "done") {
      setResult(event.result);
      setPhase("done");
    } else if (event.type === "error") {
      setErrorMessage(event.message);
      setPhase("error");
    }
  }

  function resetToGallery() {
    abortRef.current?.abort();
    setPhase("choose");
    setValidationAttempted(false);
    setStepStatus(initialStepStatus());
    setStepMessage({});
    setResult(null);
    setErrorMessage(null);
  }

  function createAnother() {
    abortRef.current?.abort();
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setDraft(EMPTY_DRAFT);
    resetToGallery();
  }

  // ---- Render ----
  if (phase === "choose") {
    return (
      <div className="pw-wizard">
        <WizardProgress current={1} />
        <WizardHeading
          title="Choose a template"
          subtitle="Pick a starting point. You can customize everything after it's created."
        />
        <div className="pw-filterbar">
          <div className="pw-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              aria-label="Search templates"
            />
          </div>
          <div className="pw-chips" role="group" aria-label="Filter by type">
            <FilterChip active={category === "All"} onClick={() => setCategory("All")}>
              All
            </FilterChip>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <FilterChip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                {cat}
              </FilterChip>
            ))}
          </div>
        </div>

        {filteredTemplates.length === 0 ? (
          <p className="pw-wizard__empty">No templates match “{query}”.</p>
        ) : (
          <div className="pw-gallery" ref={galleryRef}>
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                blocks={previews[template.id]?.blocks}
                site={previews[template.id]?.site ?? undefined}
                onSelect={() => chooseTemplate(template.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === "configure" && selectedTemplate) {
    return (
      <div className="pw-wizard pw-wizard--configure">
        <WizardProgress current={2} />
        <div className="pw-configure__topline">
          <button type="button" className="pw-backlink" onClick={resetToGallery}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to templates</span>
          </button>
          <span className="pw-autosave">
            <Cloud size={15} aria-hidden="true" />
            Draft saved automatically
          </span>
        </div>
        <WizardHeading
          title="Set up your site"
          subtitle={`Start with ${selectedTemplate.name}. You can edit every page after it launches.`}
        />

        <div className="pw-configure__layout">
          <form
            className="pw-configure__form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void startProvisioning();
            }}
          >
            <section className="pw-setupcard" aria-labelledby="identity-heading">
              <SetupCardHeading
                number={1}
                id="identity-heading"
                title="Name and destination"
                description="Choose the name visitors see and where the source code lives."
              />
              <div className="pw-setupcard__body pw-form">
                <label className="pw-field" htmlFor="site-name">
                  <span className="pw-field__label">Site name</span>
                  <input
                    ref={siteNameRef}
                    id="site-name"
                    className="pw-input"
                    type="text"
                    value={draft.siteName}
                    onChange={(e) => onSiteNameChange(e.target.value)}
                    placeholder="My project"
                    maxLength={120}
                    required
                    aria-invalid={validationAttempted && Boolean(siteNameError)}
                    aria-describedby="site-name-help"
                  />
                  <span
                    id="site-name-help"
                    className={
                      validationAttempted && siteNameError
                        ? "pw-field__error"
                        : "pw-field__hint"
                    }
                    role={validationAttempted && siteNameError ? "alert" : undefined}
                  >
                    {validationAttempted && siteNameError
                      ? siteNameError
                      : "Used in the browser title and search results."}
                  </span>
                </label>

                <label className="pw-field" htmlFor="repo-name">
                  <span className="pw-field__label">Repository name</span>
                  <input
                    ref={repoNameRef}
                    id="repo-name"
                    className="pw-input pw-input--mono"
                    type="text"
                    value={draft.repoName}
                    onChange={(e) =>
                      patch({ repoName: slugifyRepoName(e.target.value), repoNameTouched: true })
                    }
                    placeholder="my-project"
                    maxLength={90}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={validationAttempted && Boolean(repoNameError)}
                    aria-describedby="repo-name-help"
                  />
                  <span
                    id="repo-name-help"
                    className={
                      validationAttempted && repoNameError
                        ? "pw-field__error"
                        : "pw-field__hint pw-field__hint--path"
                    }
                    role={validationAttempted && repoNameError ? "alert" : undefined}
                  >
                    {validationAttempted && repoNameError ? (
                      repoNameError
                    ) : (
                      <>
                        <GitHubMark size={13} />
                        github.com/{login ?? "your-account"}/{repoSlug || "your-site"}
                      </>
                    )}
                  </span>
                </label>

                <label className="pw-field pw-field--wide" htmlFor="site-description">
                  <span className="pw-field__label">
                    Description <span className="pw-field__opt">Optional</span>
                  </span>
                  <textarea
                    id="site-description"
                    className="pw-input pw-textarea"
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="What is this site about?"
                    rows={3}
                    maxLength={300}
                    aria-describedby="description-help"
                  />
                  <span className="pw-field__meta" id="description-help">
                    <span>Added to the repository and site metadata.</span>
                    <span>{draft.description.length}/300</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="pw-setupcard" aria-labelledby="appearance-heading">
              <SetupCardHeading
                number={2}
                id="appearance-heading"
                title="Look and feel"
                description="Set the starting palette. The editor keeps everything changeable."
              />
              <div className="pw-setupcard__body pw-setupcard__body--stacked">
                <fieldset className="pw-controlgroup">
                  <legend className="pw-field__label">Accent color</legend>
                  <div className="pw-colorchoices" role="radiogroup" aria-label="Accent color">
                    {ACCENT_PRESETS.map((preset) => {
                      const active = draft.accentId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          role="radio"
                          className={`pw-colorchoice${active ? " pw-colorchoice--active" : ""}`}
                          aria-checked={active}
                          onClick={() => patch({ accentId: preset.id })}
                        >
                          <span
                            className="pw-colorchoice__swatch"
                            style={{ background: preset.hsl }}
                            aria-hidden="true"
                          />
                          <span>{preset.label}</span>
                          {active ? (
                            <Check size={15} className="pw-colorchoice__check" aria-hidden="true" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="pw-controlgroup">
                  <legend className="pw-field__label">Default theme</legend>
                  <div
                    className="pw-choicegrid pw-choicegrid--three"
                    role="radiogroup"
                    aria-label="Default theme"
                  >
                    <ChoiceButton
                      active={draft.defaultTheme === "light"}
                      icon={<Sun size={17} aria-hidden="true" />}
                      title="Light"
                      description="Bright canvas"
                      onClick={() => patch({ defaultTheme: "light" })}
                    />
                    <ChoiceButton
                      active={draft.defaultTheme === "dark"}
                      icon={<Moon size={17} aria-hidden="true" />}
                      title="Dark"
                      description="Low-light canvas"
                      onClick={() => patch({ defaultTheme: "dark" })}
                    />
                    <ChoiceButton
                      active={draft.defaultTheme === "system"}
                      icon={<Monitor size={17} aria-hidden="true" />}
                      title="System"
                      description="Match each device"
                      onClick={() => patch({ defaultTheme: "system" })}
                    />
                  </div>
                </fieldset>
              </div>
            </section>

            <section className="pw-setupcard" aria-labelledby="visibility-heading">
              <SetupCardHeading
                number={3}
                id="visibility-heading"
                title="Publishing"
                description="Public is the simplest path to free GitHub Pages hosting."
              />
              <div className="pw-setupcard__body">
                <fieldset className="pw-controlgroup">
                  <legend className="pw-field__label">Repository visibility</legend>
                  <div
                    className="pw-choicegrid pw-choicegrid--two"
                    role="radiogroup"
                    aria-label="Repository visibility"
                  >
                    <ChoiceButton
                      active={!draft.isPrivate}
                      icon={<Globe size={17} aria-hidden="true" />}
                      title="Public"
                      description="Free GitHub Pages hosting"
                      badge="Recommended"
                      onClick={() => patch({ isPrivate: false })}
                    />
                    <ChoiceButton
                      active={draft.isPrivate}
                      icon={<Lock size={17} aria-hidden="true" />}
                      title="Private"
                      description="Requires a paid Pages plan"
                      onClick={() => patch({ isPrivate: true })}
                    />
                  </div>
                </fieldset>
              </div>
            </section>

            <div className="pw-launchbar">
              <div className="pw-launchbar__copy">
                <strong>{canSubmit ? "Ready to create" : "One detail needs attention"}</strong>
                <span id="launch-help">
                  {canSubmit
                    ? login
                      ? "Pagewright will create the repository and start deployment."
                      : "Sign in once, then Pagewright handles the entire setup."
                    : "Complete the highlighted field to continue."}
                </span>
              </div>
              <button
                type="submit"
                className="pw-btn pw-btn--primary pw-launchbar__button"
                aria-describedby="launch-help"
              >
                {login ? (
                  <>
                    <Rocket size={17} aria-hidden="true" />
                    Create site
                  </>
                ) : (
                  <>
                    <GitHubMark size={17} aria-hidden="true" />
                    Continue with GitHub
                  </>
                )}
              </button>
            </div>
          </form>

          <aside className="pw-configure__aside" aria-label="Site setup summary">
            <section className="pw-previewcard">
              <div className="pw-previewcard__head">
                <div>
                  <span className="pw-previewcard__label">Template preview</span>
                  <h2>{selectedTemplate.name}</h2>
                </div>
                <button type="button" className="pw-textbutton" onClick={resetToGallery}>
                  Change
                </button>
              </div>
              <div className="pw-previewcard__canvas">
                <TemplatePreview
                  blocks={previews[selectedTemplate.id]?.blocks}
                  site={previews[selectedTemplate.id]?.site ?? undefined}
                  name={selectedTemplate.name}
                  gradient={`linear-gradient(135deg, ${selectedTemplate.preview.from}, ${selectedTemplate.preview.to})`}
                />
              </div>
              <div className="pw-previewcard__path">
                <GitHubMark size={14} />
                <span>
                  {login ?? "your-account"}/{repoSlug || "your-site"}
                </span>
              </div>
              <dl className="pw-summary">
                <div>
                  <dt>Accent</dt>
                  <dd>
                    <span
                      className="pw-summary__swatch"
                      style={{ background: accent.hsl }}
                      aria-hidden="true"
                    />
                    {accent.label}
                  </dd>
                </div>
                <div>
                  <dt>Theme</dt>
                  <dd>{themeLabel}</dd>
                </div>
                <div>
                  <dt>Visibility</dt>
                  <dd>{draft.isPrivate ? "Private" : "Public"}</dd>
                </div>
              </dl>
            </section>

            <section className="pw-assurance">
              <div className="pw-assurance__head">
                <ShieldCheck size={19} aria-hidden="true" />
                <h2>Handled for you</h2>
              </div>
              <ul>
                <li>
                  <CheckCircle2 size={17} aria-hidden="true" />
                  <span>
                    <strong>Repository</strong>
                    <small>Created with the right files and settings.</small>
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={17} aria-hidden="true" />
                  <span>
                    <strong>GitHub Pages</strong>
                    <small>Configured for the selected visibility.</small>
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={17} aria-hidden="true" />
                  <span>
                    <strong>First deployment</strong>
                    <small>Started automatically and tracked live.</small>
                  </span>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  if (phase === "provisioning" || phase === "done") {
    return (
      <div className="pw-wizard">
        <WizardProgress current={3} />
        <WizardHeading
          title={phase === "done" ? "Your site is ready" : "Creating your site"}
          subtitle={
            phase === "done"
              ? "Everything is set up. The first deployment usually finishes within a minute."
              : "Pagewright is creating the repository and starting its first deployment."
          }
        />

        <ol className="pw-provision">
          {PROVISION_STEPS.map((step) => {
            const status = stepStatus[step.id];
            return (
              <li key={step.id} className={`pw-pstep pw-pstep--${status}`}>
                <span className="pw-pstep__icon" aria-hidden="true">
                  <StepIcon status={status} />
                </span>
                <span className="pw-pstep__text">
                  <span className="pw-pstep__label">{step.label}</span>
                  <span className="pw-pstep__hint">{stepMessage[step.id] ?? step.hint}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {phase === "done" && result ? (
          <CompletionCard result={result} onCreateAnother={createAnother} />
        ) : null}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="pw-wizard">
        <WizardProgress current={3} />
        <div className="pw-provision-error">
          <span className="pw-provision-error__icon" aria-hidden="true">
            <XCircle size={28} />
          </span>
          <h2 className="pw-provision-error__title">We hit a snag</h2>
          <p className="pw-provision-error__body">
            {errorMessage ?? "Something went wrong while creating your site."}
          </p>
          <div className="pw-wizard__actions">
            <button
              type="button"
              className="pw-btn pw-btn--primary"
              onClick={() => setPhase("configure")}
            >
              <RefreshCw size={16} aria-hidden="true" /> Try again
            </button>
            <button type="button" className="pw-btn" onClick={resetToGallery}>
              Back to templates
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback (e.g. configure with no template) — send the user back to the gallery.
  return (
    <div className="pw-wizard">
      <button type="button" className="pw-btn pw-btn--primary" onClick={resetToGallery}>
        Choose a template
      </button>
    </div>
  );
}

// ---- Small presentational helpers ----

function initialStepStatus(): Record<ProvisionStepId, ProvisionStepStatus> {
  return {
    "create-repo": "pending",
    "commit-files": "pending",
    "enable-pages": "pending",
    "trigger-build": "pending",
  };
}

function runningFirstStep(): Record<ProvisionStepId, ProvisionStepStatus> {
  return { ...initialStepStatus(), "create-repo": "running" };
}

function StepIcon({ status }: { status: ProvisionStepStatus }) {
  if (status === "done") return <CheckCircle2 size={20} />;
  if (status === "error") return <XCircle size={20} />;
  if (status === "running") return <Loader2 size={20} className="pw-spin" />;
  return <Circle size={20} />;
}

function WizardProgress({ current }: { current: 1 | 2 | 3 }) {
  const stages = ["Template", "Details", "Publish"];

  return (
    <nav className="pw-wizardprogress" aria-label="Site creation progress">
      <ol>
        {stages.map((stage, index) => {
          const number = index + 1;
          const complete = number < current;
          const active = number === current;
          return (
            <li
              key={stage}
              className={`pw-wizardprogress__item${
                active ? " pw-wizardprogress__item--active" : ""
              }${complete ? " pw-wizardprogress__item--complete" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span className="pw-wizardprogress__marker" aria-hidden="true">
                {complete ? <Check size={14} /> : number}
              </span>
              <span>{stage}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function WizardHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pw-wizard__heading">
      <h1 className="pw-wizard__title">{title}</h1>
      <p className="pw-wizard__subtitle">{subtitle}</p>
    </div>
  );
}

function SetupCardHeading({
  number,
  id,
  title,
  description,
}: {
  number: number;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <header className="pw-setupcard__head">
      <span className="pw-setupcard__number" aria-hidden="true">
        {number}
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`pw-filterchip${active ? " pw-filterchip--active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ChoiceButton({
  active,
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      className={`pw-choice${active ? " pw-choice--active" : ""}`}
      aria-checked={active}
      onClick={onClick}
    >
      <span className="pw-choice__icon">{icon}</span>
      <span className="pw-choice__copy">
        <span className="pw-choice__title">
          {title}
          {badge ? <span className="pw-choice__badge">{badge}</span> : null}
        </span>
        <span className="pw-choice__description">{description}</span>
      </span>
      <span className="pw-choice__indicator" aria-hidden="true">
        {active ? <Check size={13} /> : null}
      </span>
    </button>
  );
}

function CompletionCard({
  result,
  onCreateAnother,
}: {
  result: ProvisionResult;
  onCreateAnother: () => void;
}) {
  return (
    <div className="pw-congrats">
      <span className="pw-congrats__icon" aria-hidden="true">
        <Rocket size={26} />
      </span>
      <h2 className="pw-congrats__title">{result.fullName} is on its way</h2>
      <p className="pw-congrats__body">
        Pagewright created your repository, pushed the site and deploy workflows, and enabled GitHub
        Pages. Your first build is running now.
      </p>
      <div className="pw-congrats__links">
        {result.pagesUrl ? (
          <a
            className="pw-linkpill"
            href={result.pagesUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Globe size={14} aria-hidden="true" /> Live site
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
        <a className="pw-linkpill" href={result.htmlUrl} target="_blank" rel="noreferrer">
          <GitHubMark size={14} /> Repository
          <ExternalLink size={12} aria-hidden="true" />
        </a>
        {result.runUrl ? (
          <a className="pw-linkpill" href={result.runUrl} target="_blank" rel="noreferrer">
            <Loader2 size={14} aria-hidden="true" /> Deployment
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <div className="pw-wizard__actions">
        <Link
          className="pw-btn pw-btn--primary"
          href={`/sites/${result.owner}/${result.repo}`}
        >
          <LayoutDashboard size={16} aria-hidden="true" /> View deployment
        </Link>
        <Link className="pw-btn" href="/dashboard">
          Go to dashboard
        </Link>
        <button type="button" className="pw-btn pw-btn--ghost" onClick={onCreateAnother}>
          Create another
        </button>
      </div>
    </div>
  );
}
