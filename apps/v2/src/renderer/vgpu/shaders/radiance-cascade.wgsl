import { physical_light_attenuation } from "./light-physics.wgsl";
import { rc_atlas_decode, rc_atlas_texel, rc_block_size } from "./rc-directions.wgsl";
import { rc_direction, rc_probe_origin, rc_probe_spacing, rc_ray_count } from "./rc-directions.wgsl";

fn interval_start(cascade: f32) -> f32 {
  return 2.0 * (pow(4.0, cascade) - 1.0) / 3.0;
}

fn interval_end(cascade: f32) -> f32 {
  return interval_start(cascade) + 2.04 * pow(4.0, cascade);
}

struct Segment { a: vec2f, b: vec2f }

struct Light {
  position: vec2f,
  bright_distance: f32,
  dim_distance: f32,
  color: vec4f,
}

struct Params {
  state: vec4f,
  field_size: vec2f,
  target_to_grid_offset: vec2f,
  pixels_per_grid: f32,
  segment_count: u32,
  light_count: u32,
  light_index: u32,
  bounce_gain: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var upper_tex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> segments: array<Segment>;
@group(0) @binding(3) var<storage, read> lights: array<Light>;

fn cross2(a: vec2f, b: vec2f) -> f32 { return a.x * b.y - a.y * b.x; }

fn srgb_to_linear(value: vec3f) -> vec3f {
  let low = value / 12.92;
  let high = pow((value + 0.055) / 1.055, vec3f(2.4));
  return select(high, low, value <= vec3f(0.04045));
}

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

fn trace_interval(origin: vec2f, direction: vec2f, start: f32, end: f32) -> vec4f {
  let origin_grid = origin / params.pixels_per_grid + params.target_to_grid_offset;
  let direction_grid = direction / params.pixels_per_grid;
  var nearest = end + 1.0;
  var nearest_index = params.segment_count;
  for (var index = 0u; index < params.segment_count; index++) {
    let segment = segments[index];
    let wall = segment.b - segment.a;
    let denominator = cross2(direction_grid, wall);
    if (abs(denominator) <= 0.000001) { continue; }
    let delta = segment.a - origin_grid;
    let distance_px = cross2(delta, wall) / denominator;
    let wall_t = cross2(delta, direction_grid) / denominator;
    if (distance_px >= start && distance_px <= end && wall_t >= -0.000001 && wall_t <= 1.000001 && distance_px < nearest) {
      nearest = distance_px;
      nearest_index = index;
    }
  }
  if (nearest_index == params.segment_count) { return vec4f(0.0, 0.0, 0.0, 1.0); }

  let hit = origin_grid + direction_grid * nearest;
  let segment = segments[nearest_index];
  let wall = segment.b - segment.a;
  var normal = normalize(vec2f(-wall.y, wall.x));
  let light = lights[min(params.light_index, params.light_count - 1u)];
  let to_light = light.position - hit;
  if (dot(normal, to_light) < 0.0) { normal = -normal; }
  let light_distance = length(to_light);
  let attenuation = physical_light_attenuation(light_distance, light.bright_distance, light.dim_distance);
  if (light.color.a <= 0.0 || attenuation <= 0.0 || blocked(light.position, hit, nearest_index)) {
    return vec4f(0.0);
  }
  let incident = max(dot(normal, to_light / max(light_distance, 0.000001)), 0.0);
  let outgoing = max(dot(normal, -direction), 0.0);
  let color = srgb_to_linear(clamp(light.color.rgb, vec3f(0.0), vec3f(1.0)));
  return vec4f(color * light.color.a * attenuation * incident * outgoing * params.bounce_gain, 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let atlas_size = vec2f(textureDimensions(upper_tex));
  let cascade = params.state.x;
  let block = rc_block_size(cascade);
  let decoded = rc_atlas_decode(floor(uv * atlas_size), block);
  let origin = rc_probe_origin(decoded.xy, rc_probe_spacing(cascade));
  let direction = rc_direction(decoded.z, rc_ray_count(cascade));
  let light = lights[min(params.light_index, params.light_count - 1u)];
  if (light.color.a <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  var radiance = trace_interval(origin, direction, interval_start(cascade), interval_end(cascade));
  if (params.state.y > 0.5) {
    let upper_block = block * 2.0;
    let upper_spacing = rc_probe_spacing(cascade) * 2.0;
    let upper_grid = atlas_size / upper_block;
    let position = origin / upper_spacing - 0.5;
    let base = floor(position);
    let fraction = clamp(position - base, vec2f(0.0), vec2f(1.0));
    let weights = vec4f(
      (1.0 - fraction.x) * (1.0 - fraction.y), fraction.x * (1.0 - fraction.y),
      (1.0 - fraction.x) * fraction.y, fraction.x * fraction.y,
    );
    var far = vec4f(0.0);
    for (var branch = 0; branch < 4; branch++) {
      let upper_direction = decoded.z * 4.0 + f32(branch);
      var interpolated = vec4f(0.0);
      for (var corner = 0; corner < 4; corner++) {
        let offset = vec2f(f32(corner % 2), f32(corner / 2));
        let probe = clamp(base + offset, vec2f(0.0), upper_grid - 1.0);
        let coord = rc_atlas_texel(probe, upper_direction, upper_block);
        interpolated += weights[corner] * textureLoad(upper_tex, vec2i(coord), 0);
      }
      far += interpolated * 0.25;
    }
    radiance = vec4f(radiance.rgb + radiance.a * far.rgb, radiance.a * far.a);
  }
  return radiance;
}
