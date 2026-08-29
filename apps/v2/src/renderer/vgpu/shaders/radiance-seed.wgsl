import { physical_light_attenuation } from "./light-physics.wgsl";

struct Segment { a: vec2f, b: vec2f }

struct Light {
  position: vec2f,
  bright_distance: f32,
  dim_distance: f32,
  color: vec4f,
}

struct Params {
  target_size: vec2f,
  target_to_grid_offset: vec2f,
  pixels_per_grid: f32,
  segment_count: u32,
  light_count: u32,
  bounce_gain: f32,
  floor_gain: f32,
}

@group(0) @binding(0) var<storage, read> segments: array<Segment>;
@group(0) @binding(1) var<storage, read> lights: array<Light>;
@group(0) @binding(2) var<uniform> params: Params;

fn cross2(a: vec2f, b: vec2f) -> f32 { return a.x * b.y - a.y * b.x; }

fn point_segment_distance(point: vec2f, a: vec2f, b: vec2f) -> f32 {
  let edge = b - a;
  let amount = clamp(dot(point - a, edge) / max(dot(edge, edge), 0.000001), 0.0, 1.0);
  return distance(point, a + edge * amount);
}

fn distance_to_segment(point: vec2f, segment: Segment) -> f32 {
  return point_segment_distance(point, segment.a, segment.b);
}

fn blocked(origin: vec2f, point: vec2f) -> bool {
  let ray = point - origin;
  for (var index = 0u; index < params.segment_count; index++) {
    let segment = segments[index];
    let wall = segment.b - segment.a;
    let denominator = cross2(ray, wall);
    if (abs(denominator) >= 0.00001) {
      let delta = segment.a - origin;
      let ray_t = cross2(delta, wall) / denominator;
      let wall_t = cross2(delta, ray) / denominator;
      if (ray_t > 0.0 && ray_t < 1.0 && wall_t >= 0.0 && wall_t <= 1.0) { return true; }
    }
    let distance_between_segments = min(
      min(point_segment_distance(segment.a, origin, point), point_segment_distance(segment.b, origin, point)),
      min(point_segment_distance(origin, segment.a, segment.b), point_segment_distance(point, segment.a, segment.b)),
    );
    if (distance_between_segments <= 1.0 / 64.0) { return true; }
  }
  return false;
}

fn attenuation(light: Light, point: vec2f) -> f32 {
  let light_distance = distance(light.position, point);
  return physical_light_attenuation(light_distance, light.bright_distance, light.dim_distance);
}

fn srgb_to_linear(value: vec3f) -> vec3f {
  let low = value / 12.92;
  let high = pow((value + 0.055) / 1.055, vec3f(2.4));
  return select(high, low, value <= vec3f(0.04045));
}

fn direct_radiance(point: vec2f) -> vec3f {
  var radiance = vec3f(0.0);
  for (var index = 0u; index < params.light_count; index++) {
    let light = lights[index];
    let energy = clamp(light.color.a, 0.0, 1.0);
    let light_attenuation = attenuation(light, point);
    if (light_attenuation <= 0.0 || blocked(light.position, point)) { continue; }
    let linear_color = srgb_to_linear(clamp(light.color.rgb, vec3f(0.0), vec3f(1.0)));
    radiance += linear_color * energy * light_attenuation;
  }
  return radiance;
}

fn wall_radiance(point: vec2f, normal: vec2f) -> vec3f {
  var radiance = vec3f(0.0);
  for (var index = 0u; index < params.light_count; index++) {
    let light = lights[index];
    let energy = clamp(light.color.a, 0.0, 1.0);
    let light_attenuation = attenuation(light, point);
    if (light_attenuation <= 0.0 || blocked(light.position, point)) { continue; }
    let to_light = light.position - point;
    let incident = max(dot(normal, to_light / max(length(to_light), 0.0001)), 0.0);
    let linear_color = srgb_to_linear(clamp(light.color.rgb, vec3f(0.0), vec3f(1.0)));
    radiance += linear_color * energy * light_attenuation * incident;
  }
  return radiance;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let wall_radius = max(1.0 / 64.0, 0.8 / params.pixels_per_grid);
  var nearest_distance = wall_radius;
  var wall_index = params.segment_count;
  for (var index = 0u; index < params.segment_count; index++) {
    let candidate_distance = distance_to_segment(world, segments[index]);
    if (candidate_distance <= nearest_distance) {
      nearest_distance = candidate_distance;
      wall_index = index;
    }
  }
  if (wall_index == params.segment_count) {
    return vec4f(direct_radiance(world) * params.floor_gain / params.pixels_per_grid, 0.0);
  }

  let wall = segments[wall_index].b - segments[wall_index].a;
  let normal = normalize(vec2f(-wall.y, wall.x));
  let plus_point = world + normal * wall_radius * 1.25;
  let minus_point = world - normal * wall_radius * 1.25;
  var plus_radiance = vec3f(0.0);
  var minus_radiance = vec3f(0.0);
  plus_radiance = wall_radiance(plus_point, normal);
  minus_radiance = wall_radiance(minus_point, -normal);
  let plus_energy = dot(plus_radiance, vec3f(0.2126, 0.7152, 0.0722));
  let minus_energy = dot(minus_radiance, vec3f(0.2126, 0.7152, 0.0722));
  let lit_normal = select(-normal, normal, plus_energy >= minus_energy);
  let radiance = select(minus_radiance, plus_radiance, plus_energy >= minus_energy) * params.bounce_gain;
  let angle = atan2(lit_normal.y, lit_normal.x);
  let encoded_normal = 0.01 + 0.98 * (angle + 3.141592653589793) / 6.283185307179586;
  return vec4f(radiance, encoded_normal);
}
