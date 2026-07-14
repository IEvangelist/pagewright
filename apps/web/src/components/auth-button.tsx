"use client";

import { ExternalLink, LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { GitHubMark } from "@/components/icons/github-mark";

interface SessionUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
  mode: "app" | "oauth" | "mock";
}

/**
 * Header auth control. Reads the safe session profile from /api/auth/session (never tokens) and
 * renders either "Sign in with GitHub" or an account menu. Navigation to the auth routes is done
 * with real links/forms so it works even before hydration.
 */
export function AuthButton() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dashboardRef = useRef<HTMLAnchorElement>(null);
  const popoverId = useId();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: SessionResponse) => {
        if (active) setSession(data);
      })
      .catch(() => {
        if (active) setSession({ authenticated: false, user: null, mode: "mock" });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const focusFrame = requestAnimationFrame(() => dashboardRef.current?.focus());

    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (session === null) {
    return <span className="pw-auth__placeholder" aria-hidden="true" />;
  }

  if (!session.authenticated || !session.user) {
    return (
      <a className="pw-btn pw-btn--primary" href="/api/auth/login">
        <GitHubMark size={16} aria-hidden="true" />
        <span>Sign in with GitHub</span>
      </a>
    );
  }

  const user = session.user;
  return (
    <div className="pw-auth" ref={menuRef} data-open={open}>
      <button
        ref={triggerRef}
        type="button"
        className="pw-auth__trigger"
        aria-label={`${open ? "Close" : "Open"} account menu for ${user.login}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" || open) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="pw-auth__avatar-frame">
          <img className="pw-auth__avatar" src={user.avatarUrl} alt="" width={28} height={28} />
        </span>
        <span className="pw-auth__login">{user.login}</span>
      </button>
      <div
        id={popoverId}
        className="pw-menu"
        role="dialog"
        aria-label={`Account menu for ${user.login}`}
        aria-hidden={!open}
        data-state={open ? "open" : "closed"}
        inert={!open}
      >
        <div className="pw-menu__profile">
          <div className="pw-menu__portrait-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="pw-menu__portrait"
              src={user.avatarUrl}
              alt=""
              width={60}
              height={60}
            />
          </div>
          <div className="pw-menu__identity">
            <div className="pw-menu__name">{user.name ?? user.login}</div>
            <div className="pw-menu__sub">
              <span>@{user.login}</span>
              {session.mode === "mock" ? <span className="pw-menu__mode">Demo account</span> : null}
            </div>
            <a
              className="pw-menu__profilelink"
              href={user.htmlUrl}
              target="_blank"
              rel="noreferrer"
              tabIndex={open ? 0 : -1}
            >
              GitHub profile
              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="pw-menu__actions">
          <a
            ref={dashboardRef}
            className="pw-menu__item"
            href="/dashboard"
            tabIndex={open ? 0 : -1}
          >
            <span className="pw-menu__iconwell" aria-hidden="true">
              <LayoutDashboard size={23} strokeWidth={1.9} />
            </span>
            <span className="pw-menu__itemcopy">
              <strong>Dashboard</strong>
              <span>Manage sites, pages, and publishing.</span>
            </span>
          </a>
          <form action="/api/auth/logout" method="post" className="pw-menu__form">
            <button
              type="submit"
              className="pw-menu__item pw-menu__item--danger"
              tabIndex={open ? 0 : -1}
            >
              <span className="pw-menu__iconwell" aria-hidden="true">
                <LogOut size={23} strokeWidth={1.9} />
              </span>
              <span className="pw-menu__itemcopy">
                <strong>Sign out</strong>
                <span>End this Pagewright session.</span>
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
