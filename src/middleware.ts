import { NextRequest, NextResponse } from "next/server";

import { APP_VERSION_COOKIE, currentAppVersion } from "@/compat/version";

const STABLE_PATHS = new Set(["/manifest.webmanifest", "/api/version"]);

export function middleware(request: NextRequest) {
  const version = currentAppVersion(
    request.cookies.get(APP_VERSION_COOKIE)?.value
  );
  const betaOrigin = process.env.BETA_ORIGIN;

  if (
    version === "beta" &&
    betaOrigin &&
    !STABLE_PATHS.has(request.nextUrl.pathname)
  ) {
    const destination = new URL(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      betaOrigin
    );
    const response = NextResponse.rewrite(destination);
    response.headers.set("x-fantassist-version", "beta");
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("x-fantassist-version", "stable");
  return response;
}

export const config = {
  matcher: ["/((?!_vercel).*)"],
};
