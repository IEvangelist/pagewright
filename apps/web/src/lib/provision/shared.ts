import type { TemplateId } from "@pagewright/registry";

/**
 * Types and helpers shared by the provisioning route (server) and the new-site wizard (client).
 * Everything here is pure data with no server-only or filesystem dependencies, so it is safe to
 * import from a "use client" component.
 */

export type ProvisionStepId =
  | "create-repo"
  | "commit-files"
  | "enable-pages"
  | "trigger-build";

export type ProvisionStepStatus = "pending" | "running" | "done" | "error";

export interface ProvisionStepInfo {
  id: ProvisionStepId;
  label: string;
  hint: string;
}

/** The ordered steps a provisioning run walks through, used to render the live progress list. */
export const PROVISION_STEPS: ProvisionStepInfo[] = [
  {
    id: "create-repo",
    label: "Create repository",
    hint: "A new GitHub repo to hold your site",
  },
  {
    id: "commit-files",
    label: "Add site files & workflows",
    hint: "Template, content, and deploy automation",
  },
  {
    id: "enable-pages",
    label: "Enable GitHub Pages",
    hint: "Turn on free static hosting",
  },
  {
    id: "trigger-build",
    label: "Start first deployment",
    hint: "Kick off the build that goes live",
  },
];

export interface ProvisionResult {
  owner: string;
  repo: string;
  fullName: string;
  htmlUrl: string;
  pagesUrl: string | null;
  runId: number | null;
  runUrl: string | null;
  private: boolean;
}

/** A single line in the newline-delimited JSON stream returned by the provisioning route. */
export type ProvisionEvent =
  | {
      type: "step";
      stepId: ProvisionStepId;
      status: ProvisionStepStatus;
      message?: string;
    }
  | { type: "done"; result: ProvisionResult }
  | { type: "error"; message: string };

export interface ProvisionRequest {
  templateId: TemplateId;
  siteName: string;
  repoName: string;
  description: string;
  private: boolean;
  accent?: string;
  defaultTheme?: "light" | "dark" | "system";
}

const TEMPLATE_IDS = ["blog", "portfolio", "landing"] as const;

/** Turn any user text into a valid, GitHub-safe repository name (or "" if nothing usable remains). */
export function slugifyRepoName(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 90) || ""
  );
}

export type ValidationResult =
  | { ok: true; value: ProvisionRequest }
  | { ok: false; error: string };

/** Validate + normalize an untrusted provisioning request body (used by the route handler). */
export function validateProvisionRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const templateId = String(b.templateId ?? "");
  if (!TEMPLATE_IDS.includes(templateId as (typeof TEMPLATE_IDS)[number])) {
    return { ok: false, error: "Unknown template." };
  }

  const siteName = String(b.siteName ?? "").trim();
  if (!siteName) return { ok: false, error: "Please enter a site name." };
  if (siteName.length > 120) return { ok: false, error: "Site name is too long." };

  const repoName = slugifyRepoName(String(b.repoName ?? "") || siteName);
  if (!repoName) {
    return { ok: false, error: "Please choose a valid repository name." };
  }
  if (!/^[A-Za-z0-9._-]+$/.test(repoName)) {
    return { ok: false, error: "Repository name has invalid characters." };
  }

  const description = String(b.description ?? "").slice(0, 300);
  const isPrivate = Boolean(b.private);

  const accentRaw = b.accent;
  const accent =
    typeof accentRaw === "string" && /^#[0-9a-fA-F]{6}$/.test(accentRaw)
      ? accentRaw
      : undefined;

  const dt = b.defaultTheme;
  const defaultTheme =
    dt === "light" || dt === "dark" || dt === "system" ? dt : undefined;

  return {
    ok: true,
    value: {
      templateId: templateId as TemplateId,
      siteName,
      repoName,
      description,
      private: isPrivate,
      accent,
      defaultTheme,
    },
  };
}
