import { compute, storage } from "vgpu";
import type { Gpu, ShaderSource, StorageBuffer } from "vgpu";

export interface ParticleEmitterShaders {
  readonly stateUpdate: string | ShaderSource;
  readonly spawn: string | ShaderSource;
  readonly steadyStateUpdate: string | ShaderSource;
  readonly steadyStateFill: string | ShaderSource;
  readonly retimeLifetime: string | ShaderSource;
}

export const PARTICLE_RECORD_BYTES = 16;
export const PARTICLE_RECORD_LAYOUT = Object.freeze({
  spawnTime: 0,
  lifetime: 4,
  initializationSeed: 8,
  alive: 12,
} as const);

export const EMITTER_STATE_BYTES = 112;
export const EMITTER_STATE_LAYOUT = Object.freeze({
  currentRate: 0,
  targetRate: 4,
  accumulator: 8,
  lastTime: 12,
  rampStartRate: 16,
  rampStartTime: 20,
  rampDuration: 24,
  emitterSeed: 28,
  emissionSequence: 32,
  writeCursor: 36,
  particlesPerEmission: 40,
  latestBatchEventCount: 44,
  latestBatchParticleCount: 48,
  latestBatchSequenceStart: 52,
  latestBatchWriteStart: 56,
  deferredEventCount: 60,
  latestBatchTime: 64,
  maxLifetime: 68,
  capacity: 72,
  initialized: 76,
  pendingTimeStart: 80,
  latestBatchIntervalStart: 84,
  latestBatchTimeStep: 88,
  latestBatchIntervalEnd: 92,
  particleLifetime: 96,
  latestBatchParticleLifetime: 100,
  reserved0: 104,
  reserved1: 108,
} as const);

export interface ParticleEmitterOptions {
  readonly capacity: number;
  readonly seed: number;
  readonly maxLifetime: number;
  readonly initialParticleLifetime?: number;
  readonly particlesPerEmission?: number;
  readonly maxEmissionsPerAdvance?: number;
  readonly rateRampSeconds?: number;
  readonly initialTime?: number;
  readonly label?: string;
}

export interface ParticleRecordDiagnostic {
  readonly spawnTime: number;
  readonly lifetime: number;
  readonly initializationSeed: number;
  readonly alive: boolean;
}

export interface ParticleEmitterDiagnostics {
  readonly currentRate: number;
  readonly targetRate: number;
  readonly accumulator: number;
  readonly lastTime: number;
  readonly emissionSequence: number;
  readonly writeCursor: number;
  readonly particlesPerEmission: number;
  readonly latestBatchEventCount: number;
  readonly latestBatchParticleCount: number;
  readonly latestBatchSequenceStart: number;
  readonly latestBatchWriteStart: number;
  readonly deferredEventCount: number;
  readonly latestBatchTime: number;
  readonly pendingTimeStart: number;
  readonly latestBatchIntervalStart: number;
  readonly latestBatchTimeStep: number;
  readonly latestBatchIntervalEnd: number;
  readonly particleLifetime: number;
  readonly latestBatchParticleLifetime: number;
  readonly liveParticleCount: number;
  readonly particles: readonly ParticleRecordDiagnostic[];
}

export interface ParticleEmitter {
  readonly particleStorage: StorageBuffer;
  readonly stateStorage: StorageBuffer;
  readonly capacity: number;
  readonly particlesPerEmission: number;
  readonly maxEmissionsPerAdvance: number;
  readonly maxLifetime: number;
  readonly particleLifetime: number;
  readonly drainDeadline: number;
  setEmissionRate(rate: number, time: number): void;
  setParticleLifetime(lifetime: number, time: number): void;
  retimeParticleLifetime(lifetime: number, time: number): void;
  advance(time: number): void;
  initializeSteadyState(time: number, rate: number): void;
  hasAnimationDemand(time: number): boolean;
  readDiagnostics(time?: number): Promise<ParticleEmitterDiagnostics>;
  dispose(): void;
}

type DestroyableStorage = StorageBuffer & { destroy(): void };

function positiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1) throw new RangeError(`${name} must be a positive finite integer`);
  return Math.floor(value);
}

function finiteNonnegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return value;
}

