import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";

import { resolveShader } from "@vgpu/wgsl/runtime";
import { draw, frame, init, target } from "vgpu/node";
import type { Gpu } from "vgpu";

import { createParticleEmitter as createEmitter, EMITTER_STATE_LAYOUT } from "../src/renderer/particles/particle-emitter";
import type { ParticleEmitterOptions } from "../src/renderer/particles/particle-emitter";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

const particleEmitterShaders = (await loadSceneShaders()).particleEmitter;
const createParticleEmitter = (gpu: Gpu, options: ParticleEmitterOptions) =>
  createEmitter(gpu, options, particleEmitterShaders);

async function withGpu(run: (gpu: Gpu) => Promise<void>) {
  const gpu = await init({ adapter: "auto", label: "vgpu-particles-test" });
  try {
    await run(gpu);
  } finally {
    gpu.dispose();
  }
}

const closeTo = (actual: number, expected: number, epsilon = 1e-5) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);

const normalizedAge = (spawnTime: number, lifetime: number, time: number) =>
  Math.max(0, Math.min(1, (time - spawnTime) / lifetime));

test("GPU compute accumulates fractional emissions and changes particle storage", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, { capacity: 8, seed: 7, maxLifetime: 2, rateRampSeconds: 0 });
    emitter.setEmissionRate(2.5, 0);
    emitter.advance(0.2);
    let diagnostic = await emitter.readDiagnostics();
    closeTo(diagnostic.accumulator, 0.5);
    assert.equal(diagnostic.emissionSequence, 0);
    assert.equal(diagnostic.particles.some((particle) => particle.alive), false);

    emitter.advance(0.4);
    diagnostic = await emitter.readDiagnostics();
    assert.equal(diagnostic.emissionSequence, 1);
    closeTo(diagnostic.accumulator, 0);
    assert.equal(diagnostic.particles.filter((particle) => particle.alive).length, 1);
    emitter.dispose();
  });
});

test("linear ramps integrate up and down on the GPU", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, { capacity: 64, seed: 8, maxLifetime: 10, rateRampSeconds: 2 });
    emitter.setEmissionRate(10, 0);
    emitter.advance(1);
    let diagnostic = await emitter.readDiagnostics();
    closeTo(diagnostic.currentRate, 5);
    assert.equal(diagnostic.emissionSequence, 2);
    closeTo(diagnostic.accumulator, 0.5);

    emitter.advance(2);
    diagnostic = await emitter.readDiagnostics();
    closeTo(diagnostic.currentRate, 10);
    assert.equal(diagnostic.emissionSequence, 10);
    emitter.setEmissionRate(0, 2);
    emitter.advance(3);
    diagnostic = await emitter.readDiagnostics();
    closeTo(diagnostic.currentRate, 5);
    assert.equal(diagnostic.emissionSequence, 17);
    emitter.advance(4);
    diagnostic = await emitter.readDiagnostics();
    closeTo(diagnostic.currentRate, 0);
    assert.equal(diagnostic.emissionSequence, 20);
    emitter.dispose();
  });
});

test("one advance gives different events ordered spawn times inside its integrated interval", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, { capacity: 16, seed: 80, maxLifetime: 3, rateRampSeconds: 0 });
    emitter.setEmissionRate(10, 0);
    emitter.advance(1);
    const diagnostic = await emitter.readDiagnostics(1);
    const times = diagnostic.particles.slice(0, 10).map((particle) => particle.spawnTime);
    assert.equal(new Set(times).size, 10);
    assert.ok(times.every((time) => time > 0 && time <= 1));
    assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]));
    closeTo(times[0], 0.1);
    closeTo(times[9], 1);
    closeTo(diagnostic.latestBatchIntervalStart, 0);
    closeTo(diagnostic.latestBatchTimeStep, 0.1);
    closeTo(diagnostic.latestBatchIntervalEnd, 1);
    emitter.dispose();
  });
});

