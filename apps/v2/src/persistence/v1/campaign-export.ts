import { TarWriter } from "@gera2ld/tarjs";

import { prepareV1SceneExport } from "./scene-lifecycle";
import type { V1Campaign, V1SceneRecord } from "./types";

export function sceneExportFilename(name: string): string {
  return `${safeName(name, "scene")}.scene`;
}

export function campaignExportFilename(campaign: V1Campaign): string {
  return `${safeName(campaign.name, "campaign")}.tar`;
}

export async function prepareV1CampaignExport(
  records: readonly V1SceneRecord[],
  getAsset: (id: string) => Promise<File | null>
): Promise<Blob> {
  if (records.length === 0) throw new Error("A campaign must contain at least one scene to export");
  const archive = new TarWriter();
  const names = new Set<string>();
  for (const record of records) {
    const base = sceneExportFilename(record.scene.name).replace(/\.scene$/, "");
    let suffix = 1;
    let name: string;
    do {
      name = fitTarName(base, suffix === 1 ? "" : ` (${suffix})`);
      suffix++;
    } while (names.has(name));
    names.add(name);
    archive.addFile(name, await prepareV1SceneExport(record, getAsset));
  }
  return archive.write();
}

function safeName(name: string, fallback: string): string {
  return name.trim().replace(/[\\/\0]/g, "_") || fallback;
}

function fitTarName(value: string, suffix: string): string {
  const extension = ".scene";
  let base = value;
  while (base && new TextEncoder().encode(base + suffix + extension).length >= 100) base = base.slice(0, -1);
  return (base || "scene") + suffix + extension;
}
