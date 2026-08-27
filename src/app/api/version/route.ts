import { NextRequest, NextResponse } from "next/server";

import {
  APP_VERSION_COOKIE,
  parseAppVersion,
  safeReturnPath,
} from "@/compat/version";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const version = parseAppVersion(
    typeof body === "object" && body !== null && "version" in body
      ? body.version
      : null
  );
  if (!version) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const returnTo = safeReturnPath(
    typeof body === "object" && body !== null && "returnTo" in body
      ? body.returnTo
      : null
  );
  const response = NextResponse.json({ version, returnTo });
  response.cookies.set({
    name: APP_VERSION_COOKIE,
    value: version,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}