test("bursts receive unique deterministic seeds from sequence and burst index", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 12, seed: 1234, maxLifetime: 3, particlesPerEmission: 3, rateRampSeconds: 0,
    });
    emitter.setEmissionRate(2, 0);
    emitter.advance(1);
    const diagnostic = await emitter.readDiagnostics();
    assert.equal(diagnostic.latestBatchEventCount, 2);
    assert.equal(diagnostic.latestBatchParticleCount, 6);
    const seeds = diagnostic.particles.filter((particle) => particle.alive).map((particle) => particle.initializationSeed);
    assert.equal(new Set(seeds).size, 6);
    const times = diagnostic.particles.slice(0, 6).map((particle) => particle.spawnTime);
    assert.deepEqual(times.slice(0, 3), [times[0], times[0], times[0]]);
    assert.deepEqual(times.slice(3, 6), [times[3], times[3], times[3]]);
    assert.ok(times[3] > times[0]);
    emitter.dispose();
  });
});

test("ring wrap preserves capped backlog deterministically", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 5, seed: 91, maxLifetime: 5, maxEmissionsPerAdvance: 2, rateRampSeconds: 0,
    });
    emitter.setEmissionRate(10, 0);
    emitter.advance(1);
    let diagnostic = await emitter.readDiagnostics();
    assert.equal(diagnostic.emissionSequence, 2);
    assert.equal(diagnostic.deferredEventCount, 8);
    closeTo(diagnostic.accumulator, 8);
    assert.equal(diagnostic.writeCursor, 2);
    const firstBatchTimes = diagnostic.particles.slice(0, 2).map((particle) => particle.spawnTime);
    assert.ok(firstBatchTimes[0] < firstBatchTimes[1] && firstBatchTimes[1] <= 1);

    emitter.advance(1);
    diagnostic = await emitter.readDiagnostics();
    assert.equal(diagnostic.emissionSequence, 4);
    assert.equal(diagnostic.deferredEventCount, 6);
    assert.equal(diagnostic.writeCursor, 4);
    const secondBatchTimes = diagnostic.particles.slice(2, 4).map((particle) => particle.spawnTime);
    assert.ok(secondBatchTimes[0] > firstBatchTimes[1]);
    assert.ok(secondBatchTimes[0] < secondBatchTimes[1] && secondBatchTimes[1] <= 1);
    emitter.advance(1);
    diagnostic = await emitter.readDiagnostics();
    assert.equal(diagnostic.emissionSequence, 6);
    assert.equal(diagnostic.deferredEventCount, 4);
    assert.equal(diagnostic.writeCursor, 1);
    assert.equal(diagnostic.particles.filter((particle) => particle.alive).length, 5);
    assert.equal(new Set(diagnostic.particles.map((particle) => particle.initializationSeed)).size, 5);
    const wrappedBatchTimes = [diagnostic.particles[4].spawnTime, diagnostic.particles[0].spawnTime];
    assert.ok(wrappedBatchTimes[0] > secondBatchTimes[1]);
    assert.ok(wrappedBatchTimes[0] < wrappedBatchTimes[1] && wrappedBatchTimes[1] <= 1);
    closeTo(firstBatchTimes[0], 0.1);
    closeTo(secondBatchTimes[0], 0.3);
    closeTo(wrappedBatchTimes[0], 0.5);
    emitter.dispose();
  });
});

test("consecutive same-time backlog batches repeat the same non-future timestamp schedule", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const run = async () => {
      const emitter = createParticleEmitter(gpu, {
        capacity: 8, seed: 92, maxLifetime: 5, maxEmissionsPerAdvance: 2, rateRampSeconds: 0,
      });
      emitter.setEmissionRate(6, 0);
      const batches: number[][] = [];
      for (let batch = 0; batch < 3; batch++) {
        emitter.advance(1);
        const diagnostic = await emitter.readDiagnostics(1);
        const start = diagnostic.latestBatchWriteStart;
        batches.push(Array.from({ length: 2 }, (_, index) => diagnostic.particles[(start + index) % emitter.capacity].spawnTime));
      }
      emitter.dispose();
      return batches;
    };
    const first = await run();
    const second = await run();
    assert.deepEqual(first, second);
    assert.ok(first.flat().every((time) => time <= 1));
    assert.ok(first.flat().every((time, index, times) => index === 0 || time > times[index - 1]));
  });
});

