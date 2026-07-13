import type { CSSProperties } from "react";

/**
 * Shared skeleton primitives + per-route loading screens. Rendered instantly by App Router
 * `loading.tsx` files while a `force-dynamic` route streams its GitHub-backed server component, so
 * every navigation shows structured, on-brand loading instead of a frozen previous page.
 */

export function Skel({
  w,
  h = 14,
  r = 8,
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const dim = (v: number | string | undefined) =>
    v === undefined ? undefined : typeof v === "number" ? `${v}px` : v;
  return (
    <span
      className={`pw-skel${className ? ` ${className}` : ""}`}
      style={{ width: dim(w), height: dim(h), borderRadius: dim(r), ...style }}
    />
  );
}

function SkeletonAppbar({ badge = true }: { badge?: boolean }) {
  return (
    <header className="pw-appbar">
      <span className="pw-appbar__brand">
        <span className="pw-appbar__brandlink">Pagewright</span>
        {badge && <Skel w={64} h={18} r={999} />}
      </span>
      <div className="pw-appbar__actions">
        <Skel w={84} h={34} r={10} />
        <Skel w={38} h={38} r={10} />
      </div>
    </header>
  );
}

function SkeletonHead({ action = true }: { action?: boolean }) {
  return (
    <div className="pw-dash__head">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skel w={220} h={30} />
        <Skel w={340} h={16} />
      </div>
      {action && <Skel w={128} h={40} r={10} />}
    </div>
  );
}

function SkeletonSiteCard() {
  return (
    <li className="pw-sitecard" aria-hidden="true">
      <Skel h="0" style={{ aspectRatio: "16 / 10", height: "auto", width: "100%", borderRadius: 0 }} />
      <div className="pw-sitecard__body">
        <div className="pw-sitecard__top">
          <Skel w={72} h={22} r={999} />
        </div>
        <Skel w="70%" h={20} />
        <Skel w="90%" h={14} />
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Skel w={96} h={26} r={999} />
          <Skel w={72} h={26} r={999} />
        </div>
        <div style={{ marginTop: 4 }}>
          <Skel w={100} h={32} r={10} />
        </div>
      </div>
    </li>
  );
}

export function DashboardSkeleton() {
  return (
    <>
      <SkeletonAppbar />
      <main className="pw-dash" aria-busy="true">
        <SkeletonHead />
        <ul className="pw-sitegrid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonSiteCard key={i} />
          ))}
        </ul>
      </main>
    </>
  );
}

export function SiteManageSkeleton() {
  return (
    <>
      <SkeletonAppbar />
      <main className="pw-dash" aria-busy="true">
        <Skel w={150} h={16} style={{ marginBottom: 24 }} />
        <SkeletonHead />
        <div className="pw-skelcard" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skel w={200} h={22} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Skel w={22} h={22} r={999} />
              <Skel w={`${60 - i * 6}%`} h={16} />
            </div>
          ))}
        </div>
        <div
          className="pw-skelcard"
          style={{ padding: 20, marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}
        >
          <Skel w={160} h={20} />
          <Skel w="80%" h={14} />
          <Skel w={140} h={38} r={10} />
        </div>
      </main>
    </>
  );
}

export function GallerySkeleton() {
  return (
    <>
      <SkeletonAppbar />
      <main className="pw-dash" aria-busy="true">
        <Skel w={150} h={16} style={{ marginBottom: 24 }} />
        <SkeletonHead action={false} />
        <div className="pw-sitegrid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="pw-sitecard"
              style={{ display: "flex", flexDirection: "column" }}
              aria-hidden="true"
            >
              <Skel h={160} r={0} style={{ width: "100%" }} />
              <div className="pw-sitecard__body">
                <Skel w="55%" h={20} />
                <Skel w="90%" h={14} />
                <Skel w="80%" h={14} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

export function EditorSkeleton({ label = "Loading editor…" }: { label?: string }) {
  return (
    <div className="pw-editorloading" aria-busy="true">
      <SkeletonAppbar />
      <div className="pw-editorloading__body">
        <span className="pw-editorloading__spinner" aria-hidden="true" />
        <p className="pw-editorloading__label">{label}</p>
      </div>
    </div>
  );
}

export function PostsListSkeleton() {
  return (
    <>
      <SkeletonAppbar />
      <main className="pw-dash" aria-busy="true">
        <Skel w={150} h={16} style={{ marginBottom: 24 }} />
        <SkeletonHead />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="pw-skelcard"
              style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}
              aria-hidden="true"
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <Skel w={`${40 + i * 8}%`} h={18} />
                <Skel w="60%" h={13} />
              </div>
              <Skel w={70} h={24} r={999} />
              <Skel w={64} h={32} r={8} />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
