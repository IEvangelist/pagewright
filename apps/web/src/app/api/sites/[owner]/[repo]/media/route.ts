import { createHash } from "node:crypto";
import { getProviderForSession } from "@/lib/auth/provider";
import { ConcurrencyError, type Base64FileContents, type Repo } from "@pagewright/github";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Where uploaded assets live in the repo; Astro serves `public/` from the site root. */
const MEDIA_DIR = "public/media";
/** Reject anything larger than this so a stray huge file can't blow the commit API up. */
const MAX_BYTES = 8 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
};

/** Turn an arbitrary upload name into a safe slug, dropping any directory parts and odd characters. */
function slugifyBase(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "image";
}

function isAllowedMediaPath(path: string): boolean {
  return /^public\/media\/[A-Za-z0-9._-]+\.(?:png|jpe?g|gif|webp|avif|ico)$/.test(path);
}

/** Serve authenticated media bytes to the editor preview, including files in private repositories. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isAllowedMediaPath(path)) {
    return Response.json({ error: "Unsupported media path." }, { status: 400 });
  }

  let file: Base64FileContents | null;
  try {
    file = await provider.getFileBase64({ owner, repo }, path);
  } catch {
    return Response.json({ error: "Could not load media from GitHub." }, { status: 502 });
  }
  if (!file) {
    return Response.json({ error: "Media not found." }, { status: 404 });
  }

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const bytes = Buffer.from(file.contentBase64, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "cache-control": "private, max-age=300",
      "content-type": TYPE_BY_EXT[ext] ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Commit an uploaded image into the site repo's media folder and return the URL the deployed site
 * serves it from. The client sends the raw bytes base64-encoded (JSON) along with the original file
 * name and MIME type. We sanitize the name and prefix it with a short content hash so re-uploading a
 * file never collides with or clobbers an unrelated asset, then commit it with `encoding: "base64"`
 * so binary data survives the round-trip. The returned `url` is site-relative (`/media/<name>`),
 * matching how the block components reference images.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;

  let body: {
    filename?: unknown;
    contentType?: unknown;
    contentBase64?: unknown;
    expectedHeadSha?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const contentType = typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    return Response.json(
      { error: "Unsupported image type. Use PNG, JPEG, GIF, WebP, AVIF, or ICO." },
      { status: 415 },
    );
  }

  const contentBase64 =
    typeof body.contentBase64 === "string"
      ? body.contentBase64.replace(/^data:[^;]+;base64,/, "")
      : "";
  if (!contentBase64) {
    return Response.json({ error: "Missing file data." }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(contentBase64, "base64");
  } catch {
    return Response.json({ error: "Could not decode the uploaded file." }, { status: 400 });
  }
  if (bytes.length === 0) {
    return Response.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (bytes.length > MAX_BYTES) {
    return Response.json(
      { error: `Image is too large. Keep uploads under ${Math.floor(MAX_BYTES / (1024 * 1024))} MB.` },
      { status: 413 },
    );
  }

  let repoData: Repo | null;
  try {
    repoData = await provider.getRepo({ owner, repo });
  } catch {
    return Response.json({ error: "Could not load the site from GitHub." }, { status: 502 });
  }
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  const slug = slugifyBase(typeof body.filename === "string" ? body.filename : "image");
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  const fileName = `${slug}-${hash}.${ext}`;
  const path = `${MEDIA_DIR}/${fileName}`;
  const expectedHeadSha =
    typeof body.expectedHeadSha === "string" && body.expectedHeadSha
      ? body.expectedHeadSha
      : undefined;

  try {
    const result = await provider.commitFiles(
      { owner, repo },
      {
        message: `Add media ${fileName} via Pagewright`,
        files: [{ path, content: contentBase64, encoding: "base64" }],
        branch: repoData.defaultBranch,
        expectedHeadSha,
      },
    );
    return Response.json({
      url: `/media/${fileName}`,
      path,
      headSha: result.sha,
      commitUrl: result.htmlUrl,
    });
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      return Response.json(
        {
          error:
            "This site changed in GitHub while you were editing. Resolve the conflict before uploading.",
          code: "conflict",
          actualHeadSha: error.actualHeadSha,
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to upload image." },
      { status: 502 },
    );
  }
}