test("stopping drains existing records and reactivation emits while draining", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, { capacity: 12, seed: 44, maxLifetime: 2, rateRampSeconds: 0 });
    emitter.setEmissionRate(2, 0);
    emitter.advance(1);
    emitter.setEmissionRate(0, 1);
    assert.equal((await emitter.readDiagnostics(1.5)).liveParticleCount, 2);
    assert.equal(emitter.hasAnimationDemand(1.5), true);

    emitter.setEmissionRate(2, 1.5);
    emitter.advance(2);
    let diagnostic = await emitter.readDiagnostics(2);
    assert.equal(diagnostic.emissionSequence, 3);
    assert.equal(diagnostic.liveParticleCount, 3);
    emitter.setEmissionRate(0, 2);
    diagnostic = await emitter.readDiagnostics(4.1);
    assert.equal(diagnostic.liveParticleCount, 0);
    assert.equal(emitter.hasAnimationDemand(4.1), false);
    emitter.dispose();
  });
});

test("lifetime changes preserve old records and storage while new emissions use the new lifetime", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 16, seed: 145, maxLifetime: 5, initialParticleLifetime: 1, rateRampSeconds: 0,
    });
    const particleStorage = emitter.particleStorage;
    const stateStorage = emitter.stateStorage;
    assert.equal(emitter.particleLifetime, 1);
    emitter.setEmissionRate(2, 0);
    emitter.advance(1);
    assert.equal(emitter.drainDeadline, 2);

    emitter.setParticleLifetime(3, 1.5);
    assert.equal(emitter.particleLifetime, 3);
    assert.equal(emitter.particleStorage, particleStorage);
    assert.equal(emitter.stateStorage, stateStorage);
    emitter.advance(2);
    const diagnostic = await emitter.readDiagnostics(2);
    assert.deepEqual(diagnostic.particles.slice(0, 4).map((particle) => particle.lifetime), [1, 1, 1, 3]);
    assert.equal(diagnostic.particleLifetime, 3);
    assert.equal(diagnostic.latestBatchParticleLifetime, 3);
    assert.equal(emitter.drainDeadline, 5);

    emitter.setParticleLifetime(0.5, 2);
    emitter.advance(3);
    assert.deepEqual((await emitter.readDiagnostics(3)).particles.slice(0, 6).map((particle) => particle.lifetime), [1, 1, 1, 3, 0.5, 0.5]);
    assert.equal(emitter.drainDeadline, 5, "shorter new records must not shorten the older deadline");
    emitter.dispose();
  });
});

test("longer lifetime and return changes are deterministic", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const run = async (rateFirst: boolean) => {
      const emitter = createParticleEmitter(gpu, {
        capacity: 12, seed: 146, maxLifetime: 4, initialParticleLifetime: 0.75, rateRampSeconds: 0,
      });
      emitter.setEmissionRate(2, 0);
      emitter.advance(1);
      if (rateFirst) {
        emitter.setEmissionRate(4, 2);
        emitter.setParticleLifetime(4, 2);
      } else {
        emitter.setParticleLifetime(4, 2);
        emitter.setEmissionRate(4, 2);
      }
      emitter.advance(2.5);
      emitter.setParticleLifetime(0.75, 2.5);
      emitter.advance(3);
      const diagnostic = await emitter.readDiagnostics(3);
      const result = {
        deadline: emitter.drainDeadline,
        sequence: diagnostic.emissionSequence,
        records: diagnostic.particles.slice(0, 8),
      };
      emitter.dispose();
      return result;
    };
    assert.deepEqual(await run(true), await run(false));
  });
});

