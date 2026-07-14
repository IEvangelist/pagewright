import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parseSiteConfig, type SiteConfig } from "@pagewright/blocks";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { SiteRuntimeUpdate } from "@/components/site-runtime-update";
import { SiteSettingsForm } from "@/components/site-settings-form";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { GLOBAL_FEATURES_RUNTIME_PATH } from "@/lib/site-runtime";

export const dynamic = "force-dynamic";

export default async function SiteSettingsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const user = await getCurrentUser();
  const provider = await getProviderForSession();
  if (!user || !provider) redirect("/api/auth/login");

  const { owner, repo } = await params;
  const repoData = await provider.getRepo({ owner, repo });
  if (!repoData) notFound();

  const ref = { owner, repo };
  const loaded = await (async () => {
    const headSha = await provider.getBranchHead(ref, repoData.defaultBranch);
    if (!headSha) throw new Error(`Branch "${repoData.defaultBranch}" has no head.`);
    const [file, runtimeFile] = await Promise.all([
      provider.getFile(ref, "src/data/site.json", headSha),
      provider.getFile(ref, GLOBAL_FEATURES_RUNTIME_PATH, headSha),
    ]);
    return { file, headSha, runtimeFile };
  })().catch(() => null);

  if (!loaded) {
    return (
      <SettingsShell owner={owner} repo={repo}>
        <div className="pw-alert pw-alert--error" role="alert">
          <strong>Site settings couldn’t be loaded safely.</strong> Pagewright couldn’t establish the
          repository version these settings came from, so saving has been disabled to prevent
          overwriting newer changes.
        </div>
      </SettingsShell>
    );
  }

  const { file, headSha, runtimeFile } = loaded;
  if (!runtimeFile) {
    return (
      <SettingsShell owner={owner} repo={repo}>
        <div className="pw-alert" role="status">
          <strong>This site needs a Pagewright runtime update.</strong> Global settings, bindings, and
          link icons stay disabled until the generated site runtime supports them, so the editor
          preview can’t diverge from the live site.
          <SiteRuntimeUpdate owner={owner} repo={repo} />
        </div>
      </SettingsShell>
    );
  }

  let settings: SiteConfig;
  if (!file) {
    settings = parseSiteConfig({
      name: repoData.name,
      description: repoData.description ?? "",
      url: repoData.homepage?.startsWith("http") ? repoData.homepage : "",
    });
  } else {
    try {
      settings = parseSiteConfig(JSON.parse(file.content));
    } catch {
      return (
        <SettingsShell owner={owner} repo={repo}>
          <div className="pw-alert pw-alert--error" role="alert">
            <strong>Site settings couldn’t be loaded.</strong> The repository’s{" "}
            <code>src/data/site.json</code> file is malformed. Fix it in GitHub before editing settings
            here so Pagewright doesn’t overwrite it.
          </div>
        </SettingsShell>
      );
    }
  }

  return (
    <SettingsShell owner={owner} repo={repo}>
      <SiteSettingsForm
        owner={owner}
        repo={repo}
        initialSettings={settings}
        initialHeadSha={headSha}
      />
    </SettingsShell>
  );
}

function SettingsShell({
  owner,
  repo,
  children,
}: {
  owner: string;
  repo: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/dashboard" className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__badge">{repo}</span>
        </span>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="pw-dash">
        <Link href={`/sites/${owner}/${repo}`} className="pw-backlink">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to site</span>
        </Link>
        <div className="pw-dash__head">
          <div>
            <h1 className="pw-dash__title">Site settings</h1>
            <p className="pw-dash__subtitle">Global details, reusable values, and external links.</p>
          </div>
        </div>
        {children}
      </main>
    </>
  );
}
