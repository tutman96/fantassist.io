import type { DisplayConfiguration, TableCamera } from "@/engine/table-camera";
import type { TableSession } from "@/engine/table-session";
import type { RenderProfile } from "@/renderer/scene-renderer";

type TableSessionMessage =
  | { readonly type: "request-configuration" }
  | {
      readonly type: "configuration";
      readonly display: DisplayConfiguration;
      readonly table: TableCamera;
    };

export function synchronizeTableSession(session: TableSession, profile: RenderProfile): () => void {
  const channel = new BroadcastChannel("fantassist-table-camera");
  const publish = () => {
    const snapshot = session.getSnapshot();
    channel.postMessage({
      type: "configuration",
      display: snapshot.display,
      table: snapshot.table,
    } satisfies TableSessionMessage);
  };

  channel.onmessage = (event: MessageEvent<TableSessionMessage>) => {
    if (event.data.type === "request-configuration" && profile === "editor") {
      publish();
    } else if (event.data.type === "configuration" && profile === "output") {
      session.updateConfiguration({ display: event.data.display, table: event.data.table });
    }
  };

  let previousDisplay = session.getSnapshot().display;
  let previousTable = session.getSnapshot().table;
  const unsubscribe = profile === "editor"
    ? session.subscribe(() => {
        const snapshot = session.getSnapshot();
        if (snapshot.display === previousDisplay && snapshot.table === previousTable) return;
        previousDisplay = snapshot.display;
        previousTable = snapshot.table;
        publish();
      })
    : () => undefined;
  if (profile === "output") {
    queueMicrotask(() => channel.postMessage({ type: "request-configuration" } satisfies TableSessionMessage));
  }

  return () => {
    unsubscribe();
    channel.close();
  };
}
