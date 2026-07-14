"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";

type UpdateState = "idle" | "updating" | "done" | "error";

export function SiteRuntimeUpdate({ owner, repo }: { owner: string; repo: string }) {
  const [state, setState] = useState<UpdateState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [commitUrl, setCommitUrl] = useState<string | null>(null);

  async function runUpdate() {
    setState("updating");
    setMessage(null);
    setCommitUrl(null);
    try {
      const response = await fetch(`/api/sites/${owner}/${repo}/runtime-update`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; commitUrl?: string }
        | null;
      if (!response.ok) {
        setState("error");
        setMessage(body?.error ?? "Couldn’t update the site runtime.");
        return;
      }
      setState("done");
      setCommitUrl(body?.commitUrl ?? null);
      setMessage("Runtime updated — your site is deploying. Refreshing settings…");
      // The runtime file now exists on the default branch, so a reload unlocks the full settings
      // form. Give the success state a beat to register before refreshing.
      window.setTimeout(() => window.location.reload(), 1600);
    } catch {
      setState("error");
      setMessage("Network error while updating the site runtime.");
    }
  }

  return (
    <div className="pw-runtime-update" aria-live="polite">
      <button
        type="button"
        className="pw-btn pw-btn--primary"
        onClick={() => void runUpdate()}
        disabled={state === "updating" || state === "done"}
      >
        {state === "updating" ? (
          <Loader2 className="pw-spin" size={16} aria-hidden="true" />
        ) : state === "done" ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <RefreshCw size={16} aria-hidden="true" />
        )}
        {state === "updating"
          ? "Updating…"
          : state === "done"
            ? "Runtime updated"
            : "Update site runtime"}
      </button>
      {message ? (
        <p
          className={`pw-runtime-update__message${state === "error" ? " is-error" : ""}`}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
          {commitUrl ? (
            <>
              {" "}
              <a href={commitUrl} target="_blank" rel="noopener noreferrer">
                View change <ExternalLink size={13} aria-hidden="true" />
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
