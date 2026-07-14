import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  parsePage,
  parsePost,
  parseSiteConfig,
  type Block,
  type Page,
  type Post,
  type PostComponent,
  type SiteConfig,
} from "@pagewright/blocks";
import type { DiscussionSetup } from "@pagewright/github";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { blocksToPuckData } from "@/lib/builder/convert";
import { isPostPath, postToMeta, slugFromPostPath, type PostMeta } from "@/lib/content/posts";
import { htmlToMarkdown } from "@/lib/content/markdown-server";
import { GLOBAL_FEATURES_RUNTIME_PATH } from "@/lib/site-runtime";
import { SiteEditor } from "@/components/site-editor";
import { PostComposer } from "@/components/post-composer";

export const dynamic = "force-dynamic";

/** Default document the visual builder edits when no explicit `?path=` is given. */
const HOME_PATH = "src/data/pages/home.json";

function isPostComponent(block: Block): block is PostComponent {
  return block.type === "prose" || block.type === "githubDiscussions";
}

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

  const [pages, headSha] = await Promise.all([
    provider.getPages({ owner, repo }).catch(() => null),
    provider.getBranchHead({ owner, repo }, repoData.defaultBranch).catch(() => null),
  ]);

  if (!headSha) {
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
          <h2 className="pw-empty__title">A safe editing version couldn’t be loaded</h2>
          <p className="pw-empty__body">
            Pagewright couldn’t verify the repository’s current version, so editing is paused to
            protect newer changes. Refresh the page to try again.
          </p>
        </div>
      </main>
    );
  }

  const [file, siteFile, runtimeFile] = await Promise.all([
    provider.getFile({ owner, repo }, path, headSha).catch(() => null),
    provider.getFile({ owner, repo }, "src/data/site.json", headSha).catch(() => null),
    provider.getFile({ owner, repo }, GLOBAL_FEATURES_RUNTIME_PATH, headSha).catch(() => null),
  ]);
  const supportsGlobalFeatures = runtimeFile !== null;
  let site: SiteConfig;
  try {
    site = parseSiteConfig(
      siteFile
        ? JSON.parse(siteFile.content)
        : { name: repoData.name, description: repoData.description ?? "" },
    );
  } catch {
    site = parseSiteConfig({ name: repoData.name, description: repoData.description ?? "" });
  }
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

  const backHref = post ? `/sites/${owner}/${repo}/posts` : `/sites/${owner}/${repo}`;
  const editingLabel = post ? slugFromPostPath(path) : repoData.name;
  const liveUrl = pages?.url ?? repoData.pagesUrl ?? null;

  // Posts get the markdown-first composer; pages keep the visual (Puck) builder.
  if (post && parsedPost && postMeta && parsedPost.blocks.every(isPostComponent)) {
    const discussionSetup: DiscussionSetup | null = await provider
      .getDiscussionSetup({ owner, repo })
      .catch(() => null);
    const sourceRepo = discussionSetup?.repo ?? `${owner}/${repo}`;
    const defaultCategory =
      discussionSetup?.categories.find((category) => category.name === "Announcements") ??
      discussionSetup?.categories[0];
    const components: PostComponent[] = parsedPost.blocks.map((component) => {
      if (component.type === "prose") {
        return {
          ...component,
          props: {
            ...component.props,
            markdown:
              component.props.markdown && component.props.markdown.trim()
                ? component.props.markdown
                : htmlToMarkdown(component.props.html ?? ""),
          },
        };
      }
      const usesSourceRepo =
        !component.props.repo ||
        component.props.repo.toLowerCase() === sourceRepo.toLowerCase();
      return usesSourceRepo
        ? {
            ...component,
            props: {
              ...component.props,
              repo: sourceRepo,
              repoId: component.props.repoId || discussionSetup?.repoId || "",
              category: component.props.category || defaultCategory?.name || "",
              categoryId: component.props.categoryId || defaultCategory?.id || "",
            },
          }
        : component;
    });
    return (
      <PostComposer
        key={`${owner}/${repo}:${path}`}
        owner={owner}
        repo={repo}
        path={path}
        editingLabel={editingLabel}
        backHref={backHref}
        liveUrl={liveUrl}
        initialTitle={parsedPost.title}
        initialDescription={parsedPost.description ?? ""}
        initialComponents={components}
        postMeta={postMeta}
        initialHeadSha={headSha}
        initialDiscussionSetup={discussionSetup}
        site={site}
        supportsGlobalFeatures={supportsGlobalFeatures}
      />
    );
  }

  const initialData = blocksToPuckData(page);

  return (
    <SiteEditor
      key={`${owner}/${repo}:${path}`}
      owner={owner}
      repo={repo}
      path={path}
      siteName={repoData.name}
      editingLabel={editingLabel}
      backHref={backHref}
      backLabel={post ? "Back to posts" : "Back to site"}
      liveUrl={liveUrl}
      site={site}
      supportsGlobalFeatures={supportsGlobalFeatures}
      initialData={initialData}
      initialHeadSha={headSha}
      postMeta={postMeta}
    />
  );
}
