import type { DisplayConfiguration } from "@/engine/table-camera";
import type { TableSession } from "@/engine/table-session";
import type { RenderProfile } from "@/renderer/scene-renderer";

type TableSessionMessage =
  | { readonly type: "request-configuration" }
  | {
      readonly type: "configuration";
      readonly display: DisplayConfiguration;
    };

export interface TableSessionChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export type TableSessionChannelFactory = (name: string) => TableSessionChannel;

export function synchronizeTableSession(
  session: TableSession,
  profile: RenderProfile,
  createChannel: TableSessionChannelFactory = (name) => new BroadcastChannel(name)
): () => void {
  const channel = createChannel("fantassist-table-camera");
  let closed = false;
  const publish = () => {
    const snapshot = session.getSnapshot();
    channel.postMessage({
      type: "configuration",
      display: snapshot.display,
    } satisfies TableSessionMessage);
  };

  channel.onmessage = (event) => {
    const message = event.data as TableSessionMessage;
    if (message.type === "request-configuration" && profile === "editor") {
      publish();
    } else if (message.type === "configuration" && profile === "output") {
      session.updateConfiguration({ display: message.display });
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
  queueMicrotask(() => {
    if (closed) return;
    if (profile === "editor") publish();
    else channel.postMessage({ type: "request-configuration" } satisfies TableSessionMessage);
  });

  return () => {
    closed = true;
    unsubscribe();
    channel.close();
  };
}
