import assert from "node:assert/strict";
import test from "node:test";

import { createSampleSceneDocument } from "../src/engine/scene-document";
import type { SceneDocument } from "../src/engine/scene-document";
import { createSceneEngine } from "../src/engine/scene-engine";
import { createTableSession } from "../src/engine/table-session";
import { synchronizeSceneEngine } from "../src/features/presentation/scene-session-channel";
import type { SceneSessionChannel } from "../src/features/presentation/scene-session-channel";
import { synchronizeTableSession } from "../src/features/presentation/table-session-channel";
import type { TableSessionChannel } from "../src/features/presentation/table-session-channel";

type TestChannel = SceneSessionChannel & TableSessionChannel;

class FakeChannelHub {
  readonly messages: unknown[] = [];
  readonly channels = new Set<FakeChannel>();

  readonly factory = (name: string): TestChannel => {
    const channel = new FakeChannel(this, name);
    this.channels.add(channel);
    return channel;
  };
}

class FakeChannel implements TestChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  closed = false;

  constructor(
    private readonly hub: FakeChannelHub,
    private readonly name: string
  ) {}

  postMessage(message: unknown): void {
    if (this.closed) throw new Error("Cannot post to a closed channel");
    this.hub.messages.push(message);
    for (const peer of this.hub.channels) {
      if (peer !== this && !peer.closed && peer.name === this.name) {
        peer.onmessage?.({ data: message } as MessageEvent<unknown>);
      }
    }
  }

  close(): void {
    this.closed = true;
    this.hub.channels.delete(this);
  }
}

const flushMicrotasks = () => Promise.resolve();

function sceneWith(id: string, version: number, name = id): SceneDocument {
  return { ...createSampleSceneDocument(), id, name, version };
}

function messagesOfType<T extends string>(hub: FakeChannelHub, type: T) {
  return hub.messages.filter(
    (message): message is { readonly type: T; readonly [key: string]: unknown } =>
      typeof message === "object" && message !== null && "type" in message && message.type === type
  );
}

test("editor publishes its current committed scene on mount", async () => {
  const hub = new FakeChannelHub();
  const engine = createSceneEngine(sceneWith("scene/editor", 4));
  const dispose = synchronizeSceneEngine(engine, "editor", hub.factory);

  assert.equal(hub.messages.length, 0);
  await flushMicrotasks();

  const messages = messagesOfType(hub, "scene");
  assert.equal(messages.length, 1);
  assert.equal((messages[0].scene as SceneDocument).id, "scene/editor");
  assert.equal(messages[0].revision, 4);
  dispose();
});

test("editor publishes a different scene with an equal revision", async () => {
  const hub = new FakeChannelHub();
  const engine = createSceneEngine(sceneWith("scene/first", 2));
  const dispose = synchronizeSceneEngine(engine, "editor", hub.factory);
  await flushMicrotasks();
  hub.messages.length = 0;

  engine.replaceCommittedScene(sceneWith("scene/second", 2), 2);

  const messages = messagesOfType(hub, "scene");
  assert.equal(messages.length, 1);
  assert.equal((messages[0].scene as SceneDocument).id, "scene/second");
  assert.equal(messages[0].revision, 2);
  dispose();
});

test("output accepts a lower revision when the scene ID differs", () => {
  const hub = new FakeChannelHub();
  const output = createSceneEngine(sceneWith("scene/high", 20));
  const dispose = synchronizeSceneEngine(output, "output", hub.factory);
  const sender = hub.factory("fantassist-scene");

  sender.postMessage({ type: "scene", scene: sceneWith("scene/low", 1), revision: 1 });

  assert.equal(output.getSnapshot().scene.id, "scene/low");
  assert.equal(output.getSnapshot().revision, 1);
  sender.close();
  dispose();
});

test("output rejects stale and duplicate revisions for the same scene ID", () => {
  const hub = new FakeChannelHub();
  const output = createSceneEngine(sceneWith("scene/shared", 5, "original"));
  let replacements = 0;
  output.subscribe(() => replacements++);
  const dispose = synchronizeSceneEngine(output, "output", hub.factory);
  const sender = hub.factory("fantassist-scene");

  sender.postMessage({ type: "scene", scene: sceneWith("scene/shared", 4, "stale"), revision: 4 });
  sender.postMessage({ type: "scene", scene: sceneWith("scene/shared", 5, "equal"), revision: 5 });
  assert.equal(output.getSnapshot().scene.name, "original");
  assert.equal(replacements, 0);

  sender.postMessage({ type: "scene", scene: sceneWith("scene/shared", 6, "newer"), revision: 6 });
  sender.postMessage({ type: "scene", scene: sceneWith("scene/shared", 6, "duplicate"), revision: 6 });
  assert.equal(output.getSnapshot().scene.name, "newer");
  assert.equal(output.getSnapshot().revision, 6);
  assert.equal(replacements, 1);
  sender.close();
  dispose();
});

test("remounting an editor announces its scene and heals an output that missed a change", async () => {
  const hub = new FakeChannelHub();
  const editor = createSceneEngine(sceneWith("scene/shared", 0));
  const firstMount = synchronizeSceneEngine(editor, "editor", hub.factory);
  await flushMicrotasks();
  firstMount();

  editor.replaceCommittedScene(sceneWith("scene/shared", 1, "updated while absent"), 1);
  const output = createSceneEngine(sceneWith("scene/shared", 0, "stale output"));
  const disposeOutput = synchronizeSceneEngine(output, "output", hub.factory);
  await flushMicrotasks();
  assert.equal(output.getSnapshot().revision, 0);

  const secondMount = synchronizeSceneEngine(editor, "editor", hub.factory);
  await flushMicrotasks();
  assert.equal(output.getSnapshot().revision, 1);
  assert.equal(output.getSnapshot().scene.name, "updated while absent");

  secondMount();
  disposeOutput();
});

test("editor publishes only its current display configuration on mount", async () => {
  const hub = new FakeChannelHub();
  const session = createTableSession();
  const display = { resolutionPx: { width: 2560, height: 1440 }, diagonalInches: 32 };
  session.updateConfiguration({ display });
  const dispose = synchronizeTableSession(session, "editor", hub.factory);

  assert.equal(hub.messages.length, 0);
  await flushMicrotasks();

  assert.deepEqual(messagesOfType(hub, "configuration"), [{ type: "configuration", display }]);
  dispose();
});

test("closing channels suppresses all queued mount messages", async () => {
  const sceneHub = new FakeChannelHub();
  const tableHub = new FakeChannelHub();
  const disposers = [
    synchronizeSceneEngine(createSceneEngine(), "editor", sceneHub.factory),
    synchronizeSceneEngine(createSceneEngine(), "output", sceneHub.factory),
    synchronizeTableSession(createTableSession(), "editor", tableHub.factory),
    synchronizeTableSession(createTableSession(), "output", tableHub.factory),
  ];

  disposers.forEach((dispose) => dispose());
  await flushMicrotasks();

  assert.deepEqual(sceneHub.messages, []);
  assert.deepEqual(tableHub.messages, []);
});
