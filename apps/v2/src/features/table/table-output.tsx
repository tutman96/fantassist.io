"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, MonitorX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { freezeSceneDocument } from "@/engine/scene-document";
import { createSceneEngine } from "@/engine/scene-engine";
import { DEFAULT_TABLE_CAMERA } from "@/engine/table-camera";
import { GpuViewport } from "@/features/editor/gpu-viewport";
import { viewportIsBelowResolution } from "@/features/table/table-display-options";
import { keepScreenAwake } from "@/features/table/screen-wake-lock";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { hostTableWindow } from "@/features/table/table-window-channel";
import { createV1Repositories } from "@/persistence/v1/repositories";
import { applyAssetVisibilityMetadata, hydrateAssetDisplayNames, projectV1Scene } from "@/persistence/v1/scene-adapter";
import { createBrowserImageLoader } from "@/renderer/browser-image-loader";

const WAITING_SCENE_ID = "waiting/table";

export function TableOutput({ fullscreenRequired }: { readonly fullscreenRequired: boolean }) {
  const session = useSharedTableSession();
  if (!session) throw new Error("TableOutput requires a TableSessionProvider");
  const [repositories] = useState(createV1Repositories);
  const [engine] = useState(() => createSceneEngine(freezeSceneDocument({
    id: WAITING_SCENE_ID,
    name: "Waiting for scene",
    version: 0,
    table: DEFAULT_TABLE_CAMERA,
    layers: [],
    assets: [],
  })));
  const [imageLoader] = useState(() => createBrowserImageLoader((id) => repositories.getAsset(id)));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const tableSnapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    const host = hostTableWindow(({ bounds, route }) => {
      try {
        if (bounds) {
          window.moveTo(bounds.left, bounds.top);
          window.resizeTo(bounds.width, bounds.height);
        }
      } catch {
        // Browsers may permit focusing while denying scripted placement.
      }
      window.focus();
      if (`${window.location.pathname}${window.location.search}` !== route) window.location.replace(route);
    });
    const heartbeat = window.setInterval(host.announce, 1_000);
    return () => {
      window.clearInterval(heartbeat);
      host.close();
    };
  }, []);

  useEffect(() => keepScreenAwake(), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repositories.getSetting<string>("displayed_scene"),
      repositories.getSetting<{ width: number; height: number }>("table_resolution"),
      repositories.getSetting<number>("table_size"),
    ]).then(async ([sceneKey, resolution, diagonal]) => {
      if (cancelled) return;
      session.updateConfiguration({
        ...(resolution ? { display: { resolutionPx: resolution, ...(diagonal ? { diagonalInches: diagonal } : {}) } } :
          diagonal ? { display: { diagonalInches: diagonal } } : {}),
      });
      const record = sceneKey ? await repositories.loadScene(sceneKey) : null;
      if (record && !cancelled) {
        const projected = projectV1Scene(record.scene);
        const [named, metadata] = await Promise.all([
          hydrateAssetDisplayNames(projected, (id) => repositories.getAsset(id)),
          repositories.getSceneMetadata(record.key),
        ]);
        if (!cancelled) {
          const document = applyAssetVisibilityMetadata(named, metadata?.assetVisibility);
          engine.replaceCommittedScene(document, document.version);
        }
      }
      if (!cancelled) setReady(true);
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : "Unable to restore the displayed scene");
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engine, repositories, session]);

  if (!ready) return <TableOutputStatus>Restoring player scene</TableOutputStatus>;
  return (
    <div className="relative size-full">
      <GpuViewport profile="output" engine={engine} imageLoader={imageLoader} />
      {fullscreenRequired ? <TableFullscreenGate resolutionHeight={tableSnapshot.display.resolutionPx.height} /> : null}
      {snapshot.scene.id === WAITING_SCENE_ID ? (
        <TableOutputStatus>{error ?? "Waiting for the DM to choose a scene"}</TableOutputStatus>
      ) : null}
    </div>
  );
}

