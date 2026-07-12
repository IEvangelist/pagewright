"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  PartyPopper,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { GitHubMark } from "@/components/icons/github-mark";
import {
  flattenSteps,
  isDeployTerminal,
  type DeployJob,
  type DeployPhase,
  type DeployStatus,
  type DeployStep,
} from "@/lib/deploy/status";
import type { WorkflowRunConclusion, WorkflowRunStatus } from "@pagewright/github";

const POLL_MS = 2500;
/** Hard cap so a repo that never deploys doesn't poll forever. ~10 min at POLL_MS. */
const MAX_POLLS = 240;
/** Stop early if we never even see a run appear. */
const MAX_NONE_POLLS = 24;

type StepState = "done" | "running" | "failed" | "pending";

interface PhasePresentation {
  tone: "progress" | "success" | "failed" | "idle";
  title: string;
  body: string;
  icon: ReactNode;
  spin?: boolean;
}

function stepState(status: WorkflowRunStatus, conclusion: WorkflowRunConclusion): StepState {
  if (status === "completed") {
    if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped") {
      return "done";
    }
    if (conclusion === null) return "done";
    return "failed";
  }
  if (status === "in_progress") return "running";
  return "pending";
}

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return <CheckCircle2 size={16} className="pw-deploy__ic pw-deploy__ic--done" aria-hidden="true" />;
    case "running":
      return (
        <Loader2 size={16} className="pw-deploy__ic pw-deploy__ic--run pw-spin" aria-hidden="true" />
      );
    case "failed":
      return <XCircle size={16} className="pw-deploy__ic pw-deploy__ic--fail" aria-hidden="true" />;
    default:
      return <Circle size={16} className="pw-deploy__ic pw-deploy__ic--idle" aria-hidden="true" />;
  }
}

