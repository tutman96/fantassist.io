import assert from "node:assert/strict";
import test from "node:test";

import { createSerialTaskQueue } from "../src/features/campaigns/serial-task-queue";
import { createSceneThumbnailScheduler } from "../src/features/campaigns/scene-thumbnail-scheduler";
import type { SceneThumbnailRequest, SceneThumbnailResponse } from "../src/features/campaigns/scene-thumbnail-protocol";

test("scene thumbnail tasks execute one at a time and continue after failure", async () => {
  const queue = createSerialTaskQueue();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const events: string[] = [];
  const first = queue.enqueue(async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    return 1;
  });
  const second = queue.enqueue(async () => {
    events.push("second:start");
    throw new Error("expected failure");
  });
  const third = queue.enqueue(async () => {
    events.push("third:start");
    return 3;
  });
  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  assert.equal(await first, 1);
  await assert.rejects(second, /expected failure/);
  assert.equal(await third, 3);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "third:start"]);
});

test("scene thumbnail worker messages are structured-clone safe", () => {
  const request: SceneThumbnailRequest = { type: "render", requestId: "request-1", sceneKey: "campaign/scene", expectedVersion: 4 };
  const response: SceneThumbnailResponse = {
    type: "result",
    requestId: request.requestId,
    sceneKey: request.sceneKey,
    version: 4,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
  };
  assert.deepEqual(structuredClone(request), request);
  const cloned = structuredClone(response);
  assert.equal(cloned.type, "result");
  assert.equal(cloned.blob.type, "image/png");
  assert.equal(cloned.blob.size, 3);
});

test("thumbnail cache checks run in parallel while cache misses render serially", async () => {
  const scheduler = createSceneThumbnailScheduler();
  let releaseFirstRender!: () => void;
  const firstRenderGate = new Promise<void>((resolve) => { releaseFirstRender = resolve; });
  const events: string[] = [];
  let firstChecks = 0;
  const first = scheduler.run(
    async () => {
      events.push(`first:cache:${++firstChecks}`);
      return null;
    },
    async () => {
      events.push("first:render");
      await firstRenderGate;
      return "first";
    },
  );
  const second = scheduler.run(
    async () => {
      events.push("second:cache");
      return "cached-second";
    },
    async () => {
      events.push("second:render");
      return "second";
    },
  );
  await Promise.resolve();
  assert.ok(events.includes("first:cache:1"));
  assert.ok(events.includes("second:cache"));
  assert.equal(await second, "cached-second");
  await Promise.resolve();
  assert.ok(events.includes("first:render"));
  assert.equal(events.includes("second:render"), false);
  releaseFirstRender();
  assert.equal(await first, "first");
});
