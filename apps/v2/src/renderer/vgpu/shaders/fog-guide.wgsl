struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;

@vertex fn vs_main(@location(0) point_grid: vec2f) -> @builtin(position) vec4f {
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  return vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}

@fragment fn fs_main() -> @location(0) vec4f {
  return params.color;
}