test("particle lifetime bounds and monotonic time are validated", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    for (const initialParticleLifetime of [0, -1, 5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => createParticleEmitter(gpu, {
        capacity: 4, seed: 147, maxLifetime: 4, initialParticleLifetime,
      }), /initialParticleLifetime/);
    }
    const emitter = createParticleEmitter(gpu, { capacity: 4, seed: 148, maxLifetime: 4, initialTime: 1 });
    for (const lifetime of [0, -1, 5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => emitter.setParticleLifetime(lifetime, 1), /lifetime/);
      assert.throws(() => emitter.retimeParticleLifetime(lifetime, 1), /lifetime/);
    }
    assert.throws(() => emitter.setParticleLifetime(2, 0.5), /monotonic/);
    assert.throws(() => emitter.retimeParticleLifetime(2, 0.5), /monotonic/);
    emitter.setParticleLifetime(4, 1);
    assert.equal(emitter.particleLifetime, 4);
    emitter.dispose();
  });
});

test("retime preserves live phases and invariants while future records use the new lifetime", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 12, seed: 150, maxLifetime: 4, initialParticleLifetime: 2, rateRampSeconds: 0,
    });
    const particleStorage = emitter.particleStorage;
    const stateStorage = emitter.stateStorage;
    emitter.setEmissionRate(4, 0);
    emitter.advance(1);
    const before = await emitter.readDiagnostics(1);
    const stateBefore = new DataView(await emitter.stateStorage.read());
    emitter.retimeParticleLifetime(4, 1);
    const after = await emitter.readDiagnostics(1);
    const stateAfter = new DataView(await emitter.stateStorage.read());

    assert.equal(emitter.particleStorage, particleStorage);
    assert.equal(emitter.stateStorage, stateStorage);
    assert.equal(emitter.particleLifetime, 4);
    for (let index = 0; index < 4; index++) {
      const oldRecord = before.particles[index];
      const newRecord = after.particles[index];
      const age = normalizedAge(oldRecord.spawnTime, oldRecord.lifetime, 1);
      closeTo(normalizedAge(newRecord.spawnTime, newRecord.lifetime, 1), age, 2e-6);
      closeTo(newRecord.spawnTime, 1 - age * 4, 2e-6);
      assert.equal(newRecord.lifetime, 4);
      assert.equal(newRecord.initializationSeed, oldRecord.initializationSeed);
      assert.equal(newRecord.alive, oldRecord.alive);
    }
    assert.equal(after.particles.slice(4).some((particle) => particle.alive), false);
    assert.equal(after.emissionSequence, before.emissionSequence);
    assert.equal(after.writeCursor, before.writeCursor);
    assert.equal(after.accumulator, before.accumulator);
    assert.equal(after.currentRate, before.currentRate);
    assert.equal(after.targetRate, before.targetRate);
    for (const offset of [EMITTER_STATE_LAYOUT.rampStartRate, EMITTER_STATE_LAYOUT.rampStartTime, EMITTER_STATE_LAYOUT.rampDuration]) {
      assert.equal(stateAfter.getFloat32(offset, true), stateBefore.getFloat32(offset, true));
    }

    emitter.advance(1.5);
    const future = await emitter.readDiagnostics(1.5);
    assert.deepEqual(future.particles.slice(4, 6).map((particle) => particle.lifetime), [4, 4]);
    emitter.dispose();
  });
});

test("shorter and longer retimes are safe while active and draining", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 16, seed: 151, maxLifetime: 5, initialParticleLifetime: 2, rateRampSeconds: 0,
    });
    emitter.setEmissionRate(4, 0);
    emitter.advance(1);
    emitter.retimeParticleLifetime(5, 1);
    assert.equal(emitter.drainDeadline, 6);
    assert.ok(Number.isFinite(emitter.drainDeadline));

    emitter.advance(1.25);
    emitter.retimeParticleLifetime(1, 1.25);
    assert.equal(emitter.drainDeadline, 2.25);
    assert.ok((await emitter.readDiagnostics(1.25)).particles.filter((particle) => particle.alive).every((particle) => particle.lifetime === 1));

    emitter.setEmissionRate(0, 1.25);
    const sequence = (await emitter.readDiagnostics(1.25)).emissionSequence;
    emitter.retimeParticleLifetime(3, 1.5);
    const draining = await emitter.readDiagnostics(1.5);
    assert.equal(draining.emissionSequence, sequence);
    assert.ok(draining.liveParticleCount > 0);
    assert.ok(draining.particles.filter((particle) => particle.alive && particle.spawnTime <= 1.5 && particle.spawnTime + particle.lifetime > 1.5).every((particle) => particle.lifetime === 3));
    assert.equal(emitter.drainDeadline, 4.5);
    assert.ok(Number.isFinite(emitter.drainDeadline));
    const expired = await emitter.readDiagnostics(4.6);
    assert.equal(expired.liveParticleCount, 0);
    emitter.retimeParticleLifetime(5, 4.6);
    const stillExpired = await emitter.readDiagnostics(4.6);
    assert.equal(stillExpired.liveParticleCount, 0);
    assert.deepEqual(stillExpired.particles, expired.particles);
    assert.ok(Number.isFinite(emitter.drainDeadline) && emitter.drainDeadline <= 4.6 + emitter.maxLifetime);
    emitter.dispose();
  });
});

