import { VgpuParticle, particle_alpha_envelope, particle_is_alive } from "../../particles/wgsl/particle-library.wgsl";
import { particle_normalized_age, particle_random, particle_spawn_2d } from "../../particles/wgsl/particle-library.wgsl";

// Emission and particle records are owned by the shared renderer particle emitter.
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
  drop_size: f32,
  polygon_vertex_count: u32,
  emitter_min: vec2f,
  emitter_max: vec2f,
  color: vec3f,
}

struct RainParticleContext {
  initialization_seed: u32,
  initialized: u32,
  vanishing_point: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> polygon_vertices: array<vec2f>;
@group(0) @binding(2) var<storage, read> particles: array<VgpuParticle>;
@group(0) @binding(3) var<storage, read> contexts: array<RainParticleContext>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) point_grid: vec2f,
  @location(1) @interpolate(flat) projected_grid: vec2f,
  @location(2) @interpolate(flat) radial: vec2f,
  @location(3) @interpolate(flat) state: vec4f,
  @location(4) @interpolate(flat) character: vec2f,
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
  let context = contexts[instance_index];
  let phase = particle_normalized_age(particle, params.time);
  let event_impact_grid = particle_spawn_2d(particle.initialization_seed, params.emitter_min, params.emitter_max);
  let radial_delta = event_impact_grid - context.vanishing_point;
  let radial_distance = length(radial_delta);
  let fallback_angle = particle_random(particle.initialization_seed, 89u) * 6.28318530718;
  let fallback_radial = vec2f(cos(fallback_angle), sin(fallback_angle));
  let radial = select(fallback_radial, radial_delta / max(radial_distance, 0.00001), radial_distance > 0.00001);
  let perspective_random = 0.58 + 0.74 * particle_random(particle.initialization_seed, 47u);
  let effective_speed = 1.0 / max(particle.lifetime * 0.45 * 0.48, 0.00001);
  let speed_blur = clamp(sqrt(effective_speed / 10.0), 0.25, 1.6);
  let travel_distance = radial_distance * 0.12 * perspective_random;
  let projected_grid = event_impact_grid + radial * travel_distance * (1.0 - phase);
  let width_random = 0.9 + 0.2 * particle_random(particle.initialization_seed, 13u);
  let intensity_random = 0.82 + 0.18 * particle_random(particle.initialization_seed, 61u);
  let length_random = 0.55 + 1.1 * particle_random(particle.initialization_seed, 31u);
  let radial_scale = smoothstep(0.0, 6.0, radial_distance);
  let longitudinal_radial = mix(0.18, 1.0, radial_scale);
  let cross_radial = mix(0.6, 1.0, radial_scale);
  let longitudinal_sigma = (0.035 + speed_blur * 0.135 + radial_distance * speed_blur * 0.0035) * length_random * longitudinal_radial;
  let cross_sigma = clamp((0.018 + params.drop_size * 0.035) * width_random * cross_radial, 0.015, 1.4);
  let visibility = mix(0.075, 1.0, radial_scale);
  let blur_center = projected_grid + radial * longitudinal_sigma * 0.65;
  let extent = length(vec2f(longitudinal_sigma, cross_sigma)) * 4.0;
  let point_grid = blur_center + corners[vertex_index] * extent;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  let enabled_instance = select(0.0, 1.0, particle_is_alive(particle, params.time) && phase < 1.0);
  var output: VertexOutput;
  let clip_position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.position = select(vec4f(2.0, 2.0, 0.0, 1.0), clip_position, enabled_instance > 0.0);
  output.point_grid = point_grid;
  output.projected_grid = blur_center;
  output.radial = radial;
  output.state = vec4f(phase, cross_sigma, intensity_random * visibility, enabled_instance);
  output.character = vec2f(longitudinal_sigma, cross_sigma);
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
  if (!inside_polygon(input.point_grid)) { discard; }
  let phase = input.state.x;
  let intensity_random = input.state.z;

  let offset = input.point_grid - input.projected_grid;
  let parallel = dot(offset, input.radial) / input.character.x;
  let perpendicular = dot(offset, vec2f(-input.radial.y, input.radial.x)) / input.character.y;
  let streak_shape = exp(-0.5 * (parallel * parallel + perpendicular * perpendicular));
  let alpha_envelope = particle_alpha_envelope(phase, 0.36, 0.56, 0.88);
  let streak = streak_shape * alpha_envelope;

  let enabled = select(0.0, 1.0, params.drop_size > 0.0);
  let alpha = clamp(params.opacity * streak * intensity_random * input.state.w * enabled, 0.0, params.opacity);
  return vec4f(params.color * alpha, alpha);
}
