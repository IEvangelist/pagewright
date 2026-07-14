"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";

type UpdateState = "idle" | "requesting" | "requested" | "error";

export function SiteRuntimeUpdate({ owner, repo }: { owner: string; repo: string }) {
  const [state, setState] = useState<UpdateState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);

  async function requestUpdate() {
    setState("requesting");
    setMessage(null);
    setPullRequestUrl(null);
    try {
      const response = await fetch(`/api/sites/${owner}/${repo}/runtime-update`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pullRequestUrl?: string }
        | null;
      if (!response.ok) {
        setState("error");
        setMessage(body?.error ?? "Couldn’t request the runtime update.");
        return;
      }
      setState("requested");
      setPullRequestUrl(body?.pullRequestUrl ?? null);
      setMessage("Merge the Pagewright update pull request, then reload this page.");
    } catch {
      setState("error");
      setMessage("Network error while requesting the runtime update.");
    }
  }

  return (
    <div className="pw-runtime-update" aria-live="polite">
      <button
        type="button"
        className="pw-btn pw-btn--primary"
        onClick={() => void requestUpdate()}
        disabled={state === "requesting" || state === "requested"}
      >
        {state === "requesting" ? (
          <Loader2 className="pw-spin" size={16} aria-hidden="true" />
        ) : state === "requested" ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <RefreshCw size={16} aria-hidden="true" />
        )}
        {state === "requesting"
          ? "Requesting update…"
          : state === "requested"
            ? "Update requested"
            : "Update site runtime"}
      </button>
      {message ? (
        <p
          className={`pw-runtime-update__message${state === "error" ? " is-error" : ""}`}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
          {pullRequestUrl ? (
            <>
              {" "}
              <a href={pullRequestUrl} target="_blank" rel="noopener noreferrer">
                Review update PR <ExternalLink size={13} aria-hidden="true" />
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