test("retime runs in parallel across a wrapped full ring", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 5, seed: 152, maxLifetime: 5, initialParticleLifetime: 5, maxEmissionsPerAdvance: 2, rateRampSeconds: 0,
    });
    emitter.setEmissionRate(6, 0);
    emitter.advance(1);
    emitter.advance(1);
    emitter.advance(1);
    const before = await emitter.readDiagnostics(1);
    assert.equal(before.writeCursor, 1);
    assert.equal(before.particles.filter((particle) => particle.alive).length, 5);
    emitter.retimeParticleLifetime(2.5, 1);
    const after = await emitter.readDiagnostics(1);
    assert.equal(after.writeCursor, before.writeCursor);
    assert.equal(after.emissionSequence, before.emissionSequence);
    assert.equal(after.accumulator, before.accumulator);
    assert.ok(after.particles.every((particle) => particle.alive && particle.lifetime === 2.5));
    assert.equal(new Set(after.particles.map((particle) => particle.initializationSeed)).size, 5);
    emitter.dispose();
  });
});

test("steady-state population and ages use active particle lifetime", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 20, seed: 149, maxLifetime: 10, initialParticleLifetime: 2, rateRampSeconds: 0,
    });
    emitter.initializeSteadyState(5, 3);
    let diagnostic = await emitter.readDiagnostics(5);
    assert.equal(diagnostic.liveParticleCount, 6);
    assert.ok(diagnostic.particles.slice(0, 6).every((particle) => particle.lifetime === 2));
    assert.ok(diagnostic.particles.slice(0, 6).every((particle) => particle.spawnTime > 3 && particle.spawnTime < 5));

    emitter.setParticleLifetime(1, 5);
    emitter.initializeSteadyState(5, 3);
    diagnostic = await emitter.readDiagnostics(5);
    assert.equal(diagnostic.liveParticleCount, 3);
    assert.ok(diagnostic.particles.slice(0, 3).every((particle) => particle.lifetime === 1));
    assert.equal(diagnostic.particles.slice(3).some((particle) => particle.alive), false);
    emitter.dispose();
  });
});

test("steady-state initialization is identical across GPU instances", { timeout: 60_000 }, async () => {
  const initialize = async () => {
    const gpu = await init({ adapter: "auto", label: "vgpu-particles-steady-test" });
    try {
      const emitter = createParticleEmitter(gpu, { capacity: 16, seed: 222, maxLifetime: 4, particlesPerEmission: 2 });
      emitter.initializeSteadyState(12.5, 1.5);
      const diagnostic = await emitter.readDiagnostics(12.5);
      emitter.dispose();
      return diagnostic;
    } finally {
      gpu.dispose();
    }
  };
  const first = await initialize();
  const second = await initialize();
  assert.deepEqual(first, second);
  assert.equal(first.liveParticleCount, 12);
  const times = first.particles.slice(0, 12).map((particle) => particle.spawnTime);
  for (let index = 0; index < times.length; index += 2) {
    assert.equal(times[index], times[index + 1]);
    if (index > 0) assert.ok(times[index] > times[index - 2]);
  }
});

