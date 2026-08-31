struct EmitterState {
  current_rate: f32,
  target_rate: f32,
  accumulator: f32,
  last_time: f32,
  ramp_start_rate: f32,
  ramp_start_time: f32,
  ramp_duration: f32,
  emitter_seed: u32,
  emission_sequence: u32,
  write_cursor: u32,
  particles_per_emission: u32,
  batch_event_count: u32,
  batch_particle_count: u32,
  batch_sequence_start: u32,
  batch_write_start: u32,
  deferred_event_count: u32,
  latest_batch_time: f32,
  max_lifetime: f32,
  capacity: u32,
  initialized: u32,
  pending_time_start: f32,
  batch_interval_start: f32,
  batch_time_step: f32,
  batch_interval_end: f32,
  particle_lifetime: f32,
  batch_particle_lifetime: f32,
  _reserved_0: u32,
  _reserved_1: u32,
}

struct UpdateParams {
  time: f32,
  target_rate: f32,
  ramp_duration: f32,
  max_events: u32,
  set_target: u32,
  particle_lifetime: f32,
  set_lifetime: u32,
  _padding: u32,
}

@group(0) @binding(0) var<storage, read_write> emitter: EmitterState;
@group(0) @binding(1) var<uniform> params: UpdateParams;

fn rate_at(time: f32) -> f32 {
  let elapsed = clamp(time - emitter.ramp_start_time, 0.0, emitter.ramp_duration);
  let amount = select(1.0, elapsed / emitter.ramp_duration, emitter.ramp_duration > 0.0);
  return mix(emitter.ramp_start_rate, emitter.target_rate, amount);
}

fn integrated_to(time: f32) -> f32 {
  let elapsed = clamp(time - emitter.ramp_start_time, 0.0, emitter.ramp_duration);
  let ramp = emitter.ramp_start_rate * elapsed
    + 0.5 * (emitter.target_rate - emitter.ramp_start_rate) * elapsed * elapsed / max(emitter.ramp_duration, 0.000001);
  return ramp + emitter.target_rate * max(0.0, time - emitter.ramp_start_time - emitter.ramp_duration);
}

@compute @workgroup_size(1) fn update_emitter() {
  let old_accumulator = emitter.accumulator;
  let integrated = max(0.0, integrated_to(params.time) - integrated_to(emitter.last_time));
  let available = old_accumulator + integrated;
  let requested = u32(floor(available));
  let emitted = min(requested, params.max_events);
  var interval_start = emitter.pending_time_start;
  var time_step = 0.0;
  if (floor(old_accumulator) >= 1.0) {
    time_step = (params.time - interval_start) / max(available, 0.000001);
  } else if (integrated > 0.0) {
    time_step = (params.time - emitter.last_time) / integrated;
    interval_start = emitter.last_time - old_accumulator * time_step;
  }

  emitter.accumulator = available - f32(emitted);
  emitter.current_rate = rate_at(params.time);
  emitter.last_time = params.time;
  emitter.batch_event_count = emitted;
  emitter.batch_particle_count = emitted * emitter.particles_per_emission;
  emitter.batch_sequence_start = emitter.emission_sequence;
  emitter.batch_write_start = emitter.write_cursor;
  emitter.deferred_event_count = requested - emitted;
  emitter.latest_batch_time = params.time;
  emitter.batch_particle_lifetime = emitter.particle_lifetime;
  if (emitted > 0u) {
    emitter.batch_interval_start = interval_start;
    emitter.batch_time_step = time_step;
    emitter.batch_interval_end = min(params.time, interval_start + f32(emitted) * time_step);
  } else {
    emitter.batch_interval_start = params.time;
    emitter.batch_time_step = 0.0;
    emitter.batch_interval_end = params.time;
  }
  if (emitter.accumulator > 0.0 && (emitted > 0u || integrated > 0.0)) {
    emitter.pending_time_start = min(params.time, interval_start + f32(emitted) * time_step);
  } else if (emitter.accumulator == 0.0) {
    emitter.pending_time_start = params.time;
  }
  emitter.emission_sequence += emitted;
  emitter.write_cursor = (emitter.write_cursor + emitter.batch_particle_count) % emitter.capacity;

  if (params.set_target != 0u) {
    emitter.ramp_start_rate = emitter.current_rate;
    emitter.ramp_start_time = params.time;
    emitter.ramp_duration = params.ramp_duration;
    emitter.target_rate = params.target_rate;
    if (params.ramp_duration == 0.0) {
      emitter.current_rate = params.target_rate;
      emitter.ramp_start_rate = params.target_rate;
    }
  }
  if (params.set_lifetime != 0u) {
    emitter.particle_lifetime = params.particle_lifetime;
  }
}
