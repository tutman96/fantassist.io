"use client";

import { useEffect, useRef, useState } from "react";

import { observeTableWindow } from "@/features/table/table-window-channel";
import type { TableWindowFocusCommand } from "@/features/table/table-window-channel";

export interface ScreenTarget {
  readonly id: string;
  readonly label: string;
  readonly isPrimary: boolean;
  readonly left?: number;
  readonly top?: number;
  readonly width?: number;
  readonly height?: number;
  readonly resolutionWidth?: number;
  readonly resolutionHeight?: number;
  readonly devicePixelRatio?: number;
  readonly isInternal?: boolean;
  readonly availLeft?: number;
  readonly availTop?: number;
  readonly availWidth?: number;
  readonly availHeight?: number;
  readonly colorDepth?: number;
  readonly pixelDepth?: number;
  readonly orientationType?: string;
  readonly orientationAngle?: number;
}

interface ScreenDetailsLike {
  readonly screens: readonly {
    readonly label?: string;
    readonly isPrimary?: boolean;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly devicePixelRatio?: number;
    readonly isInternal?: boolean;
    readonly availLeft?: number;
    readonly availTop?: number;
    readonly availWidth?: number;
    readonly availHeight?: number;
    readonly colorDepth?: number;
    readonly pixelDepth?: number;
    readonly orientation?: { readonly type?: string; readonly angle?: number };
  }[];
}

export type ScreenAccessStatus = "checking" | "available" | "permission-required" | "denied" | "unavailable";

const DEFAULT_TARGET: ScreenTarget = { id: "default", label: "Current display", isPrimary: true };
let tableWindow: Window | null = null;

