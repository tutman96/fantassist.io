interface WakeLockSentinelLike {
  addEventListener(type: "release", listener: () => void): void;
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

interface WakeLockDocumentLike {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export function keepScreenAwake(
  wakeLock: WakeLockLike | undefined = typeof navigator === "undefined" ? undefined : navigator.wakeLock,
  documentValue: WakeLockDocumentLike = document
): () => void {
  let sentinel: WakeLockSentinelLike | null = null;
  let requesting = false;
  let disposed = false;

  const acquire = async () => {
    if (disposed || requesting || sentinel || !wakeLock || documentValue.visibilityState !== "visible") return;
    requesting = true;
    try {
      const next = await wakeLock.request("screen");
      if (disposed || documentValue.visibilityState !== "visible") {
        void next.release().catch(() => undefined);
        return;
      }
      sentinel = next;
      next.addEventListener("release", () => {
        if (sentinel === next) sentinel = null;
      });
    } catch {
      // Wake Lock is optional and may be denied by browser or OS policy.
    } finally {
      requesting = false;
    }
  };

  const handleVisibilityChange = () => {
    if (documentValue.visibilityState === "visible") {
      queueMicrotask(() => void acquire());
    } else if (sentinel) {
      const current = sentinel;
      sentinel = null;
      void current.release().catch(() => undefined);
    }
  };

  documentValue.addEventListener("visibilitychange", handleVisibilityChange);
  void acquire();
  return () => {
    disposed = true;
    documentValue.removeEventListener("visibilitychange", handleVisibilityChange);
    if (sentinel) {
      const current = sentinel;
      sentinel = null;
      void current.release().catch(() => undefined);
    }
  };
}
