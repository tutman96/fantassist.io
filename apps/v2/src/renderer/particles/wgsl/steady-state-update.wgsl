struct EmitterState {
  current_rate: f32, target_rate: f32, accumulator: f32, last_time: f32,
  ramp_start_rate: f32, ramp_start_time: f32, ramp_duration: f32, emitter_seed: u32,
  emission_sequence: u32, write_cursor: u32, particles_per_emission: u32, batch_event_count: u32,
  batch_particle_count: u32, batch_sequence_start: u32, batch_write_start: u32, deferred_event_count: u32,
  latest_batch_time: f32, max_lifetime: f32, capacity: u32, initialized: u32,
  pending_time_start: f32, batch_interval_start: f32, batch_time_step: f32, batch_interval_end: f32,
  particle_lifetime: f32, batch_particle_lifetime: f32, _reserved_0: u32, _reserved_1: u32,
}

struct SteadyParams { time: f32, rate: f32, population: u32, _padding: u32 }

@group(0) @binding(0) var<storage, read_write> emitter: EmitterState;
@group(0) @binding(1) var<uniform> params: SteadyParams;

@compute @workgroup_size(1) fn initialize_emitter() {
  let event_count = (params.population + emitter.particles_per_emission - 1u) / emitter.particles_per_emission;
  emitter.current_rate = params.rate;
  emitter.target_rate = params.rate;
  emitter.accumulator = 0.0;
  emitter.last_time = params.time;
  emitter.ramp_start_rate = params.rate;
  emitter.ramp_start_time = params.time;
  emitter.emission_sequence = event_count;
  emitter.write_cursor = params.population % emitter.capacity;
  emitter.batch_event_count = event_count;
  emitter.batch_particle_count = params.population;
  emitter.batch_sequence_start = 0u;
  emitter.batch_write_start = 0u;
  emitter.deferred_event_count = 0u;
  emitter.latest_batch_time = params.time;
  emitter.batch_particle_lifetime = emitter.particle_lifetime;
  emitter.pending_time_start = params.time;
  emitter.batch_interval_start = params.time - emitter.particle_lifetime;
  emitter.batch_time_step = emitter.particle_lifetime / f32(max(event_count, 1u));
  emitter.batch_interval_end = params.time;
  emitter.initialized = 1u;
}
