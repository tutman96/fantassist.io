export struct VgpuParticle {
  spawn_time: f32,
  lifetime: f32,
  initialization_seed: u32,
  alive: u32,
}

export fn particle_hash_u32(input: u32) -> u32 {
  var value = input;
  value = (value ^ (value >> 16u)) * 0x7feb352du;
  value = (value ^ (value >> 15u)) * 0x846ca68bu;
  return value ^ (value >> 16u);
}

export fn particle_initialization_seed(emitter_seed: u32, sequence: u32, burst_index: u32, particles_per_emission: u32) -> u32 {
  let particle_ordinal = sequence * particles_per_emission + burst_index;
  return particle_hash_u32(emitter_seed ^ particle_ordinal);
}

export fn particle_random(seed: u32, channel: u32) -> f32 {
  return f32(particle_hash_u32(seed ^ ((channel + 1u) * 0x27d4eb2du))) / 4294967295.0;
}

export fn particle_random_2d(seed: u32, first_channel: u32) -> vec2f {
  return vec2f(particle_random(seed, first_channel), particle_random(seed, first_channel + 1u));
}

export fn particle_normalized_age(particle: VgpuParticle, time: f32) -> f32 {
  return clamp((time - particle.spawn_time) / max(particle.lifetime, 0.000001), 0.0, 1.0);
}

export fn particle_is_alive(particle: VgpuParticle, time: f32) -> bool {
  return particle.alive != 0u && time >= particle.spawn_time && time < particle.spawn_time + particle.lifetime;
}

export fn particle_spawn_2d(seed: u32, bounds_min: vec2f, bounds_max: vec2f) -> vec2f {
  return mix(bounds_min, bounds_max, particle_random_2d(seed, 0u));
}

export fn particle_alpha_envelope(age: f32, fade_in_end: f32, hold_end: f32, fade_out_end: f32) -> f32 {
  return smoothstep(0.0, fade_in_end, age) * (1.0 - smoothstep(hold_end, fade_out_end, age));
}
