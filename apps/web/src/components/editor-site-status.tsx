"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import { isDeployTerminal, type DeployStatus } from "@/lib/deploy/status";

const POLL_MS = 2500;
const MAX_POLLS = 240;
const MAX_NONE_POLLS = 24;

export type EditorSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

type StatusTone = "idle" | "working" | "success" | "dirty" | "error";

function formatLocalTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";

  const now = new Date();
  const sameDay =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();

  return new Intl.DateTimeFormat(
    undefined,
    sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  ).format(value);
}

function formatFullLocalTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function isTargetPending(
  status: DeployStatus,
  targetHeadSha: string | null,
  branchBeforeTarget: string | null,
  targetObserved: boolean,
): boolean {
  if (status.branchHeadSha !== null && status.run?.headSha !== status.branchHeadSha) return true;
  if (targetHeadSha === null || status.run?.headSha === targetHeadSha) return false;

  if (status.branchHeadSha === null || status.branchHeadSha === targetHeadSha) return true;

  // A different branch head only supersedes the target after the branch has moved beyond the
  // pre-save snapshot (or after the target itself was observed). Otherwise this may still be the
  // retained snapshot from immediately before the save response arrived.
  return !(
    targetObserved ||
    (branchBeforeTarget !== null && status.branchHeadSha !== branchBeforeTarget)
  );
}

