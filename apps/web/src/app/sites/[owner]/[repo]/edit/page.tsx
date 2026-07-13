import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parsePage, parsePost, type Block, type Page, type Post } from "@pagewright/blocks";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { blocksToPuckData } from "@/lib/builder/convert";
import { isPostPath, postToMeta, slugFromPostPath, type PostMeta } from "@/lib/content/posts";
import { htmlToMarkdown } from "@/lib/content/markdown-server";
import { SiteEditor } from "@/components/site-editor";
import { PostComposer } from "@/components/post-composer";

export const dynamic = "force-dynamic";

/** Default document the visual builder edits when no explicit `?path=` is given. */
const HOME_PATH = "src/data/pages/home.json";

/** Only content documents under the pages/posts data dirs may be opened in the editor. */
function isEditablePath(path: string): boolean {
  return /^src\/data\/(pages|posts)\/[A-Za-z0-9._-]+\.json$/.test(path) && !path.includes("..");
}

/**
 * Visual builder route. Loads a content document (the home page by default, or any page/post given
 * via `?path=`) from the repo, converts it to Puck's editor data on the server, and hands it to the
 * client editor. For posts it also seeds the metadata panel (date, excerpt, tags, …). Fully WYSIWYG
 * against the shared block components.
 */
export default async function EditSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const user = await getCurrentUser();
  const provider = await getProviderForSession();
  if (!user || !provider) redirect("/api/auth/login");

  const { owner, repo } = await params;
  const { path: rawPath } = await searchParams;
  const path = rawPath && isEditablePath(rawPath) ? rawPath : HOME_PATH;
  const post = isPostPath(path);

  const repoData = await provider.getRepo({ owner, repo });
  if (!repoData) notFound();

  const file = await provider.getFile({ owner, repo }, path).catch(() => null);
  let page: Page | null = null;
  let parsedPost: Post | null = null;
  let postMeta: PostMeta | undefined;
  if (file) {
    try {
      if (post) {
        parsedPost = parsePost(JSON.parse(file.content));
        page = parsedPost;
        postMeta = postToMeta(parsedPost);
      } else {
        page = parsePage(JSON.parse(file.content));
      }
    } catch {
      page = null;
      parsedPost = null;
    }
  }

  if (!page) {
    return (
      <main className="pw-dash">
        <Link
          href={post ? `/sites/${owner}/${repo}/posts` : `/sites/${owner}/${repo}`}
          className="pw-backlink"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{post ? "Back to posts" : "Back to site"}</span>
        </Link>
        <div className="pw-empty" style={{ marginTop: 24 }}>
          <h2 className="pw-empty__title">
            {post ? "This post couldn’t be loaded" : "This site has no editable home page yet"}
          </h2>
          <p className="pw-empty__body">
            Pagewright couldn’t find <code>{path}</code> in this repository. If it was just created,
            give the first deploy a moment and refresh.
          </p>
        </div>
      </main>
    );
  }

  const pages = await provider.getPages({ owner, repo }).catch(() => null);
  const headSha = await provider
    .getBranchHead({ owner, repo }, repoData.defaultBranch)
    .catch(() => null);

  const backHref = post ? `/sites/${owner}/${repo}/posts` : `/sites/${owner}/${repo}`;
  const editingLabel = post ? slugFromPostPath(path) : repoData.name;
  const liveUrl = pages?.url ?? repoData.pagesUrl ?? null;

  // Posts get the markdown-first composer; pages keep the visual (Puck) builder.
  if (post && parsedPost && postMeta) {
    const prose = parsedPost.blocks.find(
      (b): b is Extract<Block, { type: "prose" }> => b.type === "prose",
    );
    const markdown =
      prose?.props.markdown && prose.props.markdown.trim()
        ? prose.props.markdown
        : htmlToMarkdown(prose?.props.html ?? "");
    return (
      <PostComposer
        owner={owner}
        repo={repo}
        path={path}
        editingLabel={editingLabel}
        backHref={backHref}
        liveUrl={liveUrl}
        initialTitle={parsedPost.title}
        initialDescription={parsedPost.description ?? ""}
        initialMarkdown={markdown}
        postMeta={postMeta}
        initialHeadSha={headSha}
      />
    );
  }

  const initialData = blocksToPuckData(page);

  return (
    <SiteEditor
      owner={owner}
      repo={repo}
      path={path}
      siteName={repoData.name}
      editingLabel={editingLabel}
      backHref={backHref}
      backLabel={post ? "Back to posts" : "Back to site"}
      liveUrl={liveUrl}
      initialData={initialData}
      initialHeadSha={headSha}
      postMeta={postMeta}
    />
  );
}
