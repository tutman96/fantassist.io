import { VgpuParticle, particle_initialization_seed } from "./particle-library.wgsl";

struct EmitterState {
  current_rate: f32, target_rate: f32, accumulator: f32, last_time: f32,
  ramp_start_rate: f32, ramp_start_time: f32, ramp_duration: f32, emitter_seed: u32,
  emission_sequence: u32, write_cursor: u32, particles_per_emission: u32, batch_event_count: u32,
  batch_particle_count: u32, batch_sequence_start: u32, batch_write_start: u32, deferred_event_count: u32,
  latest_batch_time: f32, max_lifetime: f32, capacity: u32, initialized: u32,
  pending_time_start: f32, batch_interval_start: f32, batch_time_step: f32, batch_interval_end: f32,
  particle_lifetime: f32, batch_particle_lifetime: f32, _reserved_0: u32, _reserved_1: u32,
}

@group(0) @binding(0) var<storage, read> emitter: EmitterState;
@group(0) @binding(1) var<storage, read_write> particles: array<VgpuParticle>;

@compute @workgroup_size(64) fn spawn_particles(@builtin(global_invocation_id) id: vec3u) {
  let particle_index = id.x;
  if (particle_index >= emitter.batch_particle_count) { return; }
  let event_index = particle_index / emitter.particles_per_emission;
  let burst_index = particle_index % emitter.particles_per_emission;
  let slot = (emitter.batch_write_start + particle_index) % emitter.capacity;
  let spawn_time = min(
    emitter.batch_interval_end,
    emitter.batch_interval_start + f32(event_index + 1u) * emitter.batch_time_step,
  );
  particles[slot] = VgpuParticle(
    spawn_time,
    emitter.batch_particle_lifetime,
    particle_initialization_seed(emitter.emitter_seed, emitter.batch_sequence_start + event_index, burst_index, emitter.particles_per_emission),
    1u,
  );
}
