import { createSerialTaskQueue } from "./serial-task-queue";

export interface SceneThumbnailScheduler {
  run<T>(readCached: () => Promise<T | null>, render: () => Promise<T>): Promise<T>;
}

export function createSceneThumbnailScheduler(): SceneThumbnailScheduler {
  const renderQueue = createSerialTaskQueue();
  return {
    async run<T>(readCached: () => Promise<T | null>, render: () => Promise<T>): Promise<T> {
      const cached = await readCached();
      if (cached !== null) return cached;
      return renderQueue.enqueue(async () => (await readCached()) ?? render());
    },
  };
}
