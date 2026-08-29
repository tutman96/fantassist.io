import { physical_light_attenuation } from "./light-physics.wgsl";

struct Segment { a: vec2f, b: vec2f }

struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
  target_pixels_per_css_pixel: f32,
  light_position: vec2f,
  bright_distance: f32,
  dim_distance: f32,
  segment_count: u32,
  shadow_sample_count: u32,
  color: vec4f,
  energy: f32,
}

@group(0) @binding(0) var<storage, read> segments: array<Segment>;
@group(0) @binding(1) var<uniform> params: Params;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let radius = max(params.bright_distance, params.dim_distance);
  let world = params.light_position + corners[vertex_index] * radius;
  let target_point = (world - params.target_to_grid_offset) * params.pixels_per_grid;
  let uv = target_point / params.target_size;
  var output: VertexOutput;
  output.position = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  output.uv = uv;
  return output;
}

fn cross2(a: vec2f, b: vec2f) -> f32 { return a.x * b.y - a.y * b.x; }

fn segment_blocks(origin: vec2f, point: vec2f, segment: Segment) -> bool {
  let ray = point - origin;
  let wall = segment.b - segment.a;
  let denominator = cross2(ray, wall);
  if (abs(denominator) > 0.000001) {
    let delta = segment.a - origin;
    let ray_t = cross2(delta, wall) / denominator;
    let wall_t = cross2(delta, ray) / denominator;
    return ray_t > 0.000001 && ray_t < 0.999999 && wall_t >= -0.000001 && wall_t <= 1.000001;
  }
  if (abs(cross2(segment.a - origin, ray)) > 0.000001) { return false; }
  let ray_length_squared = dot(ray, ray);
  let start = dot(segment.a - origin, ray) / max(ray_length_squared, 0.000001);
  let end = dot(segment.b - origin, ray) / max(ray_length_squared, 0.000001);
  return max(min(start, end), 0.000001) < min(max(start, end), 0.999999);
}

fn srgb_to_linear(value: vec3f) -> vec3f {
  let low = value / 12.92;
  let high = pow((value + 0.055) / 1.055, vec3f(2.4));
  return select(high, low, value <= vec3f(0.04045));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.energy <= 0.0) { return vec4f(0.0); }
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let radius = max(params.bright_distance, params.dim_distance);
  let light_distance = distance(world, params.light_position);
  if (radius <= 0.0 || light_distance >= radius) { return vec4f(0.0); }

  let pixel_grid = 1.0 / params.pixels_per_grid;
  let offsets = array<vec2f, 4>(
    vec2f(-0.25, -0.25),
    vec2f(0.25, 0.25),
    vec2f(0.25, -0.25),
    vec2f(-0.25, 0.25),
  );
  var visible_samples = 0.0;
  let sample_count = clamp(params.shadow_sample_count, 1u, 4u);
  for (var sample_index = 0u; sample_index < sample_count; sample_index++) {
    let sample_point = world + offsets[sample_index] * pixel_grid;
    var blocked = false;
    for (var index = 0u; index < params.segment_count; index++) {
      if (segment_blocks(params.light_position, sample_point, segments[index])) {
        blocked = true;
        break;
      }
    }
    if (!blocked) { visible_samples += 1.0; }
  }
  let visibility = visible_samples / f32(sample_count);
  if (visibility <= 0.0) { return vec4f(0.0); }

  let attenuation = physical_light_attenuation(light_distance, params.bright_distance, params.dim_distance);
  let linear_color = srgb_to_linear(clamp(params.color.rgb, vec3f(0.0), vec3f(1.0)));
  let energy = clamp(params.energy, 0.0, 1.0);
  let emitted = energy * attenuation;
  return vec4f(linear_color * emitted * visibility, emitted * visibility);
}
