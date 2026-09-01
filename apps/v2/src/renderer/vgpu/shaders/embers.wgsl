import { VgpuParticle, particle_alpha_envelope, particle_is_alive } from "../../particles/wgsl/particle-library.wgsl";
import { particle_normalized_age, particle_random, particle_spawn_2d } from "../../particles/wgsl/particle-library.wgsl";

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
  seed: f32,
  opacity: f32,
  particle_size: f32,
  polygon_vertex_count: u32,
  emitter_min: vec2f,
  emitter_max: vec2f,
  color: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> polygon_vertices: array<vec2f>;
@group(0) @binding(2) var<storage, read> particles: array<VgpuParticle>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) point_grid: vec2f,
  @location(1) @interpolate(flat) center_grid: vec2f,
  @location(2) @interpolate(flat) spawn_grid: vec2f,
  @location(3) @interpolate(flat) state: vec4f,
}

@vertex fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let particle = particles[instance_index];
  let phase = particle_normalized_age(particle, params.time);
  let spawn_grid = particle_spawn_2d(particle.initialization_seed, params.emitter_min, params.emitter_max);
  let drift_angle = particle_random(particle.initialization_seed, 47u) * 6.28318530718;
  let drift_direction = vec2f(cos(drift_angle), sin(drift_angle));
  let drift_tangent = vec2f(-drift_direction.y, drift_direction.x);
  let drift_distance = (0.25 + 0.9 * particle_random(particle.initialization_seed, 31u)) * phase;
  let sway_phase = particle_random(particle.initialization_seed, 71u) * 6.28318530718;
  let sway_frequency = 0.65 + 0.85 * particle_random(particle.initialization_seed, 89u);
  let sway = sin(sway_phase + phase * sway_frequency * 6.28318530718) * 0.08 * phase;
  // In a top-down view, vertical lift reads as slight growth while convection supplies planar drift.
  let center_grid = spawn_grid + drift_direction * drift_distance + drift_tangent * sway;
  let size_random = 0.55 + 0.9 * particle_random(particle.initialization_seed, 13u);
  let flicker = 0.86 + 0.14 * sin(sway_phase + params.time * (7.0 + 5.0 * particle_random(particle.initialization_seed, 109u)));
  let lift_scale = mix(0.7, 1.3, smoothstep(0.0, 0.8, phase));
  let radius = max(0.012, params.particle_size * size_random * lift_scale);
  let extent = radius * 4.5;
  let point_grid = center_grid + corners[vertex_index] * extent;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  let enabled = select(0.0, 1.0, particle_is_alive(particle, params.time) && phase < 1.0);
  var output: VertexOutput;
  let clip_position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.position = select(vec4f(2.0, 2.0, 0.0, 1.0), clip_position, enabled > 0.0);
  output.point_grid = point_grid;
  output.center_grid = center_grid;
  output.spawn_grid = spawn_grid;
  output.state = vec4f(phase, radius, flicker, enabled);
  return output;
}

fn inside_polygon(point: vec2f) -> bool {
  var inside = false;
  var previous = params.polygon_vertex_count - 1u;
  for (var index = 0u; index < params.polygon_vertex_count; index++) {
    let a = polygon_vertices[index];
    let b = polygon_vertices[previous];
    if ((a.y > point.y) != (b.y > point.y)) {
      let crossing_x = (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
      if (point.x < crossing_x) { inside = !inside; }
    }
    previous = index;
  }
  return inside;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  if (!inside_polygon(input.spawn_grid)) { discard; }
  let normalized = (input.point_grid - input.center_grid) / input.state.y;
  let distance_squared = dot(normalized, normalized);
  let core = exp(-2.8 * distance_squared);
  let halo = exp(-0.34 * distance_squared) * 0.2;
  let envelope = particle_alpha_envelope(input.state.x, 0.08, 0.72, 0.96);
  let strength = (core + halo) * envelope * input.state.z * input.state.w;
  let alpha = clamp(params.opacity * strength, 0.0, 1.0);
  let hot_color = mix(params.color, vec3f(1.0, 0.86, 0.42), clamp(core * 0.8, 0.0, 1.0));
  return vec4f(hot_color * alpha, alpha);
}
