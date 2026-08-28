"use client";

import { useState } from "react";

interface ScreenTarget {
  readonly id: string;
  readonly label: string;
  readonly left?: number;
  readonly top?: number;
  readonly width?: number;
  readonly height?: number;
}

interface ScreenDetailsLike {
  readonly screens: readonly {
    readonly label?: string;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  }[];
}

const DEFAULT_TARGET: ScreenTarget = { id: "default", label: "Default screen" };
let tableWindow: Window | null = null;

export function useScreenTargets() {
  const [targets, setTargets] = useState<readonly ScreenTarget[]>([DEFAULT_TARGET]);
  const [targetId, setTargetId] = useState(DEFAULT_TARGET.id);
  const [status, setStatus] = useState("Choose a detected display where supported.");

  const detectScreens = async () => {
    const getScreenDetails = (window as Window & {
      getScreenDetails?: () => Promise<ScreenDetailsLike>;
    }).getScreenDetails;

    if (!getScreenDetails) {
      setStatus("Screen selection is unavailable here. The window can be placed manually.");
      return;
    }

    try {
      const details = await getScreenDetails.call(window);
      const detected = details.screens.map((screen, index) => ({
        id: `screen-${index}`,
        label: screen.label || `Screen ${index + 1} · ${screen.width}×${screen.height}`,
        left: screen.left,
        top: screen.top,
        width: screen.width,
        height: screen.height,
      }));
      setTargets([DEFAULT_TARGET, ...detected]);
      setStatus(`${detected.length} display${detected.length === 1 ? "" : "s"} available.`);
    } catch {
      setStatus("Screen access was not granted. The default screen will be used.");
    }
  };

  const openTable = () => {
    if (tableWindow && !tableWindow.closed) {
      tableWindow.focus();
      setStatus("Player table is already open and was brought forward.");
      return;
    }
    const target = targets.find((candidate) => candidate.id === targetId);
    const features = target?.left === undefined
      ? "popup=yes"
      : `popup=yes,left=${target.left},top=${target.top},width=${target.width},height=${target.height}`;
    tableWindow = window.open("/table", "fantassist-table", features);
    setStatus(tableWindow
      ? "Player table opened. Displayed scenes will update in this window."
      : "The player table popup was blocked. Allow popups and try again.");
  };

  return { targets, targetId, setTargetId, status, detectScreens, openTable };
}
