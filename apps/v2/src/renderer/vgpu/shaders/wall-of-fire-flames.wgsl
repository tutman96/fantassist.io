import { VgpuParticle, particle_is_alive } from "../../particles/wgsl/particle-library.wgsl";
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
  @location(2) @interpolate(flat) tangent: vec2f,
  @location(3) @interpolate(flat) normal: vec2f,
  @location(4) @interpolate(flat) state: vec4f,
  @location(5) @interpolate(flat) warp: vec2f,
}

@vertex fn vs_main(@builtin(vertex_index) vertex_index: u32, @builtin(instance_index) instance_index: u32) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let particle = particles[instance_index];
  let context = contexts[instance_index];
  let phase = particle_normalized_age(particle, params.time);
  let side = select(-1.0, 1.0, particle_random(particle.initialization_seed, 31u) > 0.5);
  let growth = 0.42 + 0.58 * sin(phase * 3.14159265359);
  let reach = 0.08 + 0.13 * particle_random(particle.initialization_seed, 47u);
  let along = (particle_random(particle.initialization_seed, 89u) * 2.0 - 1.0) * params.width * 0.08;
  let axial_sigma = params.width * reach * growth;
  let cross_sigma = params.width * (0.04 + 0.05 * particle_random(particle.initialization_seed, 131u));
  let center_grid = context.position + context.normal * side * axial_sigma * 1.05 + context.tangent * along;
  let extent = max(0.025, axial_sigma * 4.0);
  let point_grid = center_grid + corners[vertex_index] * extent;
  let enabled = select(0.0, 1.0, context.initialized != 0u && particle_is_alive(particle, params.time));
  var output: VertexOutput;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  let clip_position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.position = select(vec4f(2.0, 2.0, 0.0, 1.0), clip_position, enabled > 0.0);
  output.point_grid = point_grid;
  output.center_grid = center_grid;
  output.tangent = context.tangent;
  output.normal = context.normal * side;
  output.state = vec4f(phase, axial_sigma, cross_sigma, enabled);
  output.warp = vec2f(
    particle_random(particle.initialization_seed, 71u) * 6.28318530718 + phase * 4.6,
    params.turbulence * (0.22 + 0.38 * particle_random(particle.initialization_seed, 149u)),
  );
  return output;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let offset = input.point_grid - input.center_grid;
  let axial = dot(offset, input.normal) / max(input.state.y, 0.0001);
  var cross = dot(offset, input.tangent) / max(input.state.z, 0.0001);
  let tip_warp = smoothstep(-1.4, 2.1, axial);
  cross += sin(axial * 1.55 + input.warp.x) * input.warp.y * tip_warp;
  let tip = smoothstep(-1.8, 2.2, axial);
  let taper = mix(1.2, 0.18, tip);
  let axial_shape = smoothstep(-2.4, -1.45, axial) * (1.0 - smoothstep(1.0, 2.45, axial));
  let cross_shape = exp(-1.9 * cross * cross / max(taper * taper, 0.02));
  let shape = axial_shape * cross_shape;
  let envelope = 1.0 - smoothstep(0.72, 0.98, input.state.x);
  let ragged = 0.72 + 0.28 * sin(input.state.x * 19.0 + input.state.y * 137.0);
  let alpha = clamp(params.opacity * params.intensity * 0.78 * shape * envelope * ragged * input.state.w, 0.0, 0.9);
  let hot_color = vec3f(1.0, 0.68, 0.035);
  let body_color = mix(params.color, vec3f(1.0, 0.28, 0.008), 0.56);
  let outer_color = params.color * vec3f(0.58, 0.34, 0.22);
  let flame_color = mix(mix(hot_color, body_color, smoothstep(0.04, 0.58, input.state.x)), outer_color, tip * 0.82);
  return vec4f(flame_color * alpha, alpha);
}
