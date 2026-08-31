import { VgpuParticle } from "../../particles/wgsl/particle-library.wgsl";

struct RainParticleContext {
  initialization_seed: u32,
  initialized: u32,
  vanishing_point: vec2f,
}

struct Params {
  vanishing_point: vec2f,
  capacity: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> particles: array<VgpuParticle>;
@group(0) @binding(2) var<storage, read_write> contexts: array<RainParticleContext>;

@compute @workgroup_size(64) fn cs_main(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index >= params.capacity) { return; }
  let particle = particles[index];
  let context = contexts[index];
  if (particle.alive != 0u && (context.initialized == 0u || context.initialization_seed != particle.initialization_seed)) {
    contexts[index] = RainParticleContext(particle.initialization_seed, 1u, params.vanishing_point);
  }
}
