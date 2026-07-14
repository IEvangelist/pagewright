"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Monitor,
  Tablet,
  Smartphone,
  Sun,
  Moon,
  ExternalLink,
  ArrowRight,
  Check,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

export type DeviceId = "desktop" | "tablet" | "mobile";

export interface DemoPostRef {
  slug: string;
  title: string;
}

export interface DemoFeature {
  title: string;
  body: string;
}

const DEVICES: { id: DeviceId; label: string; width: number | null; icon: React.ReactNode }[] = [
  { id: "desktop", label: "Desktop", width: null, icon: <Monitor size={16} aria-hidden="true" /> },
  { id: "tablet", label: "Tablet", width: 834, icon: <Tablet size={16} aria-hidden="true" /> },
  { id: "mobile", label: "Mobile", width: 390, icon: <Smartphone size={16} aria-hidden="true" /> },
];

/**
 * Interactive chrome around the isolated template preview `<iframe>`. Owns device (form-factor),
 * preview theme, and — for the blog — which page (index vs. an article) is shown. Theme changes are
 * pushed into the frame via `postMessage` so they apply live without a reload; page navigation
 * reloads the frame's document (and stays in sync when the user clicks links inside the preview).
 */
export function TemplateDemo({
  templateId,
  templateName,
  posts,
  features,
}: {
  templateId: string;
  templateName: string;
  posts: DemoPostRef[];
  features: DemoFeature[];
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const themeRef = useRef<"light" | "dark">("light");
  const lastNavRef = useRef<string>("");

  const [device, setDevice] = useState<DeviceId>("desktop");
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<"home" | "post">("home");
  const [slug, setSlug] = useState<string>("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const isBlog = templateId === "blog";

  function buildSrc(v: "home" | "post", s: string, t: "light" | "dark"): string {
    const p = new URLSearchParams({ view: v, theme: t });
    if (v === "post" && s) p.set("slug", s);
    return `/templates/${templateId}/frame?${p.toString()}`;
  }

  // Seed the preview theme from the app's current theme (once, after mount) so the frame's first
  // paint matches — before the nav effect below builds the initial src.
  useEffect(() => {
    const t = document.documentElement.classList.contains("dark") ? "dark" : "light";
    themeRef.current = t;
    setPreviewTheme(t);
  }, []);

  // Navigate the frame (a document reload) whenever the logical page changes.
  useEffect(() => {
    const key = `${view}|${slug}`;
    if (lastNavRef.current === key) return; // already showing this page (e.g. synced from in-frame click)
    lastNavRef.current = key;
    const el = iframeRef.current;
    if (el) {
      setLoading(true);
      el.src = buildSrc(view, slug, themeRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, slug]);

  // Theme changes apply live via postMessage — no reload, scroll position preserved.
  useEffect(() => {
    themeRef.current = previewTheme;
    iframeRef.current?.contentWindow?.postMessage({ type: "pw-theme", theme: previewTheme }, "*");
  }, [previewTheme]);

  function handleFrameLoad() {
    setLoading(false);
    const el = iframeRef.current;
    if (!el) return;
    // Re-assert theme (covers the initial load where the listener wasn't attached yet).
    el.contentWindow?.postMessage({ type: "pw-theme", theme: themeRef.current }, "*");
    // If the user clicked a link *inside* the preview, mirror that into our own state so the
    // page switcher stays accurate — without triggering a second reload.
    try {
      const loc = el.contentWindow?.location;
      if (loc && loc.pathname.includes(`/templates/${templateId}/frame`)) {
        const sp = new URLSearchParams(loc.search);
        const v = sp.get("view") === "post" ? "post" : "home";
        const s = sp.get("slug") ?? "";
        lastNavRef.current = `${v}|${s}`;
        setView(v);
        setSlug(s);
      }
    } catch {
      // Cross-origin should never happen (same app), but never let sync throw.
    }
  }

  const activeDevice = DEVICES.find((d) => d.id === device) ?? DEVICES[0]!;
  const frameWidth = activeDevice.width;

  return (
    <div className="pw-demo">
      <div className="pw-demo__toolbar">
        <div className="pw-demo__group" role="group" aria-label="Device size">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`pw-demo__seg${device === d.id ? " is-active" : ""}`}
              aria-pressed={device === d.id}
              onClick={() => setDevice(d.id)}
            >
              {d.icon}
              <span>{d.label}</span>
            </button>
          ))}
        </div>

        {isBlog && posts.length > 0 ? (
          <label className="pw-demo__pagepick">
            <span className="pw-demo__pagepicklabel">Page</span>
            <select
              value={view === "post" ? slug : "__home"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__home") {
                  setView("home");
                  setSlug("");
                } else {
                  setView("post");
                  setSlug(v);
                }
              }}
            >
              <option value="__home">Home · post index</option>
              {posts.map((p) => (
                <option key={p.slug} value={p.slug}>
                  Article · {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="pw-demo__spacer" />

        <button
          type="button"
          className="pw-demo__iconbtn"
          aria-label={previewTheme === "dark" ? "Preview light theme" : "Preview dark theme"}
          title={previewTheme === "dark" ? "Preview light theme" : "Preview dark theme"}
          onClick={() => setPreviewTheme((t) => (t === "dark" ? "light" : "dark"))}
        >
          {previewTheme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="pw-demo__iconbtn pw-demo__paneltoggle"
          aria-label={panelOpen ? "Hide details" : "Show details"}
          title={panelOpen ? "Hide details" : "Show details"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((o) => !o)}
        >
          {panelOpen ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
        </button>
      </div>

      <div className={`pw-demo__stage${panelOpen ? " has-panel" : ""}`}>
        <div className={`pw-demo__viewport pw-demo__viewport--${device}`}>
          <div
            className="pw-demo__device"
            style={frameWidth ? { width: frameWidth, maxWidth: "100%" } : undefined}
          >
            <div className="pw-demo__chromebar" aria-hidden="true">
              <span className="pw-demo__dot" />
              <span className="pw-demo__dot" />
              <span className="pw-demo__dot" />
              <span className="pw-demo__url">{templateName.toLowerCase().replace(/\s+/g, "-")}.pages.dev</span>
            </div>
            {loading ? <div className="pw-demo__loading" aria-hidden="true" /> : null}
            <iframe
              ref={iframeRef}
              className="pw-demo__frame"
              title={`${templateName} live preview`}
              onLoad={handleFrameLoad}
              loading="eager"
            />
          </div>
        </div>

        {panelOpen ? (
          <aside className="pw-demo__panel" aria-label="Template details">
            <div className="pw-demo__panelinner">
              <p className="pw-demo__panelkicker">What you get</p>
              <ul className="pw-demo__features">
                {features.map((f) => (
                  <li key={f.title} className="pw-demo__feature">
                    <span className="pw-demo__featureicon" aria-hidden="true">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    <span>
                      <strong>{f.title}</strong>
                      <span className="pw-demo__featurebody">{f.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link href={`/new?template=${templateId}`} className="pw-demo__cta">
                Use this template
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a
                href="https://github.com/IEvangelist/pagewright"
                target="_blank"
                rel="noreferrer"
                className="pw-demo__repolink"
              >
                <ExternalLink size={14} aria-hidden="true" />
                How Pagewright deploys this
              </a>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
