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
  color: vec4f,
  energy: f32,
}

@group(0) @binding(0) var<storage, read> segments: array<Segment>;
@group(0) @binding(1) var<uniform> params: Params;

fn cross2(a: vec2f, b: vec2f) -> f32 { return a.x * b.y - a.y * b.x; }

fn point_segment_distance(point: vec2f, a: vec2f, b: vec2f) -> f32 {
  let edge = b - a;
  let amount = clamp(dot(point - a, edge) / max(dot(edge, edge), 0.000001), 0.0, 1.0);
  return distance(point, a + edge * amount);
}

fn capsule_visibility(point: vec2f, segment: Segment) -> f32 {
  let ray = point - params.light_position;
  let wall = segment.b - segment.a;
  let denominator = cross2(ray, wall);
  var distance_between_segments: f32;
  if (abs(denominator) >= 0.00001) {
    let delta = segment.a - params.light_position;
    let ray_t = cross2(delta, wall) / denominator;
    let wall_t = cross2(delta, ray) / denominator;
    if (ray_t > 0.0 && ray_t < 1.0 && wall_t >= 0.0 && wall_t <= 1.0) {
      distance_between_segments = 0.0;
    } else {
      distance_between_segments = min(
        min(point_segment_distance(segment.a, params.light_position, point), point_segment_distance(segment.b, params.light_position, point)),
        min(point_segment_distance(params.light_position, segment.a, segment.b), point_segment_distance(point, segment.a, segment.b)),
      );
    }
  } else {
    distance_between_segments = min(
      min(point_segment_distance(segment.a, params.light_position, point), point_segment_distance(segment.b, params.light_position, point)),
      min(point_segment_distance(params.light_position, segment.a, segment.b), point_segment_distance(point, segment.a, segment.b)),
    );
  }
  let half_width = 1.0 / 64.0;
  let penumbra = 0.04;
  let antialias = 1.0 / params.pixels_per_grid;
  return smoothstep(max(0.0, half_width - antialias), half_width + penumbra + antialias, distance_between_segments);
}

fn srgb_to_linear(value: vec3f) -> vec3f {
  let low = value / 12.92;
  let high = pow((value + 0.055) / 1.055, vec3f(2.4));
  return select(high, low, value <= vec3f(0.04045));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let radius = max(params.bright_distance, params.dim_distance);
  let light_distance = distance(world, params.light_position);
  if (radius <= 0.0 || light_distance >= radius) { return vec4f(0.0); }

  var visibility = 1.0;
  for (var index = 0u; index < params.segment_count; index++) {
    visibility = min(visibility, capsule_visibility(world, segments[index]));
    if (visibility <= 0.0) { return vec4f(0.0); }
  }

  let bright = min(params.bright_distance, radius);
  var attenuation: f32;
  if (bright > 0.0 && light_distance <= bright) {
    attenuation = mix(1.0, 0.7, light_distance / bright);
  } else {
    attenuation = 0.7 * (1.0 - smoothstep(bright, radius, light_distance));
  }
  let linear_color = srgb_to_linear(clamp(params.color.rgb, vec3f(0.0), vec3f(1.0)));
  let energy = clamp(params.energy, 0.0, 1.0);
  let emitted = energy * pow(attenuation, mix(2.2, 1.0, energy));
  return vec4f(linear_color * emitted * visibility, emitted * visibility);
}