function initialState(options: Required<Pick<ParticleEmitterOptions, "particlesPerEmission" | "rateRampSeconds" | "initialTime" | "initialParticleLifetime">> & ParticleEmitterOptions) {
  const data = new ArrayBuffer(EMITTER_STATE_BYTES);
  const view = new DataView(data);
  view.setFloat32(EMITTER_STATE_LAYOUT.lastTime, options.initialTime, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.rampStartTime, options.initialTime, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.rampDuration, options.rateRampSeconds, true);
  view.setUint32(EMITTER_STATE_LAYOUT.emitterSeed, options.seed >>> 0, true);
  view.setUint32(EMITTER_STATE_LAYOUT.particlesPerEmission, options.particlesPerEmission, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.latestBatchTime, options.initialTime, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.maxLifetime, options.maxLifetime, true);
  view.setUint32(EMITTER_STATE_LAYOUT.capacity, options.capacity, true);
  view.setUint32(EMITTER_STATE_LAYOUT.initialized, 1, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.pendingTimeStart, options.initialTime, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.latestBatchIntervalStart, options.initialTime, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.latestBatchIntervalEnd, options.initialTime, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.particleLifetime, options.initialParticleLifetime, true);
  view.setFloat32(EMITTER_STATE_LAYOUT.latestBatchParticleLifetime, options.initialParticleLifetime, true);
  return data;
}

