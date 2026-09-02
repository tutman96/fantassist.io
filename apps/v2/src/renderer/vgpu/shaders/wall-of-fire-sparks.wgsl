import { VgpuParticle, particle_alpha_envelope, particle_is_alive } from "../../particles/wgsl/particle-library.wgsl";
import { particle_normalized_age, particle_random } from "../../particles/wgsl/particle-library.wgsl";

struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
  time: f32,
  opacity: f32,
  width: f32,
  intensity: f32,
  spark_size: f32,
  spark_probability: f32,
  turbulence: f32,
  color: vec3f,
}

struct FireSparkContext {
  initialization_seed: u32,
  initialized: u32,
  position: vec2f,
  tangent: vec2f,
  normal: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> particles: array<VgpuParticle>;
@group(0) @binding(2) var<storage, read> contexts: array<FireSparkContext>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) point_grid: vec2f,
  @location(1) @interpolate(flat) center_grid: vec2f,
  @location(2) @interpolate(flat) state: vec4f,
}

@vertex fn vs_main(@builtin(vertex_index) vertex_index: u32, @builtin(instance_index) instance_index: u32) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let particle = particles[instance_index];
  let context = contexts[instance_index];
  let phase = particle_normalized_age(particle, params.time);
  let side = particle_random(particle.initialization_seed, 31u) * 2.0 - 1.0;
  let forward = particle_random(particle.initialization_seed, 47u) * 2.0 - 1.0;
  let curl = sin(particle_random(particle.initialization_seed, 71u) * 6.28318530718 + phase * 4.0) * params.turbulence * 0.16 * phase;
  let center_grid = context.position
    + context.normal * (side * params.width * 0.42 + curl)
    + context.tangent * forward * 0.18 * phase;
  let lift_scale = mix(0.7, 1.25, phase);
  let radius = max(0.008, params.spark_size * 0.55 * (0.65 + particle_random(particle.initialization_seed, 13u) * 0.7) * lift_scale);
  let point_grid = center_grid + corners[vertex_index] * radius * 3.6;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  let spark_enabled = particle_random(particle.initialization_seed, 151u) < clamp(params.spark_probability, 0.0, 1.0);
  let enabled = select(0.0, 1.0, spark_enabled && context.initialized != 0u && particle_is_alive(particle, params.time));
  var output: VertexOutput;
  let clip_position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.position = select(vec4f(2.0, 2.0, 0.0, 1.0), clip_position, enabled > 0.0);
  output.point_grid = point_grid;
  output.center_grid = center_grid;
  output.state = vec4f(phase, radius, enabled, 0.0);
  return output;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let normalized = (input.point_grid - input.center_grid) / input.state.y;
  let distance_squared = dot(normalized, normalized);
  let glow = exp(-2.7 * distance_squared) + exp(-0.38 * distance_squared) * 0.09;
  let envelope = particle_alpha_envelope(input.state.x, 0.08, 0.7, 0.96);
  let alpha = clamp(params.opacity * params.intensity * glow * envelope * input.state.z, 0.0, 1.0);
  let hot_color = mix(params.color, vec3f(1.0, 0.84, 0.34), exp(-2.5 * distance_squared) * 0.82);
  return vec4f(hot_color * alpha, alpha);
}
