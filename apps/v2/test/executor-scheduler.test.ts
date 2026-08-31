import assert from "node:assert/strict";
import test from "node:test";

import { init, target } from "vgpu/node";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { createSceneEngine } from "../src/engine/scene-engine";
import { DEFAULT_DISPLAY } from "../src/engine/table-camera";
import { effectGeometryKey } from "../src/renderer/effect-resource-key";
import { SerializedExecutorScheduler } from "../src/renderer/executor-scheduler";
import { createRenderPlan } from "../src/renderer/render-plan";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

test("serialized executor scheduler coalesces mutations without overlapping calls", async () => {
  type Snapshot = { readonly id: string };
  let active = 0;
  let maximumActive = 0;
  let resources = "a";
  let snapshot = "a";
  let view = "initial";
  let size: readonly [number, number] = [1, 1];
  let gridVisible = false;
  let tableEditing = false;
  const rendered: number[] = [];
  const renderStarted = deferred();
  const releaseRender = deferred();
  const call = async <T>(run: () => T | Promise<T>) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    try { return await run(); } finally { active--; }
  };
  const syncCall = (run: () => void) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    try { run(); } finally { active--; }
  };
  const scheduler = new SerializedExecutorScheduler<Snapshot, string>({
    resourcesCurrent: (next) => resources === next.id,
    synchronizeResources: (next, isCurrent) => call(async () => {
      await Promise.resolve();
      if (!isCurrent()) return false;
      resources = next.id;
      return true;
    }),
    resize: (next) => syncCall(() => { size = next; }),
    setView: (next) => syncCall(() => { view = next; }),
    setGridVisible: (next) => syncCall(() => { gridVisible = next; }),
    setTableEditing: (next) => syncCall(() => { tableEditing = next; }),
    setSnapshot: (next) => syncCall(() => { snapshot = next.id; }),
    render: (time) => call(async () => {
      rendered.push(time);
      if (time === 0) {
        renderStarted.resolve();
        await releaseRender.promise;
      }
    }),
  }, {
    snapshot: { id: "a" }, view: "initial", gridVisible: false, tableEditing: false,
  }, (error) => { throw error; });

  scheduler.requestRender(0);
  await renderStarted.promise;
  scheduler.resize([100, 60]);
  scheduler.resize([320, 180]);
  scheduler.setView("intermediate");
  scheduler.setView("latest");
  scheduler.setGridVisible(true);
  scheduler.setTableEditing(true);
  scheduler.setSnapshot({ id: "b" });
  scheduler.setSnapshot({ id: "c" });
  scheduler.requestRender(1);
  scheduler.requestRender(2);
  releaseRender.resolve();
  await scheduler.settled();

  assert.equal(maximumActive, 1);
  assert.deepEqual(size, [320, 180]);
  assert.equal(view, "latest");
  assert.equal(gridVisible, true);
  assert.equal(tableEditing, true);
  assert.equal(resources, "c");
  assert.equal(snapshot, "c");
  assert.deepEqual(rendered, [0, 2]);
});

test("stale intermediate replacement recomputes from each successfully applied resource category", async () => {
  type Snapshot = { readonly id: string; readonly asset: string; readonly fog: string; readonly effect: string };
  const a = { id: "a", asset: "a", fog: "a", effect: "a" };
  const b = { id: "b", asset: "b", fog: "b", effect: "b" };
  const c = { id: "c", asset: "b", fog: "a", effect: "c" };
  const bPartiallyApplied = deferred();
  const releaseB = deferred();
  const resources = { asset: a.asset, fog: a.fog, effect: a.effect };
  let appliedSnapshot = a.id;
  const scheduler = new SerializedExecutorScheduler<Snapshot, string>({
    resourcesCurrent: (next) => resources.asset === next.asset && resources.fog === next.fog && resources.effect === next.effect,
    async synchronizeResources(next, isCurrent) {
      if (resources.asset !== next.asset) resources.asset = next.asset;
      if (next.id === "b") {
        bPartiallyApplied.resolve();
        await releaseB.promise;
      }
      if (!isCurrent()) return false;
      resources.fog = next.fog;
      resources.effect = next.effect;
      return true;
    },
    resize() {}, setView() {}, setGridVisible() {}, setTableEditing() {},
    setSnapshot: (next) => { appliedSnapshot = next.id; },
    async render() {},
  }, { snapshot: a, view: "view", gridVisible: false, tableEditing: false }, (error) => { throw error; });

  scheduler.setSnapshot(b);
  await bPartiallyApplied.promise;
  scheduler.setSnapshot(c);
  releaseB.resolve();
  await scheduler.settled();
  assert.deepEqual(resources, { asset: "b", fog: "a", effect: "c" });
  assert.equal(appliedSnapshot, "c");
});