export function useScreenTargets() {
  const [targets, setTargets] = useState<readonly ScreenTarget[]>([DEFAULT_TARGET]);
  const [targetId, setTargetId] = useState(DEFAULT_TARGET.id);
  const [accessStatus, setAccessStatus] = useState<ScreenAccessStatus>("checking");
  const [status, setStatus] = useState("Checking for connected displays.");
  const tablePresence = useRef({ present: false, lastSeen: 0 });
  const tableObserver = useRef<ReturnType<typeof observeTableWindow> | null>(null);

  const installScreens = (details: ScreenDetailsLike) => {
    const detected = screenTargetsFromDetails(details);
    setTargets(detected.length > 0 ? detected : [DEFAULT_TARGET]);
    setTargetId((current) => detected.some((target) => target.id === current)
      ? current
      : detected.find((target) => !target.isPrimary)?.id ?? detected[0]?.id ?? DEFAULT_TARGET.id);
    setAccessStatus("available");
    setStatus(`${detected.length} display${detected.length === 1 ? "" : "s"} available.`);
  };

  const detectScreens = async () => {
    const getScreenDetails = screenDetailsFunction();
    if (!getScreenDetails) {
      setAccessStatus("unavailable");
      setStatus("Chrome screen selection is unavailable. Open the table on this display and move it manually.");
      return;
    }
    try {
      installScreens(await getScreenDetails.call(window));
    } catch {
      setAccessStatus("denied");
      setStatus("Screen access was denied. Configure the table window manually.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const getScreenDetails = screenDetailsFunction();
    if (!getScreenDetails) {
      queueMicrotask(() => {
        if (!cancelled) {
          setAccessStatus("unavailable");
          setStatus("Screen selection is unavailable in this browser.");
        }
      });
      return () => {
        cancelled = true;
      };
    }
    const permissions = navigator.permissions as PermissionApiLike | undefined;
    if (!permissions?.query) {
      queueMicrotask(() => {
        if (!cancelled) {
          setAccessStatus("permission-required");
          setStatus("Allow screen access to choose a connected display.");
        }
      });
      return () => {
        cancelled = true;
      };
    }
    void permissions.query({ name: "window-management" }).then(async (permission) => {
      if (cancelled) return;
      if (permission.state !== "granted") {
        setAccessStatus(permission.state === "denied" ? "denied" : "permission-required");
        setStatus(permission.state === "denied"
          ? "Screen access is blocked. Configure the table window manually."
          : "Allow screen access to choose a connected display.");
        return;
      }
      try {
        const details = await getScreenDetails.call(window);
        if (!cancelled) installScreens(details);
      } catch {
        if (!cancelled) {
          setAccessStatus("permission-required");
          setStatus("Allow screen access to choose a connected display.");
        }
      }
    }).catch(() => {
      if (!cancelled) {
        setAccessStatus("permission-required");
        setStatus("Allow screen access to choose a connected display.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const observer = observeTableWindow(() => {
      tablePresence.current = { present: true, lastSeen: Date.now() };
    });
    tableObserver.current = observer;
    const expiry = window.setInterval(() => {
      if (Date.now() - tablePresence.current.lastSeen > 2_500) {
        tablePresence.current = { present: false, lastSeen: 0 };
      }
    }, 1_000);
    return () => {
      window.clearInterval(expiry);
      observer.close();
      if (tableObserver.current === observer) tableObserver.current = null;
    };
  }, []);

  const openTable = (requestedTargetId = targetId) => {
    const target = targets.find((candidate) => candidate.id === requestedTargetId) ?? targets[0] ?? DEFAULT_TARGET;
    const automaticFullscreen = !target.isPrimary && target.left !== undefined;
    const url = automaticFullscreen ? "/table?fullscreen=auto" : "/table?mode=window";
    const bounds = popupBounds(target, automaticFullscreen) ?? undefined;
    const command: TableWindowFocusCommand = { route: url, ...(bounds ? { bounds } : {}) };
    setTargetId(target.id);
    const recovered = tableWindow && !tableWindow.closed
      ? tableWindow
      : window.open("", "fantassist-table", popupFeatures(target, automaticFullscreen));
    if (!recovered) {
      if (tablePresence.current.present) {
        tableObserver.current?.focus(command);
        setStatus("The existing player table was asked to come forward.");
      } else {
        setStatus("The player table popup was blocked. Allow popups and try again.");
      }
      return;
    }
    let recoveredRoute = "";
    let recoveredBlank = false;
    try {
      recoveredRoute = `${recovered.location.pathname}${recovered.location.search}`;
      recoveredBlank = recovered.location.href === "about:blank";
    } catch {
      // A named context outside this origin cannot be inspected directly.
    }
    if ((recoveredBlank || !recoveredRoute) && tablePresence.current.present) {
      recovered.close();
      tableObserver.current?.focus(command);
      setStatus("The existing player table was recovered and brought forward.");
      return;
    }
    tableWindow = recovered;
    if (!recoveredBlank && recoveredRoute) {
      try {
        if (bounds) {
          recovered.moveTo(bounds.left, bounds.top);
          recovered.resizeTo(bounds.width, bounds.height);
        }
        if (recoveredRoute !== url) {
          recovered.location.replace(url);
        }
      } catch {
        // Some browsers allow focusing an existing popup but not moving it.
      }
      recovered.focus();
      setStatus("Player table is already open and was brought forward.");
      return;
    }
    recovered.location.replace(url);
    setStatus(automaticFullscreen
      ? `Player table opened on ${target.label}. Fullscreen will be requested where Chrome permits it.`
      : `Player table opened on ${target.label}.`);
  };

  return { targets, targetId, setTargetId, accessStatus, status, detectScreens, openTable };
}

export function screenTargetsFromDetails(details: ScreenDetailsLike): readonly ScreenTarget[] {
  return details.screens.map((screen, index) => {
    const pixelRatio = screen.devicePixelRatio && screen.devicePixelRatio > 0 ? screen.devicePixelRatio : 1;
    return {
      id: `screen-${index}-${screen.left}-${screen.top}-${screen.width}x${screen.height}`,
      label: screen.label || `Display ${index + 1}`,
      isPrimary: screen.isPrimary ?? index === 0,
      left: screen.left,
      top: screen.top,
      width: screen.width,
      height: screen.height,
      resolutionWidth: Math.round(screen.width * pixelRatio),
      resolutionHeight: Math.round(screen.height * pixelRatio),
      devicePixelRatio: pixelRatio,
      isInternal: screen.isInternal,
      availLeft: screen.availLeft,
      availTop: screen.availTop,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      orientationType: screen.orientation?.type,
      orientationAngle: screen.orientation?.angle,
    };
  });
}

export function popupFeatures(target: ScreenTarget, fullscreen: boolean): string {
  const base = [
    "popup=yes",
    "toolbar=no",
    "location=no",
    "menubar=no",
    "status=no",
    "scrollbars=no",
    "resizable=yes",
    ...(fullscreen ? ["fullscreen=yes"] : []),
  ];
  const bounds = popupBounds(target, fullscreen);
  if (bounds) {
    base.push(`left=${bounds.left}`, `top=${bounds.top}`, `width=${bounds.width}`, `height=${bounds.height}`);
  }
  return base.join(",");
}

function popupBounds(target: ScreenTarget, fullscreen: boolean) {
  if (target.left === undefined || target.top === undefined || !target.width || !target.height) return null;
  if (fullscreen) return { left: target.left, top: target.top, width: target.width, height: target.height };
  const width = Math.min(1280, Math.round(target.width * 0.82));
  const height = Math.min(800, Math.round(target.height * 0.82));
  return {
    left: Math.round(target.left + (target.width - width) / 2),
    top: Math.round(target.top + (target.height - height) / 2),
    width,
    height,
  };
}

function screenDetailsFunction() {
  return typeof window === "undefined"
    ? undefined
    : (window as Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> }).getScreenDetails;
}

interface PermissionApiLike {
  query(descriptor: { readonly name: string }): Promise<{ readonly state: PermissionState }>;
}
