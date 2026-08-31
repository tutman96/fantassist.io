"use client";

import { useEffect, useState } from "react";

import { requestSceneThumbnail } from "./scene-thumbnail-client";

export function SceneCardThumbnail({ sceneKey, version, zoomOnHover = true }: {
  readonly sceneKey: string;
  readonly version: number;
  readonly zoomOnHover?: boolean;
}) {
  const requestKey = `${sceneKey}:${version}`;
  const [result, setResult] = useState<{ readonly key: string; readonly url: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void requestSceneThumbnail(sceneKey, version).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setResult({ key: requestKey, url: objectUrl });
    }).catch(() => {
      if (active) setFailedKey(requestKey);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requestKey, sceneKey, version]);
  const url = result?.key === requestKey ? result.url : null;
  const failed = failedKey === requestKey;
  if (!url) return (
    <div className="absolute inset-0 overflow-hidden bg-[#101329]" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(59,130,246,0.3),transparent_42%),radial-gradient(circle_at_84%_78%,rgba(139,92,246,0.24),transparent_48%),linear-gradient(145deg,#11172f,#0d0d22_65%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(196,181,253,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(196,181,253,0.2)_1px,transparent_1px)] [background-size:18px_18px]" />
      {failed ? (
        <div className="absolute inset-x-5 top-1/2 h-px bg-gradient-to-r from-transparent via-violet-200/30 to-transparent" />
      ) : (
        <>
          <div className="absolute -inset-x-1/3 top-[42%] h-10 -rotate-6 animate-pulse bg-gradient-to-r from-transparent via-blue-300/16 to-transparent blur-md" />
          <div className="absolute inset-x-5 top-1/2 h-px animate-pulse bg-gradient-to-r from-transparent via-blue-200/55 to-transparent" />
        </>
      )}
      <span className="sr-only" role="status">{failed ? "Scene preview unavailable" : "Rendering scene preview"}</span>
    </div>
  );
  return (
    <div
      className={zoomOnHover
        ? "absolute inset-0 scale-100 bg-cover bg-center opacity-80 transition duration-500 ease-out group-hover:scale-[1.025] group-hover:opacity-95"
        : "absolute inset-0 bg-cover bg-center opacity-90"}
      style={{ backgroundImage: `url(${JSON.stringify(url)})` }}
      aria-hidden="true"
    />
  );
}