test("scheduler disposal suppresses stale generation work and later operations", async () => {
  const started = deferred();
  const release = deferred();
  const calls: string[] = [];
  const scheduler = new SerializedExecutorScheduler<{ readonly id: string }, string>({
    resourcesCurrent: (snapshot) => snapshot.id === "a",
    async synchronizeResources(snapshot, isCurrent) {
      calls.push(`replace:${snapshot.id}`);
      started.resolve();
      await release.promise;
      return isCurrent();
    },
    resize: () => calls.push("resize"),
    setView: () => calls.push("view"),
    setGridVisible: () => calls.push("grid"),
    setTableEditing: () => calls.push("table"),
    setSnapshot: (snapshot) => calls.push(`snapshot:${snapshot.id}`),
    render: async (time) => { calls.push(`render:${time}`); },
  }, { snapshot: { id: "a" }, view: "view", gridVisible: false, tableEditing: false }, (error) => { throw error; });

  scheduler.setSnapshot({ id: "b" });
  await started.promise;
  scheduler.requestRender(1);
  scheduler.dispose();
  release.resolve();
  await scheduler.settled();
  scheduler.setSnapshot({ id: "c" });
  scheduler.requestRender(2);
  await Promise.resolve();
  assert.deepEqual(calls, ["replace:b"]);
});

test("scheduler disposal settles work queued before its drain microtask", async () => {
  const calls: string[] = [];
  const scheduler = new SerializedExecutorScheduler({
    resourcesCurrent: () => true,
    async synchronizeResources() { calls.push("replace"); return true; },
    resize: () => calls.push("resize"),
    setView: () => calls.push("view"),
    setGridVisible: () => calls.push("grid"),
    setTableEditing: () => calls.push("table"),
    setSnapshot: () => calls.push("snapshot"),
    render: async () => { calls.push("render"); },
  }, { snapshot: "snapshot", view: "view", gridVisible: false, tableEditing: false }, (error) => { throw error; });

  scheduler.resize([320, 180]);
  scheduler.requestRender(1);
  scheduler.dispose();
  await scheduler.settled();
  await Promise.resolve();
  assert.deepEqual(calls, []);
});

test("scheduler continues after an operation error", async () => {
  const errors: unknown[] = [];
  const rendered: number[] = [];
  let fail = true;
  const scheduler = new SerializedExecutorScheduler({
    resourcesCurrent: () => true,
    async synchronizeResources() { return true; },
    resize() {}, setView() {}, setGridVisible() {}, setTableEditing() {}, setSnapshot() {},
    async render(time: number) {
      if (fail) { fail = false; throw new Error("expected"); }
      rendered.push(time);
    },
  }, { snapshot: "snapshot", view: "view", gridVisible: false, tableEditing: false }, (error) => errors.push(error));
  scheduler.requestRender(1);
  await scheduler.settled();
  scheduler.requestRender(2);
  await scheduler.settled();
  assert.equal(errors.length, 1);
  assert.deepEqual(rendered, [2]);
});

test("scheduler clamps stale resize frames to the last completed render time", async () => {
  const rendered: number[] = [];
  const scheduler = new SerializedExecutorScheduler({
    resourcesCurrent: () => true,
    async synchronizeResources() { return true; },
    resize() {}, setView() {}, setGridVisible() {}, setTableEditing() {}, setSnapshot() {},
    async render(time: number) { rendered.push(time); },
  }, { snapshot: "snapshot", view: "view", gridVisible: false, tableEditing: false }, (error) => { throw error; });

  scheduler.requestRender(1.0945);
  await scheduler.settled();
  scheduler.resize([640, 360]);
  scheduler.requestRender(0);
  await scheduler.settled();

  assert.deepEqual(rendered, [1.0945, 1.0945]);
  assert.throws(() => scheduler.requestRender(Number.NaN), /finite/);
});