function phasePresentation(status: DeployStatus): PhasePresentation {
  const phase: DeployPhase = status.phase;
  switch (phase) {
    case "success":
      return {
        tone: "success",
        title: "Your site is live",
        body: status.liveUrl
          ? "The latest build finished and your site is published to GitHub Pages."
          : "The latest build finished successfully.",
        icon: <PartyPopper size={22} aria-hidden="true" />,
      };
    case "failed":
      return {
        tone: "failed",
        title: "Deployment didn’t finish",
        body: "The latest run stopped before publishing. Review the steps below or retry the deploy.",
        icon: <XCircle size={22} aria-hidden="true" />,
      };
    case "queued":
      return {
        tone: "progress",
        title: "Deployment queued",
        body: "GitHub is starting your build. This view updates automatically.",
        icon: <Loader2 size={22} aria-hidden="true" />,
        spin: true,
      };
    case "building":
      return {
        tone: "progress",
        title: "Deploying your site",
        body: "Building the Astro site and publishing it to GitHub Pages. This usually takes a minute.",
        icon: <Loader2 size={22} aria-hidden="true" />,
        spin: true,
      };
    default:
      return {
        tone: "idle",
        title: "Waiting for the first build",
        body: "No deploy run has started yet. It will appear here as soon as GitHub picks it up.",
        icon: <Clock size={22} aria-hidden="true" />,
      };
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Live deployment progress for a site. Server-rendered with an initial snapshot (so a reload shows
 * the correct state immediately), then polls the deploy-status endpoint until the deployment
 * reaches a terminal phase. Shows ordered, expandable steps, deep links, a congratulatory
 * completion, and a retry/redeploy action.
 */
export function DeployProgress({ initial }: { initial: DeployStatus }) {
  const [status, setStatus] = useState<DeployStatus>(initial);
  const [live, setLive] = useState<boolean>(!isDeployTerminal(initial.phase));
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [redeploying, setRedeploying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const statusUrl = `/api/sites/${status.owner}/${status.repo}/deploy-status`;
  const deployUrl = `/api/sites/${status.owner}/${status.repo}/deploy`;

  useEffect(() => {
    activeRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;

    const tick = async () => {
      if (!activeRef.current) return;
      try {
        const res = await fetch(statusUrl, { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as DeployStatus;
          if (!activeRef.current) return;
          setStatus(next);
          polls += 1;
          const stop =
            isDeployTerminal(next.phase) ||
            polls >= MAX_POLLS ||
            (next.phase === "none" && polls >= MAX_NONE_POLLS);
          if (stop) {
            setLive(false);
            return;
          }
        }
      } catch {
        // Transient network error — keep polling within the bounded loop.
      }
      if (activeRef.current) timer = setTimeout(tick, POLL_MS);
    };

    setLive(true);
    timer = setTimeout(tick, POLL_MS);

    return () => {
      activeRef.current = false;
      if (timer) clearTimeout(timer);
    };
    // reloadKey forces a fresh polling cycle after a manual redeploy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const toggleStep = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const redeploy = useCallback(async () => {
    setRedeploying(true);
    setActionError(null);
    try {
      const res = await fetch(deployUrl, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setActionError(data?.error ?? "Couldn’t start a deploy. Try again in a moment.");
        return;
      }
      // Optimistically flip to a running state and restart the polling cycle.
      setStatus((s) => ({ ...s, phase: "queued" }));
      setReloadKey((k) => k + 1);
    } catch {
      setActionError("Network error while starting the deploy.");
    } finally {
      setRedeploying(false);
    }
  }, [deployUrl]);

  const pres = phasePresentation(status);
  const steps = useMemo(() => flattenSteps(status.jobs), [status.jobs]);
  const doneCount = steps.filter(
    (s) => stepState(s.status, s.conclusion) === "done",
  ).length;
  const canRetry = status.phase === "failed" || status.phase === "success";

  return (
    <section className={`pw-deploy pw-deploy--${pres.tone}`} aria-live="polite">
      <div className="pw-deploy__banner">
        <span className={`pw-deploy__badge pw-deploy__badge--${pres.tone}`} aria-hidden="true">
          <span className={pres.spin ? "pw-spin" : undefined}>{pres.icon}</span>
        </span>
        <div className="pw-deploy__bannercopy">
          <h2 className="pw-deploy__title">{pres.title}</h2>
          <p className="pw-deploy__body">{pres.body}</p>
        </div>
        {live ? (
          <span className="pw-deploy__livepill" title="Auto-refreshing">
            <span className="pw-deploy__livedot" aria-hidden="true" />
            Live
          </span>
        ) : null}
      </div>

      <div className="pw-deploy__links">
        {status.liveUrl ? (
          <a className="pw-linkpill" href={status.liveUrl} target="_blank" rel="noreferrer">
            <Globe size={14} aria-hidden="true" />
            <span>Live site</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
        <a className="pw-linkpill" href={status.repoUrl} target="_blank" rel="noreferrer">
          <GitHubMark size={14} aria-hidden="true" />
          <span>Repository</span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
        {status.run ? (
          <a className="pw-linkpill" href={status.run.htmlUrl} target="_blank" rel="noreferrer">
            <span>Actions run #{status.run.runNumber}</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {status.run ? (
        <div className="pw-deploy__meta">
          <span>
            {steps.length > 0
              ? `${doneCount} of ${steps.length} steps complete`
              : "Run in progress"}
          </span>
          <span className="pw-deploy__metadot" aria-hidden="true">
            •
          </span>
          <span>
            {status.run.event} · started {relativeTime(status.run.createdAt)}
          </span>
        </div>
      ) : null}

      {status.jobs.length > 0 ? (
        <div className="pw-deploy__jobs">
          {status.jobs.map((job) => (
            <DeployJobView
              key={job.id}
              job={job}
              runUrl={status.run?.htmlUrl ?? status.repoUrl}
              expanded={expanded}
              onToggle={toggleStep}
              showJobHeader={status.jobs.length > 1}
            />
          ))}
        </div>
      ) : status.phase === "none" ? (
        <div className="pw-deploy__pending">
          <Loader2 size={16} className="pw-spin" aria-hidden="true" />
          <span>Waiting for GitHub Actions to report the first run…</span>
        </div>
      ) : null}

      {status.phase === "success" ? (
        <div className="pw-deploy__congrats">
          <PartyPopper size={18} aria-hidden="true" />
          <span>
            All done — {status.liveUrl ? "your site is published." : "your build succeeded."}
          </span>
        </div>
      ) : null}

      {actionError ? <p className="pw-deploy__error">{actionError}</p> : null}

      {canRetry ? (
        <div className="pw-deploy__actions">
          <button
            type="button"
            className="pw-btn"
            onClick={redeploy}
            disabled={redeploying}
          >
            {redeploying ? (
              <Loader2 size={16} className="pw-spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            {status.phase === "failed" ? "Retry deploy" : "Redeploy"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DeployJobView({
  job,
  runUrl,
  expanded,
  onToggle,
  showJobHeader,
}: {
  job: DeployJob;
  runUrl: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  showJobHeader: boolean;
}) {
  const jobState = stepState(job.status, job.conclusion);
  return (
    <div className="pw-deploy__job">
      {showJobHeader ? (
        <div className="pw-deploy__jobhead">
          <StepIcon state={jobState} />
          <span className="pw-deploy__jobname">{job.name}</span>
        </div>
      ) : null}
      <ol className="pw-deploy__steps">
        {job.steps.map((step) => (
          <DeployStepView
            key={`${job.id}:${step.number}`}
            stepKey={`${job.id}:${step.number}`}
            step={step}
            jobUrl={job.htmlUrl ?? runUrl}
            open={expanded.has(`${job.id}:${step.number}`)}
            onToggle={onToggle}
          />
        ))}
      </ol>
    </div>
  );
}

function DeployStepView({
  stepKey,
  step,
  jobUrl,
  open,
  onToggle,
}: {
  stepKey: string;
  step: DeployStep;
  jobUrl: string;
  open: boolean;
  onToggle: (key: string) => void;
}) {
  const state = stepState(step.status, step.conclusion);
  const detailId = `deploystep-${stepKey.replace(":", "-")}`;
  return (
    <li className={`pw-deploy__step pw-deploy__step--${state}`}>
      <button
        type="button"
        className="pw-deploy__steprow"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => onToggle(stepKey)}
      >
        <StepIcon state={state} />
        <span className="pw-deploy__stepname">{step.name}</span>
        <span className={`pw-deploy__statepill pw-deploy__statepill--${state}`}>
          {stepStateLabel(state)}
        </span>
        <ChevronRight
          size={15}
          className={`pw-deploy__chevron${open ? " pw-deploy__chevron--open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={detailId} className="pw-deploy__stepdetail">
          <dl className="pw-deploy__kv">
            <div>
              <dt>Status</dt>
              <dd>{step.status.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt>Conclusion</dt>
              <dd>{step.conclusion ?? "—"}</dd>
            </div>
            <div>
              <dt>Step</dt>
              <dd>#{step.number}</dd>
            </div>
          </dl>
          <a className="pw-deploy__steplink" href={jobUrl} target="_blank" rel="noreferrer">
            View logs on GitHub
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </li>
  );
}

function stepStateLabel(state: StepState): string {
  switch (state) {
    case "done":
      return "Done";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}
