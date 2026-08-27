"use client";

import { useEffect, useState } from "react";

import Button from "@mui/material/Button";

import {
  AppVersion,
  VERSION_SWITCH_CHANNEL,
  VERSION_SWITCH_STORAGE_KEY,
} from "@/compat/version";

type VersionSwitchMessage = {
  version: AppVersion;
  timestamp: number;
  source: string;
};

const WINDOW_ID_KEY = "fantassist_window_id";

function getWindowId() {
  let id = window.sessionStorage.getItem(WINDOW_ID_KEY);
  if (!id) {
    id = window.crypto.randomUUID();
    window.sessionStorage.setItem(WINDOW_ID_KEY, id);
  }
  return id;
}

function broadcastVersionSwitch(message: VersionSwitchMessage) {
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(VERSION_SWITCH_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }

  try {
    window.localStorage.setItem(
      VERSION_SWITCH_STORAGE_KEY,
      JSON.stringify(message)
    );
  } catch {
    // BroadcastChannel is the primary coordination mechanism.
  }
}

export function VersionSwitchListener() {
  useEffect(() => {
    function handleSwitch(message?: VersionSwitchMessage) {
      if (message?.source === getWindowId()) return;
      if (window.name === "fantassist-external-window") {
        window.close();
        return;
      }
      window.location.reload();
    }

    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel(VERSION_SWITCH_CHANNEL)
        : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<VersionSwitchMessage>) => {
        handleSwitch(event.data);
      };
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === VERSION_SWITCH_STORAGE_KEY && event.newValue) {
        try {
          handleSwitch(JSON.parse(event.newValue) as VersionSwitchMessage);
        } catch {
          // Ignore malformed coordination messages from unrelated scripts.
        }
      }
    }
    window.addEventListener("storage", handleStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}

export function VersionSwitchButton({
  version,
  children,
  returnTo = "/campaigns",
}: React.PropsWithChildren<{
  version: AppVersion;
  returnTo?: string;
}>) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="contained"
        color={version === "beta" ? "primary" : "secondary"}
        size="large"
        disabled={switching}
        onClick={async () => {
          setSwitching(true);
          setError(null);
          try {
            const response = await fetch("/api/version", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ version, returnTo }),
            });
            if (!response.ok) throw new Error("Version preference was not saved");

            const result = (await response.json()) as { returnTo: string };
            broadcastVersionSwitch({
              version,
              timestamp: Date.now(),
              source: getWindowId(),
            });
            window.location.assign(result.returnTo);
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Unable to switch versions"
            );
            setSwitching(false);
          }
        }}
      >
        {switching ? "Switching..." : children}
      </Button>
      {error ? (
        <span role="alert" style={{ color: "#e25358", marginTop: 12 }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
