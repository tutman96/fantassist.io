export const APP_VERSION_COOKIE = "fantassist_version";
export const VERSION_SWITCH_CHANNEL = "fantassist:version";
export const VERSION_SWITCH_STORAGE_KEY = "fantassist_version_switch";

export type AppVersion = "stable" | "beta";

export function parseAppVersion(value: unknown): AppVersion | null {
  return value === "stable" || value === "beta" ? value : null;
}

export function currentAppVersion(value: unknown): AppVersion {
  return parseAppVersion(value) ?? "stable";
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/campaigns";
  if (!value.startsWith("/") || value.startsWith("//")) return "/campaigns";
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return "/campaigns";
  }
  return value;
}
