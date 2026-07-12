import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parsePage, type Page } from "@pagewright/blocks";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { blocksToPuckData } from "@/lib/builder/convert";
import { SiteEditor } from "@/components/site-editor";

export const dynamic = "force-dynamic";

/** The page document the visual builder edits. Multi-page/post editing builds on this later. */
const PAGE_PATH = "src/data/pages/home.json";

/**
 * Visual builder route. Loads the site's home page document from the repo, converts it to Puck's
 * editor data on the server, and hands it to the client editor. Fully WYSIWYG against the shared
 * block components.
 */
export default async function EditSitePage({
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

  const file = await provider.getFile({ owner, repo }, PAGE_PATH).catch(() => null);
  let page: Page | null = null;
  if (file) {
    try {
      page = parsePage(JSON.parse(file.content));
    } catch {
      page = null;
    }
  }

  if (!page) {
    return (
      <main className="pw-dash">
        <Link href={`/sites/${owner}/${repo}`} className="pw-backlink">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to site</span>
        </Link>
        <div className="pw-empty" style={{ marginTop: 24 }}>
          <h2 className="pw-empty__title">This site has no editable home page yet</h2>
          <p className="pw-empty__body">
            Pagewright couldn’t find <code>{PAGE_PATH}</code> in this repository. If the site was
            just created, give the first deploy a moment and refresh.
          </p>
        </div>
      </main>
    );
  }

  const pages = await provider.getPages({ owner, repo }).catch(() => null);
  const headSha = await provider.getBranchHead({ owner, repo }, repoData.defaultBranch).catch(
    () => null,
  );
  const initialData = blocksToPuckData(page);

  return (
    <SiteEditor
      owner={owner}
      repo={repo}
      path={PAGE_PATH}
      siteName={repoData.name}
      liveUrl={pages?.url ?? repoData.pagesUrl ?? null}
      initialData={initialData}
      initialHeadSha={headSha}
    />
  );
}
