import { procedural_hash_u32, procedural_value_fbm3, procedural_value_noise } from "./procedural-noise.wgsl";

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
  seed: u32,
  opacity: f32,
  coverage: f32,
  cloud_scale: f32,
  speed: f32,
  turbulence: f32,
  transition: f32,
  polygon_vertex_count: u32,
  color: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> polygon_vertices: array<vec2f>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) point_grid: vec2f,
}

@vertex fn vs_main(@location(0) point_grid: vec2f) -> VertexOutput {
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  var output: VertexOutput;
  output.position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.point_grid = point_grid;
  return output;
}

fn polygon_edge_distance(point: vec2f) -> f32 {
  var closest = 1e20;
  var previous = params.polygon_vertex_count - 1u;
  for (var index = 0u; index < params.polygon_vertex_count; index++) {
    let start = polygon_vertices[previous];
    let end = polygon_vertices[index];
    let segment = end - start;
    let amount = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
    closest = min(closest, length(point - (start + segment * amount)));
    previous = index;
  }
  return closest;
}

fn rgb_to_hsv(color: vec3f) -> vec3f {
  let maximum = max(max(color.r, color.g), color.b);
  let minimum = min(min(color.r, color.g), color.b);
  let delta = maximum - minimum;
  var hue = 0.0;
  if (delta > 0.0001) {
    if (maximum == color.r) {
      hue = (color.g - color.b) / delta;
    } else if (maximum == color.g) {
      hue = (color.b - color.r) / delta + 2.0;
    } else {
      hue = (color.r - color.g) / delta + 4.0;
    }
    hue = fract(hue / 6.0);
  }
  return vec3f(hue, select(0.0, delta / max(maximum, 0.0001), maximum > 0.0001), maximum);
}

fn hsv_to_rgb(color: vec3f) -> vec3f {
  let channels = clamp(abs(fract(color.xxx + vec3f(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
  return color.z * mix(vec3f(1.0), channels, color.y);
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  if (params.coverage <= 0.0 || params.transition <= 0.0) { discard; }
  let scale = max(params.cloud_scale, 0.05);
  let seed_angle = f32(procedural_hash_u32(params.seed)) / 4294967295.0 * 6.28318530718;
  let drift = vec2f(cos(seed_angle), sin(seed_angle)) * params.time * params.speed / scale;
  let base = input.point_grid / scale;
  let warp_domain = base * 0.48 + drift * 0.24;
  let warp = vec2f(
    procedural_value_noise(warp_domain + vec2f(7.3, 19.1), params.seed, 17u),
    procedural_value_noise(warp_domain + vec2f(31.7, 5.9), params.seed, 47u),
  ) - vec2f(0.5);
  let domain = base + drift + warp * params.turbulence * 0.9;
  let broad = procedural_value_fbm3(domain * 0.78, params.seed, 79u);
  let billow = procedural_value_noise(domain * 1.61 - drift * 0.38 + vec2f(13.8, 2.4), params.seed, 151u);
  let field = clamp(broad * mix(0.88, 0.72, params.turbulence) + billow * mix(0.12, 0.28, params.turbulence), 0.0, 1.0);
  let threshold = 0.72 - params.coverage * 0.55;
  let body = smoothstep(threshold - 0.13, threshold + 0.11, field);
  let edge_width = clamp(scale * 0.3, 0.2, 1.1);
  let edge = smoothstep(0.0, edge_width, polygon_edge_distance(input.point_grid));
  let alpha = clamp(params.opacity * params.transition * body * edge, 0.0, 1.0);
  let color_phase = clamp(field * 0.62 + billow * 0.38, 0.0, 1.0);
  let authored_hsv = rgb_to_hsv(params.color);
  let cloud_color = hsv_to_rgb(vec3f(
    fract(authored_hsv.x + mix(-0.035, 0.045, color_phase)),
    clamp(authored_hsv.y * mix(1.08, 0.88, color_phase), 0.0, 1.0),
    clamp(authored_hsv.z * mix(0.68, 1.2, color_phase), 0.0, 1.0),
  ));
  return vec4f(cloud_color * alpha, alpha);
}
