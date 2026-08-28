"use client";

import { useEffect, useState } from "react";

import { useEditorScene } from "@/features/scenes/editor-scene-context";
import { cn } from "@/lib/utils";

export function AssetThumbnail({
  assetId,
  selected,
}: {
  readonly assetId: string;
  readonly selected: boolean;
}) {
  const editorScene = useEditorScene();
  const getAssetFile = editorScene?.getAssetFile;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void getAssetFile?.(assetId).then((file) => {
      if (!active || !file) return;
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, getAssetFile]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-9 shrink-0 place-items-center border bg-[#080b19] before:absolute before:right-[-1px] before:bottom-[-1px] before:size-2 before:border-r before:border-b after:absolute after:top-[-1px] after:left-[-1px] after:size-2 after:border-t after:border-l",
        selected
          ? "border-blue-300/35 before:border-blue-300/80 after:border-blue-300/80"
          : "border-violet-300/15 before:border-violet-200/45 after:border-violet-200/45"
      )}
    >
      <span
        className="size-7 border border-black/60 bg-[conic-gradient(from_90deg,#182a36_25%,#30454e_0_50%,#182a36_0_75%,#30454e_0)] bg-size-[8px_8px] bg-center"
        style={url ? {
          backgroundImage: `url("${url}")`,
          backgroundSize: "cover",
        } : undefined}
      />
    </span>
  );
}
