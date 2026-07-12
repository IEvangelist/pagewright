import { NextResponse } from "next/server";
import { getAuthMode } from "@/lib/auth/env";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Public session probe for the client. Returns only the safe {@link GitHubUser} profile and the
 * active auth mode — never tokens. Used by the header auth button to render sign-in vs. account.
 */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    authenticated: Boolean(session.user),
    user: session.user ?? null,
    mode: getAuthMode(),
  });
}