test("vgpu rain executor tolerates coalesced resize, view, table, effect, and render stress", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const sceneAt = (revision: number) => freezeSceneDocument({
    ...base,
    id: "scheduler/stress",
    layers: [{
      id: "weather", name: "Weather", type: "effects" as const, visible: true, effects: [{
        id: "rain", kind: "rain" as const, name: "Rain", visible: true,
        vertices: [{ x: 4, y: 4 }, { x: 22, y: 4 }, { x: 22, y: 16 }, { x: 4, y: 16 }],
        seed: 9001, color: { r: 205, g: 225, b: 255 }, opacity: 0.72,
        density: 1 + revision % 4, speed: 4 + revision % 12, dropSize: 0.5 + revision * 0.01,
      }],
    }],
    assets: [],
  });
  const snapshots = Array.from({ length: 20 }, (_, index) => {
    const engine = createSceneEngine(sceneAt(index));
    const snapshot = engine.getSnapshot();
    engine.dispose();
    return snapshot;
  });
  const initialView = {
    kind: "editor" as const,
    table: snapshots[0].scene.table,
    display: DEFAULT_DISPLAY,
    camera: { centerGrid: { x: 13, y: 10 }, cssPixelsPerGrid: 12 },
    viewportCss: { width: 320, height: 180 },
  };
  const gpu = await init({ adapter: "auto", label: "executor-scheduler-stress" });
  const errors: unknown[] = [];
  const stopErrors = gpu.onError((error) => errors.push(error));
  const destination = target(gpu, { size: [320, 180], format: "rgba8unorm", label: "executor-scheduler-stress" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("editor"), await loadSceneShaders(), initialView, snapshots[0],
    );
    executor.setGridVisible(false);
    await executor.prewarm();
    let appliedEffects = snapshots[0];
    const scheduler = new SerializedExecutorScheduler({
      resourcesCurrent: (snapshot) => effectGeometryKey(appliedEffects) === effectGeometryKey(snapshot),
      async synchronizeResources(snapshot, isCurrent) {
        if (!isCurrent()) return false;
        await executor.replaceEffects(snapshot);
        appliedEffects = snapshot;
        return isCurrent();
      },
      resize(size) {
        destination.resize(size);
        executor.resize(size);
      },
      setView: (view) => executor.setView(view),
      setGridVisible: (visible) => executor.setGridVisible(visible),
      setTableEditing: (editing) => executor.setTableEditing(editing),
      setSnapshot: (snapshot) => executor.setSnapshot(snapshot),
      render: (time) => executor.render(time),
    }, { snapshot: snapshots[0], view: initialView, gridVisible: false, tableEditing: false }, (error) => errors.push(error));

    await Promise.all(snapshots.slice(1).map(async (snapshot, index) => {
      await Promise.resolve();
      scheduler.requestRender((index + 1) * 0.03);
      scheduler.resize(index % 2 === 0 ? [300, 170] : [340, 200]);
      scheduler.setView({
        ...initialView,
        table: {
          ...initialView.table,
          originGrid: { x: index * 0.1, y: -index * 0.05 },
          scale: 1 + index * 0.01,
        },
        camera: { centerGrid: { x: 13 + index * 0.1, y: 10 - index * 0.05 }, cssPixelsPerGrid: 10 + index },
      });
      scheduler.setSnapshot(snapshot);
      scheduler.setTableEditing(index % 2 === 0);
    }));
    const finalSnapshot = snapshots.at(-1)!;
    const finalSize = [360, 220] as const;
    const finalView = {
      ...initialView,
      table: { ...initialView.table, originGrid: { x: 2, y: -1 }, scale: 1.2 },
      camera: { centerGrid: { x: 13, y: 10 }, cssPixelsPerGrid: 16 },
      viewportCss: { width: finalSize[0], height: finalSize[1] },
    };
    scheduler.resize(finalSize);
    scheduler.setView(finalView);
    scheduler.setSnapshot(finalSnapshot);
    scheduler.setTableEditing(false);
    scheduler.requestRender(1);
    await scheduler.settled();
    await gpu.settled();
    const pixels = await destination.read();
    assert.deepEqual(destination.size, finalSize);
    assert.ok(pixels.some((value, index) => index % 4 !== 3 && value > 3), "final resized frame should contain rain pixels");
    assert.equal(errors.length, 0, `unexpected GPU/scheduler errors: ${errors}`);
    assert.equal((await executor.effectEmissionDiagnostics(1))[0].effectId, "rain");

    scheduler.resize([362, 222]);
    scheduler.requestRender(0);
    await scheduler.settled();
    await gpu.settled();
    assert.deepEqual(destination.size, [362, 222]);
    assert.ok((await destination.read()).some((value, index) => index % 4 !== 3 && value > 3));
    assert.equal(errors.length, 0, `stale-time resize should not reach the emitter: ${errors}`);
    scheduler.dispose();
  } finally {
    stopErrors();
    gpu.dispose();
  }
});