export function EditorSiteStatus({
  owner,
  repo,
  saveState,
  saveMessage,
  dirty,
  restored,
  uploading = 0,
  targetHeadSha,
}: {
  owner: string;
  repo: string;
  saveState: EditorSaveState;
  saveMessage: string | null;
  dirty: boolean;
  restored?: boolean;
  uploading?: number;
  targetHeadSha: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pollCycle, setPollCycle] = useState(0);
  const [monitorTimedOut, setMonitorTimedOut] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [targetCommittedAt, setTargetCommittedAt] = useState<string | null>(null);
  const statusUrl = `/api/sites/${owner}/${repo}/deploy-status`;
  const targetContextRef = useRef<{
    headSha: string | null;
    branchBeforeTarget: string | null;
    observed: boolean;
  }>({
    headSha: targetHeadSha,
    branchBeforeTarget: null,
    observed: false,
  });

  if (targetContextRef.current.headSha !== targetHeadSha) {
    targetContextRef.current = {
      headSha: targetHeadSha,
      branchBeforeTarget: status?.branchHeadSha ?? null,
      observed: false,
    };
  }

  const loadStatus = useCallback(
    async (signal?: AbortSignal): Promise<DeployStatus> => {
      const response = await fetch(statusUrl, { cache: "no-store", signal });
      const body = (await response.json().catch(() => null)) as
        | DeployStatus
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Could not refresh the deployment status.",
        );
      }
      return body as DeployStatus;
    },
    [statusUrl],
  );

  useEffect(() => {
    if (targetHeadSha) setTargetCommittedAt(new Date().toISOString());
  }, [targetHeadSha]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let nonePolls = 0;

    const tick = async () => {
      if (controller.signal.aborted) return;

      try {
        const next = await loadStatus(controller.signal);
        if (controller.signal.aborted) return;

        setStatus(next);
        setStatusError(null);
        setChecking(false);
        polls++;
        nonePolls = next.phase === "none" ? nonePolls + 1 : 0;

        const targetContext = targetContextRef.current;
        if (
          targetHeadSha !== null &&
          targetContext.headSha === targetHeadSha &&
          (next.branchHeadSha === targetHeadSha || next.run?.headSha === targetHeadSha)
        ) {
          targetContext.observed = true;
        }
        const waitingForTarget = isTargetPending(
          next,
          targetHeadSha,
          targetContext.branchBeforeTarget,
          targetContext.observed,
        );
        const shouldContinue =
          waitingForTarget ||
          (!isDeployTerminal(next.phase) &&
            !(targetHeadSha === null && next.phase === "none" && nonePolls >= MAX_NONE_POLLS));

        if (shouldContinue && polls < MAX_POLLS) {
          timer = setTimeout(tick, POLL_MS);
        } else if (shouldContinue) {
          setMonitorTimedOut(true);
          setStatusError(
            "Deployment status is taking longer than expected. Click the status to try again.",
          );
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setChecking(false);
        setStatusError(
          error instanceof Error ? error.message : "Could not refresh the deployment status.",
        );
        polls++;
        if (polls < MAX_POLLS) {
          timer = setTimeout(tick, POLL_MS);
        } else {
          setMonitorTimedOut(true);
        }
      }
    };

    setChecking(true);
    setMonitorTimedOut(false);
    void tick();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [loadStatus, pollCycle, targetHeadSha]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setMonitorTimedOut(false);
    setStatusError(null);
    try {
      const next = await loadStatus();
      const targetContext = targetContextRef.current;
      if (
        targetHeadSha !== null &&
        targetContext.headSha === targetHeadSha &&
        (next.branchHeadSha === targetHeadSha || next.run?.headSha === targetHeadSha)
      ) {
        targetContext.observed = true;
      }
      setStatus(next);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Could not refresh the deployment status.",
      );
    } finally {
      setRefreshing(false);
      setPollCycle((cycle) => cycle + 1);
      router.refresh();
    }
  }, [loadStatus, refreshing, router, targetHeadSha]);

  const targetContext = targetContextRef.current;
  const targetPending = status
    ? isTargetPending(
        status,
        targetHeadSha,
        targetContext.branchBeforeTarget,
        targetContext.observed,
      )
    : targetHeadSha !== null;
  const targetMatched = !targetPending;
  const deploying =
    !monitorTimedOut &&
    (targetPending || status?.phase === "queued" || status?.phase === "building");
  const failed = targetMatched && status?.phase === "failed";
  const updatedAt = status?.run?.updatedAt ?? null;

  let tone: StatusTone = "idle";
  let label = "Check status";
  let secondary: string | null = null;
  let displayTime: string | null = null;
  let icon: "alert" | "check" | "cloud" | "loader" | "refresh" = "refresh";
  let animated = false;

  if (refreshing) {
    tone = "working";
    label = "Refreshing";
    icon = "refresh";
    animated = true;
  } else if (saveState === "saving") {
    tone = "working";
    label = "Saving";
    icon = "loader";
    animated = true;
  } else if (uploading > 0) {
    tone = "working";
    label = "Uploading";
    secondary = `${uploading} image${uploading === 1 ? "" : "s"}`;
    icon = "loader";
    animated = true;
  } else if (saveState === "conflict") {
    tone = "error";
    label = "Version conflict";
    icon = "alert";
  } else if (saveState === "error") {
    tone = "error";
    label = "Save failed";
    icon = "alert";
  } else if (monitorTimedOut) {
    tone = "error";
    label = "Deploy status delayed";
    icon = "alert";
  } else if (failed) {
    tone = "error";
    label = "Deploy failed";
    icon = "alert";
    displayTime = updatedAt;
  } else if (deploying) {
    tone = "working";
    label = "Deploying";
    icon = "refresh";
    animated = true;
    displayTime = targetCommittedAt ?? status?.run?.createdAt ?? null;
    secondary = dirty ? "Unsaved edits" : null;
  } else if (dirty) {
    tone = "dirty";
    label = restored ? "Unsaved draft" : "Unsaved";
    icon = "cloud";
    displayTime = updatedAt;
  } else if (targetMatched && status?.phase === "success" && updatedAt) {
    tone = "success";
    label = "Updated";
    icon = "check";
    displayTime = updatedAt;
  } else if (checking) {
    label = "Checking site";
    icon = "loader";
    animated = true;
  } else if (statusError && !status) {
    tone = "error";
    label = "Status unavailable";
    icon = "alert";
  }

  if (!secondary && displayTime) secondary = formatLocalTime(displayTime);

  const fullTime = displayTime ? formatFullLocalTime(displayTime) : "";
  const relevantSaveMessage =
    saveState === "error" || saveState === "conflict" ? saveMessage : null;
  const details = [
    relevantSaveMessage,
    statusError,
    fullTime ? `${label} ${fullTime}` : label,
    "Click to refresh the page and deployment status.",
  ]
    .filter(Boolean)
    .join(" ");
  const Icon =
    icon === "alert"
      ? AlertCircle
      : icon === "check"
        ? Check
        : icon === "cloud"
          ? CloudUpload
          : icon === "loader"
            ? Loader2
            : RefreshCw;
  const visibleError =
    saveState === "error"
      ? saveMessage
      : monitorTimedOut || (statusError && !status)
        ? statusError
        : null;

  return (
    <span className="pw-update-status-wrap">
      <button
          type="button"
          className={`pw-update-status pw-update-status--${tone}`}
          onClick={() => void refresh()}
          disabled={refreshing}
          title={details}
          aria-label={details}
      >
          <Icon
            size={14}
            className={animated ? "pw-spin" : undefined}
            aria-hidden="true"
          />
          <span className="pw-update-status__copy" aria-live="polite">
            <span className="pw-update-status__label">{label}</span>
            {secondary ? (
              displayTime && secondary !== "Unsaved edits" ? (
            <time className="pw-update-status__time" dateTime={displayTime}>
              {secondary}
            </time>
              ) : (
            <span className="pw-update-status__time">{secondary}</span>
              )
            ) : null}
          </span>
      </button>
      {visibleError ? (
          <span className="pw-update-status__error-detail" role="alert">
            {visibleError}
          </span>
      ) : null}
    </span>
  );
}
