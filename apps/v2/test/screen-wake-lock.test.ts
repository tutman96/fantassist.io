import assert from "node:assert/strict";
import test from "node:test";

import { keepScreenAwake } from "../src/features/table/screen-wake-lock";

test("table wake lock releases while hidden, reacquires, and cleans up", async () => {
  const sentinels: FakeSentinel[] = [];
  const wakeLock = {
    async request(type: "screen") {
      assert.equal(type, "screen");
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel;
    },
  };
  const documentValue = new FakeDocument();
  const dispose = keepScreenAwake(wakeLock, documentValue);
  await flushMicrotasks();
  assert.equal(sentinels.length, 1);

  documentValue.visibilityState = "hidden";
  documentValue.dispatchVisibilityChange();
  await flushMicrotasks();
  assert.equal(sentinels[0].released, true);

  documentValue.visibilityState = "visible";
  documentValue.dispatchVisibilityChange();
  await flushMicrotasks();
  assert.equal(sentinels.length, 2);

  dispose();
  await flushMicrotasks();
  assert.equal(sentinels[1].released, true);
  assert.equal(documentValue.listenerCount, 0);
});

test("missing or denied wake lock support degrades without throwing", async () => {
  const documentValue = new FakeDocument();
  const unsupported = keepScreenAwake(undefined, documentValue);
  unsupported();
  const denied = keepScreenAwake({ request: async () => { throw new Error("denied"); } }, documentValue);
  await flushMicrotasks();
  denied();
});

class FakeSentinel {
  released = false;
  private releaseListener: (() => void) | undefined;

  addEventListener(type: "release", listener: () => void) {
    assert.equal(type, "release");
    this.releaseListener = listener;
  }

  async release() {
    this.released = true;
    this.releaseListener?.();
  }
}

class FakeDocument {
  visibilityState: DocumentVisibilityState = "visible";
  private readonly listeners = new Set<() => void>();

  get listenerCount() {
    return this.listeners.size;
  }

  addEventListener(type: "visibilitychange", listener: () => void) {
    assert.equal(type, "visibilitychange");
    this.listeners.add(listener);
  }

  removeEventListener(type: "visibilitychange", listener: () => void) {
    assert.equal(type, "visibilitychange");
    this.listeners.delete(listener);
  }

  dispatchVisibilityChange() {
    for (const listener of this.listeners) listener();
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
