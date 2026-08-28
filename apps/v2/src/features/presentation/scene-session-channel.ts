import type { SceneDocument } from "@/engine/scene-document";
import type { SceneEngine } from "@/engine/scene-engine";
import type { RenderProfile } from "@/renderer/scene-renderer";

type SceneSessionMessage =
  | { readonly type: "request-scene" }
  | { readonly type: "scene"; readonly scene: SceneDocument; readonly revision: number };

export function synchronizeSceneEngine(engine: SceneEngine, profile: RenderProfile): () => void {
  const channel = new BroadcastChannel("fantassist-scene");
  const publish = () => {
    const snapshot = engine.getCommittedSnapshot();
    channel.postMessage({
      type: "scene",
      scene: snapshot.scene,
      revision: snapshot.revision,
    } satisfies SceneSessionMessage);
  };

  channel.onmessage = (event: MessageEvent<SceneSessionMessage>) => {
    if (event.data.type === "request-scene" && profile === "editor") {
      publish();
    } else if (
      event.data.type === "scene" &&
      profile === "output" &&
      event.data.revision >= engine.getSnapshot().revision
    ) {
      engine.replaceCommittedScene(event.data.scene, event.data.revision);
    }
  };

  let previousRevision = engine.getSnapshot().revision;
  const unsubscribe = profile === "editor"
    ? engine.subscribe(() => {
        const revision = engine.getSnapshot().revision;
        if (revision === previousRevision) return;
        previousRevision = revision;
        publish();
      })
    : () => undefined;
  if (profile === "output") {
    queueMicrotask(() => channel.postMessage({ type: "request-scene" } satisfies SceneSessionMessage));
  }

  return () => {
    unsubscribe();
    channel.close();
  };
}