function TableFullscreenGate({ resolutionHeight }: { readonly resolutionHeight: number }) {
  const gateRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      setFullscreen(document.fullscreenElement !== null);
      setToolbarVisible(viewportIsBelowResolution(window.innerHeight, window.devicePixelRatio, resolutionHeight));
    };
    update();
    document.addEventListener("fullscreenchange", update);
    window.addEventListener("resize", update);
    if (document.fullscreenElement === null) {
      void requestAutomaticTableFullscreen().catch(() => undefined);
    }
    gateRef.current?.focus();
    return () => {
      document.removeEventListener("fullscreenchange", update);
      window.removeEventListener("resize", update);
    };
  }, [resolutionHeight]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activationKey = event.key.length === 1 || event.key === "Enter" || event.key === " ";
      if (
        !activationKey ||
        document.fullscreenElement !== null ||
        event.key === "Escape" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) return;
      event.preventDefault();
      void requestTableFullscreen().catch(() => undefined);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (fullscreen && !toolbarVisible) return null;
  const shortcut = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
    ? "Control + Command + F"
    : "F11";
  return (
    <div
      ref={gateRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-fullscreen-title"
      tabIndex={0}
      onClick={() => {
        if (document.fullscreenElement === null) {
          void requestTableFullscreen().catch(() => undefined);
        }
      }}
      className="absolute inset-0 z-20 isolate grid cursor-pointer place-items-center overflow-hidden bg-[#03040b]/96 p-6 text-white outline-none"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(59,130,246,0.16),transparent_27%),radial-gradient(circle_at_35%_65%,rgba(168,85,247,0.1),transparent_30%),radial-gradient(circle_at_70%_30%,rgba(245,158,11,0.07),transparent_24%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[min(72vw,44rem)] -translate-x-1/2 -translate-y-1/2 rotate-6 rounded-full border border-violet-200/8" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[min(54vw,32rem)] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-full border border-dashed border-blue-200/10" />
      <div className="relative w-full max-w-4xl border border-violet-200/20 bg-[linear-gradient(145deg,rgba(15,18,40,0.96),rgba(7,8,20,0.98))] px-8 py-10 text-center shadow-[0_35px_120px_rgba(0,0,0,0.72),0_0_80px_rgba(59,130,246,0.08)] sm:px-16 sm:py-14 [clip-path:polygon(24px_0,100%_0,100%_calc(100%_-_24px),calc(100%_-_24px)_100%,0_100%,0_24px)]">
        <span className="mx-auto grid size-20 place-items-center border border-blue-200/25 bg-blue-400/10 text-blue-100 shadow-[0_0_35px_rgba(59,130,246,0.2)]">
          <MonitorX className="size-9" strokeWidth={1.4} aria-hidden="true" />
        </span>
        <p className="mt-6 font-mono text-[11px] font-medium tracking-[0.3em] text-blue-200/60 uppercase">Player table · display lock</p>
        <h1 id="table-fullscreen-title" className="mt-3 font-heading text-4xl leading-tight text-amber-50 sm:text-6xl">Take over this display</h1>
        <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-violet-100/60 sm:text-lg sm:whitespace-nowrap">The player scene stays concealed until Chrome gives Fantassist the entire screen.</p>
        {fullscreen && toolbarVisible ? (
          <div className="mx-auto mt-7 max-w-2xl border border-amber-200/15 bg-amber-100/5 px-5 py-4 text-left">
            <p className="font-mono text-[10px] tracking-[0.16em] text-amber-100/65 uppercase">Chrome toolbar detected</p>
            <p className="mt-2 text-base leading-6 text-violet-100/65">Press <span className="border border-violet-200/20 bg-black/25 px-2 py-1 font-mono text-sm text-violet-50">{shortcut}</span>. On macOS, turn off <span className="text-amber-50">View → Always Show Toolbar in Full Screen</span>.</p>
          </div>
        ) : !fullscreen ? (
          <p className="mx-auto mt-6 max-w-2xl text-base leading-6 text-violet-100/55 sm:whitespace-nowrap">Click anywhere in this window or press any key to enter fullscreen.</p>
        ) : null}
        {!fullscreen ? (
          <Button
            type="button"
            size="lg"
            onClick={(event) => {
              event.stopPropagation();
              void requestTableFullscreen().catch(() => undefined);
            }}
            className="mx-auto mt-8 h-16 w-full max-w-md rounded-none border border-blue-200/30 bg-[linear-gradient(110deg,rgba(37,99,235,0.72),rgba(109,40,217,0.68),rgba(192,38,211,0.55))] px-10 text-base text-white shadow-[0_0_35px_rgba(59,130,246,0.2)] hover:border-blue-100/50 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-blue-200/70"
          >
            <Maximize className="size-5" /> Enter fullscreen
          </Button>
        ) : null}
        <p className="mt-5 font-mono text-[9px] tracking-[0.18em] text-violet-100/30 uppercase">Esc returns to windowed mode</p>
      </div>
    </div>
  );
}

async function requestTableFullscreen() {
  await document.documentElement.requestFullscreen({ navigationUI: "hide" });
}

async function requestAutomaticTableFullscreen() {
  const screen = await currentManagedScreen();
  const options: FullscreenOptions & { screen?: unknown } = {
    navigationUI: "hide",
    ...(screen ? { screen } : {}),
  };
  await document.documentElement.requestFullscreen(options);
}

async function currentManagedScreen(): Promise<unknown> {
  const permissions = navigator.permissions as { query?: (descriptor: { readonly name: string }) => Promise<{ readonly state: PermissionState }> };
  const getScreenDetails = (window as Window & {
    getScreenDetails?: () => Promise<{ readonly currentScreen?: unknown }>;
  }).getScreenDetails;
  if (!permissions.query || !getScreenDetails) return undefined;
  try {
    const permission = await permissions.query({ name: "window-management" });
    if (permission.state !== "granted") return undefined;
    return (await getScreenDetails.call(window)).currentScreen;
  } catch {
    return undefined;
  }
}

function TableOutputStatus({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black text-center">
      <p className="font-mono text-[10px] tracking-[0.2em] text-violet-100/55 uppercase">{children}</p>
    </div>
  );
}
