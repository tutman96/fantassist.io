import type { SceneDocument } from "@/engine/scene-document";
import type { SceneEngine } from "@/engine/scene-engine";
import type { RenderProfile } from "@/renderer/scene-renderer";

type SceneSessionMessage =
  | { readonly type: "request-scene" }
  | { readonly type: "scene"; readonly scene: SceneDocument; readonly revision: number };

export interface SceneSessionChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export type SceneSessionChannelFactory = (name: string) => SceneSessionChannel;

export function synchronizeSceneEngine(
  engine: SceneEngine,
  profile: RenderProfile,
  createChannel: SceneSessionChannelFactory = (name) => new BroadcastChannel(name)
): () => void {
  const channel = createChannel("fantassist-scene");
  let closed = false;
  const publish = () => {
    const snapshot = engine.getCommittedSnapshot();
    channel.postMessage({
      type: "scene",
      scene: snapshot.scene,
      revision: snapshot.revision,
    } satisfies SceneSessionMessage);
  };

  channel.onmessage = (event) => {
    const message = event.data as SceneSessionMessage;
    if (message.type === "request-scene" && profile === "editor") {
      publish();
    } else if (
      message.type === "scene" &&
      profile === "output" &&
      (message.scene.id !== engine.getSnapshot().scene.id ||
        message.revision > engine.getSnapshot().revision)
    ) {
      engine.replaceCommittedScene(message.scene, message.revision);
    }
  };

  let previousSnapshot = engine.getCommittedSnapshot();
  const unsubscribe = profile === "editor"
    ? engine.subscribe(() => {
        const snapshot = engine.getCommittedSnapshot();
        if (
          snapshot.scene.id === previousSnapshot.scene.id &&
          snapshot.revision === previousSnapshot.revision
        ) return;
        previousSnapshot = snapshot;
        publish();
      })
    : () => undefined;
  queueMicrotask(() => {
    if (closed) return;
    if (profile === "editor") publish();
    else channel.postMessage({ type: "request-scene" } satisfies SceneSessionMessage);
  });

  return () => {
    closed = true;
    unsubscribe();
    channel.close();
  };
}
