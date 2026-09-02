import { VgpuParticle, particle_random } from "../../particles/wgsl/particle-library.wgsl";

struct PathSegment {
  start: vec2f,
  end: vec2f,
  distance_start: f32,
  length: f32,
}

struct FireSparkContext {
  initialization_seed: u32,
  initialized: u32,
  position: vec2f,
  tangent: vec2f,
  normal: vec2f,
}

struct Params {
  total_length: f32,
  segment_count: u32,
  capacity: u32,
  _padding: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> particles: array<VgpuParticle>;
@group(0) @binding(2) var<storage, read> segments: array<PathSegment>;
@group(0) @binding(3) var<storage, read_write> contexts: array<FireSparkContext>;

@compute @workgroup_size(64) fn cs_main(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index >= params.capacity) { return; }
  let particle = particles[index];
  let previous = contexts[index];
  if (particle.alive == 0u || (previous.initialized != 0u && previous.initialization_seed == particle.initialization_seed)) { return; }
  let target_distance = particle_random(particle.initialization_seed, 127u) * params.total_length;
  var chosen = segments[0];
  for (var segment_index = 0u; segment_index < params.segment_count; segment_index++) {
    let candidate = segments[segment_index];
    chosen = candidate;
    if (target_distance <= candidate.distance_start + candidate.length) { break; }
  }
  let amount = clamp((target_distance - chosen.distance_start) / max(chosen.length, 0.000001), 0.0, 1.0);
  let tangent = normalize(chosen.end - chosen.start);
  contexts[index] = FireSparkContext(
    particle.initialization_seed,
    1u,
    mix(chosen.start, chosen.end, amount),
    tangent,
    vec2f(-tangent.y, tangent.x),
  );
}
