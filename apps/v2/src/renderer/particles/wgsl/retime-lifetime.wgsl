import { VgpuParticle, particle_is_alive, particle_normalized_age } from "./particle-library.wgsl";

struct RetimeParams {
  time: f32,
  lifetime: f32,
  capacity: u32,
  _padding: u32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<VgpuParticle>;
@group(0) @binding(1) var<uniform> params: RetimeParams;

@compute @workgroup_size(64) fn retime_particle_lifetime(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  if (index >= params.capacity) { return; }
  let particle = particles[index];
  if (!particle_is_alive(particle, params.time)) { return; }
  let normalized_age = particle_normalized_age(particle, params.time);
  particles[index].spawn_time = params.time - normalized_age * params.lifetime;
  particles[index].lifetime = params.lifetime;
}
