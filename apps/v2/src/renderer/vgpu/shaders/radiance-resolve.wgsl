import { physical_light_attenuation } from "./light-physics.wgsl";
import { rc_atlas_texel, rc_block_size, rc_ray_count } from "./rc-directions.wgsl";

struct Segment { a: vec2f, b: vec2f }

struct Light {
  position: vec2f,
  bright_distance: f32,
  dim_distance: f32,
  color: vec4f,
}

struct Params {
  field_size: vec2f,
  target_to_grid_offset: vec2f,
  pixels_per_grid: f32,
  segment_count: u32,
  light_count: u32,
  light_index: u32,
}

@group(0) @binding(0) var cascade_tex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> segments: array<Segment>;
@group(0) @binding(2) var<storage, read> lights: array<Light>;
@group(0) @binding(3) var<uniform> params: Params;

fn cross2(a: vec2f, b: vec2f) -> f32 { return a.x * b.y - a.y * b.x; }

fn blocked(origin: vec2f, point: vec2f, excluded: u32) -> bool {
  let ray = point - origin;
  for (var index = 0u; index < params.segment_count; index++) {
    if (index == excluded) { continue; }
    let segment = segments[index];
    let wall = segment.b - segment.a;
    let denominator = cross2(ray, wall);
    if (abs(denominator) <= 0.000001) { continue; }
    let delta = segment.a - origin;
    let ray_t = cross2(delta, wall) / denominator;
    let wall_t = cross2(delta, ray) / denominator;
    if (ray_t > 0.000001 && ray_t < 0.999999 && wall_t >= -0.000001 && wall_t <= 1.000001) {
      return true;
    }
  }
  return false;
}

fn valid_bounce_path(receiver: vec2f) -> bool {
  let sample_amounts = array<f32, 3>(0.15, 0.5, 0.85);
  let light = lights[min(params.light_index, params.light_count - 1u)];
  if (light.color.a <= 0.0) { return false; }
  for (var wall_index = 0u; wall_index < params.segment_count; wall_index++) {
    let segment = segments[wall_index];
    let wall = segment.b - segment.a;
    for (var sample_index = 0; sample_index < 3; sample_index++) {
      let bounce = segment.a + wall * sample_amounts[sample_index];
      let light_side = cross2(wall, light.position - bounce);
      let receiver_side = cross2(wall, receiver - bounce);
      if (light_side * receiver_side <= 0.000001) { continue; }
      let attenuation = physical_light_attenuation(
        distance(light.position, bounce),
        light.bright_distance,
        light.dim_distance,
      );
      if (attenuation <= 0.0) { continue; }
      if (!blocked(light.position, bounce, wall_index) && !blocked(bounce, receiver, wall_index)) {
        return true;
      }
    }
  }
  return false;
}

fn cascade_irradiance(probe: vec2f) -> vec3f {
  let atlas_size = vec2f(textureDimensions(cascade_tex));
  let block = rc_block_size(0.0);
  let rays = rc_ray_count(0.0);
  var irradiance = vec3f(0.0);
  for (var ray = 0.0; ray < rays; ray = ray + 1.0) {
    irradiance += textureLoad(cascade_tex, vec2i(rc_atlas_texel(probe, ray, block)), 0).rgb;
  }
  return irradiance / rays;
}

struct ResolveOutput {
  @location(0) unrestricted: vec4f,
  @location(1) fog_clipped: vec4f,
}

@fragment fn fs_main(@location(0) uv: vec2f) -> ResolveOutput {
  let center = clamp(floor(uv * params.field_size), vec2f(0.0), params.field_size - 1.0);
  let receiver = (center + 0.5) / params.pixels_per_grid + params.target_to_grid_offset;
  var output: ResolveOutput;
  let offsets = array<vec2f, 5>(
    vec2f(0.0, 0.0),
    vec2f(-1.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, -1.0),
    vec2f(0.0, 1.0),
  );
  let weights = array<f32, 5>(4.0, 1.0, 1.0, 1.0, 1.0);
  var filtered = vec3f(0.0);
  for (var index = 0; index < 5; index++) {
    let probe = clamp(center + offsets[index], vec2f(0.0), params.field_size - 1.0);
    let neighbour = (probe + 0.5) / params.pixels_per_grid + params.target_to_grid_offset;
    let irradiance = cascade_irradiance(probe);
    if (all(irradiance <= vec3f(0.000001))) { continue; }
    if (blocked(receiver, neighbour, 0xffffffffu) || !valid_bounce_path(neighbour)) { continue; }
    filtered += irradiance * weights[index];
  }
  filtered /= 8.0;

  let light = lights[min(params.light_index, params.light_count - 1u)];
  let radius = max(light.bright_distance, light.dim_distance);
  let feather = min(radius, max(0.25, 2.0 / params.pixels_per_grid));
  let radius_weight = select(0.0, 1.0 - smoothstep(radius - feather, radius, distance(receiver, light.position)), radius > 0.0);
  output.unrestricted = vec4f(filtered, 1.0);
  output.fog_clipped = vec4f(filtered * radius_weight, 1.0);
  return output;
}
