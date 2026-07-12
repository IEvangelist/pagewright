import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/auth/env";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Destroys the session cookie and returns to the marketing page. */
export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(`${getAppUrl()}/`, { status: 303 });
}

export async function GET() {
  return POST();
}