test("live time rejects backward movement, fixed-time initialization resets it, and disposal is local", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, { capacity: 4, seed: 1, maxLifetime: 1, initialTime: 2 });
    assert.throws(() => emitter.advance(1.9), /monotonic/);
    emitter.initializeSteadyState(1, 1);
    emitter.advance(1.1);
    emitter.dispose();
    emitter.dispose();
    assert.equal(gpu.disposed, false);
    assert.throws(() => emitter.advance(2), /disposed/);
  });
});

test("consumer draw reads compute storage by instance index and animates pixels", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, { capacity: 12, seed: 987, maxLifetime: 3, rateRampSeconds: 0 });
    emitter.setEmissionRate(12, 0);
    emitter.advance(1);
    const diagnostic = await emitter.readDiagnostics(1);
    assert.equal(new Set(diagnostic.particles.map((particle) => particle.spawnTime)).size, 12);
    const source = (await resolveShader({ entry: resolve("test/fixtures/particle-consumer.wgsl"), validate: "require" })).wgsl;
    const destination = target(gpu, { size: [48, 48], format: "rgba8unorm", label: "particle-consumer" });
    const consumer = draw(gpu, {
      shader: source,
      vertices: 6,
      instances: emitter.capacity,
      set: { particles: emitter.particleStorage, params: { time: 1 } },
    });
    frame(gpu, (current) => current.pass(destination, consumer));
    const first = await destination.read();
    const firstIntensities = new Set(Array.from(first).filter((value, index) => index % 4 === 2 && value > 0));
    assert.ok(firstIntensities.size > 2, `expected asynchronous alpha levels, got ${[...firstIntensities]}`);
    consumer.set({ params: { time: 1.2 } });
    frame(gpu, (current) => current.pass(destination, consumer));
    const second = await destination.read();
    const digest = (pixels: Uint8Array) => createHash("sha256").update(pixels).digest("hex");
    const nonempty = (pixels: Uint8Array) => pixels.some((value, index) => index % 4 !== 3 && value > 0);
    assert.equal(nonempty(first), true);
    assert.equal(nonempty(second), true);
    assert.notEqual(digest(first), digest(second));
    emitter.dispose();
  });
});

test("consumer pixels preserve phase at the retime instant then move at the new speed", { timeout: 60_000 }, async () => {
  await withGpu(async (gpu) => {
    const emitter = createParticleEmitter(gpu, {
      capacity: 8, seed: 153, maxLifetime: 4, initialParticleLifetime: 2, rateRampSeconds: 0,
    });
    emitter.setEmissionRate(6, 0);
    emitter.advance(1);
    const source = (await resolveShader({ entry: resolve("test/fixtures/particle-consumer.wgsl"), validate: "require" })).wgsl;
    const destination = target(gpu, { size: [64, 64], format: "rgba8unorm", label: "particle-retime-consumer" });
    const consumer = draw(gpu, {
      shader: source,
      vertices: 6,
      instances: emitter.capacity,
      set: { particles: emitter.particleStorage, params: { time: 1 } },
    });
    frame(gpu, (current) => current.pass(destination, consumer));
    const before = await destination.read();

    emitter.retimeParticleLifetime(4, 1);
    frame(gpu, (current) => current.pass(destination, consumer));
    const atRetime = await destination.read();
    let maximumDifference = 0;
    let changedChannels = 0;
    for (let index = 0; index < before.length; index++) {
      const difference = Math.abs(before[index] - atRetime[index]);
      maximumDifference = Math.max(maximumDifference, difference);
      if (difference > 0) changedChannels++;
    }
    assert.ok(maximumDifference <= 2, `maximum exact-retime pixel difference was ${maximumDifference}`);
    assert.ok(changedChannels <= 32, `${changedChannels} channels changed at the retime instant`);

    consumer.set({ params: { time: 1.2 } });
    frame(gpu, (current) => current.pass(destination, consumer));
    const later = await destination.read();
    assert.notEqual(createHash("sha256").update(atRetime).digest("hex"), createHash("sha256").update(later).digest("hex"));
    emitter.dispose();
  });
});
