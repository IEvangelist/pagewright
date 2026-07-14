"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
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
  Sun,
  XCircle,
} from "lucide-react";
import type { Block } from "@pagewright/blocks";
import { GitHubMark } from "@/components/icons/github-mark";
import { TemplateCard } from "@/components/template-card";
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
  previews?: Record<string, Block[]>;
}) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);

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

  const repoSlug = draft.repoName || slugifyRepoName(draft.siteName);
  const canSubmit = Boolean(draft.templateId && draft.siteName.trim() && repoSlug);

  async function startProvisioning() {
    if (!draft.templateId || !canSubmit) return;
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
        <WizardHeading
          step={1}
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
                blocks={previews[template.id]}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === "configure" && selectedTemplate) {
    return (
      <div className="pw-wizard">
        <button type="button" className="pw-backlink" onClick={resetToGallery}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Choose a different template</span>
        </button>
        <WizardHeading
          step={2}
          title={`Configure your ${selectedTemplate.name.toLowerCase()}`}
          subtitle="A few details and Pagewright will provision everything for you."
        />

        <div className="pw-form">
          <label className="pw-field">
            <span className="pw-field__label">Site name</span>
            <input
              className="pw-input"
              type="text"
              value={draft.siteName}
              onChange={(e) => onSiteNameChange(e.target.value)}
              placeholder="My Awesome Site"
              maxLength={120}
            />
            <span className="pw-field__hint">Shown as your site title and in search results.</span>
          </label>

          <label className="pw-field">
            <span className="pw-field__label">Repository name</span>
            <input
              className="pw-input"
              type="text"
              value={draft.repoName}
              onChange={(e) =>
                patch({ repoName: slugifyRepoName(e.target.value), repoNameTouched: true })
              }
              placeholder="my-awesome-site"
              maxLength={90}
            />
            <span className="pw-field__hint">
              <GitHubMark size={13} /> github.com/{login ?? "your-account"}/{repoSlug || "…"}
            </span>
          </label>

          <label className="pw-field">
            <span className="pw-field__label">
              Description <span className="pw-field__opt">(optional)</span>
            </span>
            <textarea
              className="pw-input pw-textarea"
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="A short line about your site."
              rows={2}
              maxLength={300}
            />
          </label>

          <div className="pw-field">
            <span className="pw-field__label">Accent color</span>
            <div className="pw-swatches" role="group" aria-label="Accent color">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`pw-swatch${draft.accentId === preset.id ? " pw-swatch--active" : ""}`}
                  style={{ background: preset.hsl }}
                  aria-label={preset.label}
                  aria-pressed={draft.accentId === preset.id}
                  title={preset.label}
                  onClick={() => patch({ accentId: preset.id })}
                >
                  {draft.accentId === preset.id ? (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="pw-field">
            <span className="pw-field__label">Default theme</span>
            <div className="pw-seg" role="group" aria-label="Default theme">
              <SegButton
                active={draft.defaultTheme === "light"}
                onClick={() => patch({ defaultTheme: "light" })}
              >
                <Sun size={15} aria-hidden="true" /> Light
              </SegButton>
              <SegButton
                active={draft.defaultTheme === "dark"}
                onClick={() => patch({ defaultTheme: "dark" })}
              >
                <Moon size={15} aria-hidden="true" /> Dark
              </SegButton>
              <SegButton
                active={draft.defaultTheme === "system"}
                onClick={() => patch({ defaultTheme: "system" })}
              >
                <Monitor size={15} aria-hidden="true" /> System
              </SegButton>
            </div>
          </div>

          <div className="pw-field">
            <span className="pw-field__label">Visibility</span>
            <div className="pw-seg" role="group" aria-label="Repository visibility">
              <SegButton active={!draft.isPrivate} onClick={() => patch({ isPrivate: false })}>
                <Globe size={15} aria-hidden="true" /> Public
              </SegButton>
              <SegButton active={draft.isPrivate} onClick={() => patch({ isPrivate: true })}>
                <Lock size={15} aria-hidden="true" /> Private
              </SegButton>
            </div>
            <span className="pw-field__hint">
              {draft.isPrivate
                ? "Private repos need GitHub Pages on a paid plan to go live."
                : "Recommended. Free GitHub Pages hosting works with public repos."}
            </span>
          </div>
        </div>

        <div className="pw-wizard__actions">
          <button
            type="button"
            className="pw-btn pw-btn--primary"
            disabled={!canSubmit}
            onClick={startProvisioning}
          >
            {login ? (
              <>
                <Rocket size={16} aria-hidden="true" />
                Create &amp; deploy site
              </>
            ) : (
              <>
                <GitHubMark size={16} aria-hidden="true" />
                Sign in to create site
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "provisioning" || phase === "done") {
    return (
      <div className="pw-wizard">
        <WizardHeading
          step={3}
          title={phase === "done" ? "Your site is live-bound!" : "Provisioning your site"}
          subtitle={
            phase === "done"
              ? "Everything's set up. The first deployment finishes in about a minute."
              : "Hang tight. This usually takes a few seconds."
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

function WizardHeading({
  step,
  title,
  subtitle,
}: {
  step: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="pw-wizard__heading">
      <span className="pw-wizard__step">Step {step} of 3</span>
      <h1 className="pw-wizard__title">{title}</h1>
      <p className="pw-wizard__subtitle">{subtitle}</p>
    </div>
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

function SegButton({
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
      className={`pw-seg__btn${active ? " pw-seg__btn--active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
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
