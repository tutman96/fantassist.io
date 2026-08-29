import type { DisplayConfiguration } from "@/engine/table-camera";

export const RESOLUTION_PRESETS = Object.freeze([
  { id: "4k", label: "4K", detail: "3840 × 2160", width: 3840, height: 2160 },
  { id: "1080p", label: "1080p", detail: "1920 × 1080", width: 1920, height: 1080 },
] as const);

export const TV_SIZE_PRESETS = Object.freeze([60, 55, 50] as const);

export function resolutionPresetId(resolution: DisplayConfiguration["resolutionPx"]): string {
  return RESOLUTION_PRESETS.find((preset) => preset.width === resolution.width && preset.height === resolution.height)?.id ?? "custom";
}

export function tvSizePresetId(diagonalInches: number): string {
  return TV_SIZE_PRESETS.includes(diagonalInches as (typeof TV_SIZE_PRESETS)[number]) ? String(diagonalInches) : "custom";
}

export function tableLaunchTargetId(screenAccessAvailable: boolean, manualBypass: boolean, targetId: string): string {
  return screenAccessAvailable && !manualBypass ? targetId : "default";
}

export function viewportIsBelowResolution(
  innerHeightCss: number,
  devicePixelRatio: number,
  resolutionHeightPx: number
): boolean {
  return Math.round(innerHeightCss * Math.max(devicePixelRatio, 1)) < resolutionHeightPx - 8;
}