export function createParticleEmitter(
  gpu: Gpu,
  input: ParticleEmitterOptions,
  shaders: ParticleEmitterShaders,
): ParticleEmitter {
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) {
    throw new RangeError("seed must be a uint32");
  }
  const capacity = positiveInteger(input.capacity, "capacity");
  const particlesPerEmission = positiveInteger(input.particlesPerEmission ?? 1, "particlesPerEmission");
  if (particlesPerEmission > capacity) {
    throw new RangeError("particlesPerEmission must not exceed capacity");
  }
  const safeBatchEvents = Math.floor(capacity / particlesPerEmission);
  const maxEmissionsPerAdvance = positiveInteger(
    input.maxEmissionsPerAdvance ?? Math.min(1024, safeBatchEvents),
    "maxEmissionsPerAdvance",
  );
  if (maxEmissionsPerAdvance > safeBatchEvents) {
    throw new RangeError("maxEmissionsPerAdvance * particlesPerEmission must not exceed capacity");
  }
  const maxLifetime = finiteNonnegative(input.maxLifetime, "maxLifetime");
  if (maxLifetime <= 0) throw new RangeError("maxLifetime must be greater than zero");
  const initialParticleLifetime = input.initialParticleLifetime ?? maxLifetime;
  if (!Number.isFinite(initialParticleLifetime) || initialParticleLifetime <= 0 || initialParticleLifetime > maxLifetime) {
    throw new RangeError("initialParticleLifetime must be finite, greater than zero, and no greater than maxLifetime");
  }
  const options = {
    ...input,
    capacity,
    seed: input.seed,
    maxLifetime,
    initialParticleLifetime,
    particlesPerEmission,
    maxEmissionsPerAdvance,
    rateRampSeconds: finiteNonnegative(input.rateRampSeconds ?? 0.25, "rateRampSeconds"),
    initialTime: finiteNonnegative(input.initialTime ?? 0, "initialTime"),
  };
  const stateStorage = storage(gpu, EMITTER_STATE_BYTES) as DestroyableStorage;
  const particleStorage = storage(gpu, options.capacity * PARTICLE_RECORD_BYTES) as DestroyableStorage;
  stateStorage.write(initialState(options));
  particleStorage.write(new Uint8Array(options.capacity * PARTICLE_RECORD_BYTES));

  const update = compute(gpu, shaders.stateUpdate, {
    label: `${options.label ?? "particle-emitter"}:update`,
    set: { emitter: stateStorage },
  });
  const spawn = compute(gpu, shaders.spawn, {
    label: `${options.label ?? "particle-emitter"}:spawn`,
    set: { emitter: stateStorage, particles: particleStorage },
  });
  const steadyUpdate = compute(gpu, shaders.steadyStateUpdate, {
    label: `${options.label ?? "particle-emitter"}:steady-update`,
    set: { emitter: stateStorage },
  });
  const steadyFill = compute(gpu, shaders.steadyStateFill, {
    label: `${options.label ?? "particle-emitter"}:steady-fill`,
    set: { emitter: stateStorage, particles: particleStorage },
  });
  const retimeLifetime = compute(gpu, shaders.retimeLifetime, {
    label: `${options.label ?? "particle-emitter"}:retime-lifetime`,
    set: { particles: particleStorage },
  });

  let disposed = false;
  let lastTime = options.initialTime;
  let hostCurrentRate = 0;
  let hostTargetRate = 0;
  let hostRampStartRate = 0;
  let hostRampStartTime = options.initialTime;
  let hostAccumulator = 0;
  let hostParticleLifetime = options.initialParticleLifetime;
  let drainDeadline = options.initialTime;

  const assertUsable = () => {
    if (disposed) throw new Error("ParticleEmitter is disposed");
  };
  const assertTime = (time: number, allowReset = false) => {
    if (!Number.isFinite(time) || (!allowReset && time < lastTime)) {
      throw new RangeError(`time must be finite and monotonic (last time: ${lastTime})`);
    }
  };
  const hostRateAt = (time: number) => {
    if (options.rateRampSeconds === 0) return hostTargetRate;
    const amount = Math.max(0, Math.min(1, (time - hostRampStartTime) / options.rateRampSeconds));
    return hostRampStartRate + (hostTargetRate - hostRampStartRate) * amount;
  };
  const hostIntegratedTo = (time: number) => {
    const elapsed = Math.max(0, Math.min(options.rateRampSeconds, time - hostRampStartTime));
    const ramp = options.rateRampSeconds === 0
      ? 0
      : hostRampStartRate * elapsed
        + 0.5 * (hostTargetRate - hostRampStartRate) * elapsed * elapsed / options.rateRampSeconds;
    return ramp + hostTargetRate * Math.max(0, time - hostRampStartTime - options.rateRampSeconds);
  };
  const dispatchLive = (time: number, targetRate: number, setTarget: boolean, particleLifetime: number, setLifetime: boolean) => {
    const available = hostAccumulator + Math.max(0, hostIntegratedTo(time) - hostIntegratedTo(lastTime));
    const emitted = Math.min(Math.floor(available), options.maxEmissionsPerAdvance);
    hostAccumulator = available - emitted;
    update.set({ params: {
      time,
      target_rate: targetRate,
      ramp_duration: options.rateRampSeconds,
      max_events: options.maxEmissionsPerAdvance,
      set_target: setTarget ? 1 : 0,
      particle_lifetime: particleLifetime,
      set_lifetime: setLifetime ? 1 : 0,
    } }).dispatch(1);
    spawn.dispatch(Math.ceil(options.maxEmissionsPerAdvance * options.particlesPerEmission / 64));
    if (emitted > 0) drainDeadline = Math.max(drainDeadline, time + hostParticleLifetime);
    lastTime = time;
  };

  return {
    particleStorage,
    stateStorage,
    capacity: options.capacity,
    particlesPerEmission: options.particlesPerEmission,
    maxEmissionsPerAdvance: options.maxEmissionsPerAdvance,
    maxLifetime: options.maxLifetime,
    get particleLifetime() { return hostParticleLifetime; },
    get drainDeadline() { return drainDeadline; },
    setEmissionRate(rate, time) {
      assertUsable();
      rate = finiteNonnegative(rate, "rate");
      assertTime(time);
      hostCurrentRate = hostRateAt(time);
      dispatchLive(time, rate, true, hostParticleLifetime, false);
      hostRampStartRate = hostCurrentRate;
      hostRampStartTime = time;
      hostTargetRate = rate;
      if (options.rateRampSeconds === 0) hostCurrentRate = rate;
    },
    setParticleLifetime(lifetime, time) {
      assertUsable();
      if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > options.maxLifetime) {
        throw new RangeError("lifetime must be finite, greater than zero, and no greater than maxLifetime");
      }
      assertTime(time);
      hostCurrentRate = hostRateAt(time);
      dispatchLive(time, hostTargetRate, false, lifetime, true);
      hostParticleLifetime = lifetime;
    },
    retimeParticleLifetime(lifetime, time) {
      assertUsable();
      if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > options.maxLifetime) {
        throw new RangeError("lifetime must be finite, greater than zero, and no greater than maxLifetime");
      }
      assertTime(time);
      hostCurrentRate = hostRateAt(time);
      dispatchLive(time, hostTargetRate, false, lifetime, true);
      retimeLifetime.set({ params: { time, lifetime, capacity: options.capacity } }).dispatch(Math.ceil(options.capacity / 64));
      hostParticleLifetime = lifetime;
      drainDeadline = time + lifetime;
    },
    advance(time) {
      assertUsable();
      assertTime(time);
      hostCurrentRate = hostRateAt(time);
      dispatchLive(time, hostTargetRate, false, hostParticleLifetime, false);
    },
    initializeSteadyState(time, rate) {
      assertUsable();
      assertTime(time, true);
      rate = finiteNonnegative(rate, "rate");
      const population = Math.min(options.capacity, Math.ceil(rate * hostParticleLifetime * options.particlesPerEmission));
      const params = { time, rate, population };
      steadyUpdate.set({ params }).dispatch(1);
      steadyFill.set({ params }).dispatch(Math.ceil(options.capacity / 64));
      lastTime = time;
      hostCurrentRate = rate;
      hostTargetRate = rate;
      hostRampStartRate = rate;
      hostRampStartTime = time;
      hostAccumulator = 0;
      drainDeadline = population > 0 ? time + hostParticleLifetime : time;
    },
    hasAnimationDemand(time) {
      assertUsable();
      if (!Number.isFinite(time)) throw new RangeError("time must be finite");
      return hostTargetRate > 0 || hostRateAt(Math.max(time, lastTime)) > 0 || time < drainDeadline;
    },
    async readDiagnostics(time = lastTime) {
      assertUsable();
      if (!Number.isFinite(time)) throw new RangeError("time must be finite");
      const [stateData, particleData] = await Promise.all([stateStorage.read(), particleStorage.read()]);
      const state = new DataView(stateData);
      const particlesView = new DataView(particleData);
      const particles: ParticleRecordDiagnostic[] = [];
      let liveParticleCount = 0;
      for (let index = 0; index < options.capacity; index++) {
        const offset = index * PARTICLE_RECORD_BYTES;
        const particle = {
          spawnTime: particlesView.getFloat32(offset + PARTICLE_RECORD_LAYOUT.spawnTime, true),
          lifetime: particlesView.getFloat32(offset + PARTICLE_RECORD_LAYOUT.lifetime, true),
          initializationSeed: particlesView.getUint32(offset + PARTICLE_RECORD_LAYOUT.initializationSeed, true),
          alive: particlesView.getUint32(offset + PARTICLE_RECORD_LAYOUT.alive, true) !== 0,
        };
        if (particle.alive && time >= particle.spawnTime && time < particle.spawnTime + particle.lifetime) liveParticleCount++;
        particles.push(particle);
      }
      return {
        currentRate: state.getFloat32(EMITTER_STATE_LAYOUT.currentRate, true),
        targetRate: state.getFloat32(EMITTER_STATE_LAYOUT.targetRate, true),
        accumulator: state.getFloat32(EMITTER_STATE_LAYOUT.accumulator, true),
        lastTime: state.getFloat32(EMITTER_STATE_LAYOUT.lastTime, true),
        emissionSequence: state.getUint32(EMITTER_STATE_LAYOUT.emissionSequence, true),
        writeCursor: state.getUint32(EMITTER_STATE_LAYOUT.writeCursor, true),
        particlesPerEmission: state.getUint32(EMITTER_STATE_LAYOUT.particlesPerEmission, true),
        latestBatchEventCount: state.getUint32(EMITTER_STATE_LAYOUT.latestBatchEventCount, true),
        latestBatchParticleCount: state.getUint32(EMITTER_STATE_LAYOUT.latestBatchParticleCount, true),
        latestBatchSequenceStart: state.getUint32(EMITTER_STATE_LAYOUT.latestBatchSequenceStart, true),
        latestBatchWriteStart: state.getUint32(EMITTER_STATE_LAYOUT.latestBatchWriteStart, true),
        deferredEventCount: state.getUint32(EMITTER_STATE_LAYOUT.deferredEventCount, true),
        latestBatchTime: state.getFloat32(EMITTER_STATE_LAYOUT.latestBatchTime, true),
        pendingTimeStart: state.getFloat32(EMITTER_STATE_LAYOUT.pendingTimeStart, true),
        latestBatchIntervalStart: state.getFloat32(EMITTER_STATE_LAYOUT.latestBatchIntervalStart, true),
        latestBatchTimeStep: state.getFloat32(EMITTER_STATE_LAYOUT.latestBatchTimeStep, true),
        latestBatchIntervalEnd: state.getFloat32(EMITTER_STATE_LAYOUT.latestBatchIntervalEnd, true),
        particleLifetime: state.getFloat32(EMITTER_STATE_LAYOUT.particleLifetime, true),
        latestBatchParticleLifetime: state.getFloat32(EMITTER_STATE_LAYOUT.latestBatchParticleLifetime, true),
        liveParticleCount,
        particles,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      particleStorage.destroy();
      stateStorage.destroy();
    },
  };
}
