import type { DisplayConfiguration } from "@/engine/table-camera";
import type { TableSession } from "@/engine/table-session";
import type { RenderProfile } from "@/renderer/scene-renderer";

type TableSessionMessage =
  | { readonly type: "request-configuration" }
  | {
      readonly type: "configuration";
      readonly display: DisplayConfiguration;
    };

export function synchronizeTableSession(session: TableSession, profile: RenderProfile): () => void {
  const channel = new BroadcastChannel("fantassist-table-camera");
  let closed = false;
  const publish = () => {
    const snapshot = session.getSnapshot();
    channel.postMessage({
      type: "configuration",
      display: snapshot.display,
    } satisfies TableSessionMessage);
  };

  channel.onmessage = (event: MessageEvent<TableSessionMessage>) => {
    if (event.data.type === "request-configuration" && profile === "editor") {
      publish();
    } else if (event.data.type === "configuration" && profile === "output") {
      session.updateConfiguration({ display: event.data.display });
    }
  };

  let previousDisplay = session.getSnapshot().display;
  const unsubscribe = profile === "editor"
    ? session.subscribe(() => {
        const snapshot = session.getSnapshot();
        if (snapshot.display === previousDisplay) return;
        previousDisplay = snapshot.display;
        publish();
      })
    : () => undefined;
  if (profile === "output") {
    queueMicrotask(() => {
      if (!closed) channel.postMessage({ type: "request-configuration" } satisfies TableSessionMessage);
    });
  }

  return () => {
    closed = true;
    unsubscribe();
    channel.close();
  };
}
