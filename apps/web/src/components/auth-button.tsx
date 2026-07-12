"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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
    <div className="pw-auth" ref={menuRef}>
      <button
        type="button"
        className="pw-auth__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pw-auth__avatar" src={user.avatarUrl} alt="" width={28} height={28} />
        <span className="pw-auth__login">{user.login}</span>
      </button>
      {open && (
        <div className="pw-menu" role="menu">
          <div className="pw-menu__header">
            <div className="pw-menu__name">{user.name ?? user.login}</div>
            <div className="pw-menu__sub">
              @{user.login}
              {session.mode === "mock" ? " · demo mode" : ""}
            </div>
          </div>
          <a className="pw-menu__item" href="/dashboard" role="menuitem">
            <LayoutDashboard size={16} strokeWidth={2} aria-hidden="true" />
            <span>Dashboard</span>
          </a>
          <form action="/api/auth/logout" method="post" className="pw-menu__form">
            <button type="submit" className="pw-menu__item" role="menuitem">
              <LogOut size={16} strokeWidth={2} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
