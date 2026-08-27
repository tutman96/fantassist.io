import type { Metadata } from "next";
import { cookies } from "next/headers";

import { APP_VERSION_COOKIE, currentAppVersion } from "@/compat/version";

import BetaEnrollment from "./betaEnrollment";

export const metadata: Metadata = {
  title: "Fantassist Beta",
  description: "Choose which Fantassist experience to use on this device.",
};

export default function BetaPage() {
  const version = currentAppVersion(cookies().get(APP_VERSION_COOKIE)?.value);
  return (
    <BetaEnrollment
      enrolled={version === "beta"}
      betaAvailable={process.env.BETA_ORIGIN !== undefined}
    />
  );
}
