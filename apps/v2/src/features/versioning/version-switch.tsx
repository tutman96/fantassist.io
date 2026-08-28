"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const VERSION_SWITCH_CHANNEL = "fantassist:version";
const VERSION_SWITCH_STORAGE_KEY = "fantassist_version_switch";
const WINDOW_ID_KEY = "fantassist_window_id";

type VersionSwitchMessage = {
  version: "stable";
  timestamp: number;
  source: string;
};

function getWindowId() {
  let id = window.sessionStorage.getItem(WINDOW_ID_KEY);
  if (!id) {
    id = window.crypto.randomUUID();
    window.sessionStorage.setItem(WINDOW_ID_KEY, id);
  }
  return id;
}

function broadcastSwitch(message: VersionSwitchMessage) {
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
      if (event.key !== VERSION_SWITCH_STORAGE_KEY || !event.newValue) return;
      try {
        handleSwitch(JSON.parse(event.newValue) as VersionSwitchMessage);
      } catch {
        // Ignore malformed coordination messages.
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

export function StableVersionButton() {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <Button
        size="lg"
        disabled={switching}
        onClick={async () => {
          setSwitching(true);
          setError(null);
          try {
            const response = await fetch("/api/version", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                version: "stable",
                returnTo: "/campaigns",
              }),
            });
            if (!response.ok) throw new Error("Version preference was not saved");

            const result = (await response.json()) as { returnTo: string };
            broadcastSwitch({
              version: "stable",
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
        {switching ? "Switching..." : "Return to stable Fantassist"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
