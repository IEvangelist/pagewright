import { ConcurrencyError, type CommitFile } from "@pagewright/github";
import {
  getLatestManifest,
  siteStampSchema,
  type SiteManifest,
} from "@pagewright/registry";
import { getProviderForSession } from "@/lib/auth/provider";
import { loadTemplateFiles, loadVendorFiles } from "@/lib/provision/template-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPDATE_SCRIPT_PATH = "scripts/update-kit.mjs";
const UPDATE_WORKFLOW_PATH = ".github/workflows/update-kit.yml";

function requireTemplateFile(files: CommitFile[], path: string): CommitFile {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`The ${path} managed source is missing from the template bundle.`);
  return file;
}

function runtimeFiles(templateFiles: CommitFile[]): CommitFile[] {
  return [
    ...loadVendorFiles(),
    ...templateFiles.filter(
      (file) => file.path.startsWith("src/layouts/") || file.path.startsWith("src/pages/"),
    ),
  ].map(({ path, content }) => ({ path, content }));
}

function managedDependencies(manifest: SiteManifest): Record<string, string> {
  return {
    ...manifest.dependencies,
    "@pagewright/blocks": "file:./vendor/pagewright-blocks",
    "@pagewright/site-kit": "file:./vendor/pagewright-site-kit",
  };
}

function renderUpdatedPackageJson(content: string, manifest: SiteManifest): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The site’s package.json file is malformed.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The site’s package.json file is invalid.");
  }
  const pkg = parsed as Record<string, unknown>;
  const dependencies =
    pkg.dependencies && typeof pkg.dependencies === "object" && !Array.isArray(pkg.dependencies)
      ? (pkg.dependencies as Record<string, unknown>)
      : {};
  const devDependencies =
    pkg.devDependencies &&
    typeof pkg.devDependencies === "object" &&
    !Array.isArray(pkg.devDependencies)
      ? (pkg.devDependencies as Record<string, unknown>)
      : {};
  return `${JSON.stringify(
    {
      ...pkg,
      dependencies: { ...dependencies, ...managedDependencies(manifest) },
      devDependencies: { ...devDependencies, ...manifest.devDependencies },
    },
    null,
    2,
  )}\n`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;
  const ref = { owner, repo };
  const repoData = await provider.getRepo(ref).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  try {
    const headSha = await provider.getBranchHead(ref, repoData.defaultBranch);
    if (!headSha) throw new Error(`Branch "${repoData.defaultBranch}" has no head.`);

    const [stampFile, packageFile] = await Promise.all([
      provider.getFile(ref, "pagewright.json", headSha),
      provider.getFile(ref, "package.json", headSha),
    ]);
    if (!stampFile || !packageFile) {
      return Response.json(
        { error: "This repository is missing its Pagewright manifest or package.json file." },
        { status: 422 },
      );
    }

    let stampInput: unknown;
    try {
      stampInput = JSON.parse(stampFile.content);
    } catch {
      return Response.json(
        { error: "The site’s pagewright.json file is malformed." },
        { status: 422 },
      );
    }
    const stamp = siteStampSchema.safeParse(stampInput);
    if (!stamp.success) {
      return Response.json({ error: "The site’s pagewright.json file is invalid." }, { status: 422 });
    }

    const manifest = getLatestManifest(stamp.data.templateId, stamp.data.channel);
    if (!manifest) throw new Error("No compatible Pagewright runtime manifest was found.");

    const templateFiles = loadTemplateFiles(stamp.data.templateId);
    const updateScript = requireTemplateFile(templateFiles, UPDATE_SCRIPT_PATH);
    const updateWorkflow = requireTemplateFile(templateFiles, UPDATE_WORKFLOW_PATH);
    const stampRecord = stampInput as Record<string, unknown>;
    const files: CommitFile[] = [
      ...runtimeFiles(templateFiles),
      updateScript,
      updateWorkflow,
      {
        path: "pagewright.json",
        content: `${JSON.stringify(
          {
            ...stampRecord,
            manifestVersion: manifest.manifestVersion,
            schemaVersion: manifest.schemaVersion,
            updatedAt: new Date().toISOString().slice(0, 10),
          },
          null,
          2,
        )}\n`,
      },
      {
        path: "package.json",
        content: renderUpdatedPackageJson(packageFile.content, manifest),
      },
    ];
    const branch = `pagewright/update-${manifest.manifestVersion}-${Date.now().toString(36)}`;
    const pullRequest = await provider.createPullRequestWithFiles(ref, {
      branch,
      baseBranch: repoData.defaultBranch,
      baseSha: headSha,
      title: `Pagewright runtime ${manifest.manifestVersion}`,
      body:
        "Updates the Pagewright-managed runtime and template rendering files. Site content under `src/data/` is preserved.",
      message: `Update Pagewright runtime to ${manifest.manifestVersion}`,
      files,
    });
    return Response.json(
      { ok: true, pullRequestUrl: pullRequest.htmlUrl },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      return Response.json(
        { error: "The site changed while preparing its update. Try again." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to request the runtime update." },
      { status: 502 },
    );
  }
}
