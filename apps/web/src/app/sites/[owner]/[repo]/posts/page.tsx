import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { listPosts } from "@/lib/content/posts-server";
import { derivePostStatus } from "@/lib/content/posts";
import { PostsManager, type PostListItem } from "@/components/posts-manager";

export const dynamic = "force-dynamic";

/**
 * Per-site Posts management view. Lists every blog post in the repo with its publish status, and
 * hosts the create/edit/delete controls. All GitHub reads happen here on the server; the client
 * manager handles interactions and refreshes via the router after a mutation.
 */
export default async function SitePostsPage({
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

  const [summaries, headSha] = await Promise.all([
    listPosts(provider, { owner, repo }),
    provider.getBranchHead({ owner, repo }, repoData.defaultBranch).catch(() => null),
  ]);

  const posts: PostListItem[] = summaries.map(({ slug, path, post }) => ({
    slug,
    path,
    title: post.title,
    excerpt: post.excerpt ?? "",
    date: post.date ?? "",
    tags: post.tags ?? [],
    status: derivePostStatus(post),
  }));

  const liveUrl = repoData.pagesUrl ?? repoData.homepage ?? null;

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/dashboard" className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__badge">{repoData.name}</span>
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
        <PostsManager
          owner={owner}
          repo={repo}
          initialPosts={posts}
          headSha={headSha}
          liveUrl={liveUrl}
        />
      </main>
    </>
  );
}
