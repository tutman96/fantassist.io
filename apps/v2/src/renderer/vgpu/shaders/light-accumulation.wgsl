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
}

@group(0) @binding(0) var shadows: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let visibility = textureSampleLevel(shadows, texture_sampler, uv, 0.0).rg;
  let red_center = vec2f(11.0 + sin(params.time * 0.7) * 3.0, 8.5 + cos(params.time * 0.7) * 1.5);
  let blue_center = vec2f(28.0 + cos(params.time * 0.6) * 2.4, 14.0 + sin(params.time * 0.6) * 2.0);
  let red = pow(max(1.0 - distance(world, red_center) / 16.0, 0.0), 2.0) * visibility.r;
  let blue = pow(max(1.0 - distance(world, blue_center) / 18.0, 0.0), 2.0) * visibility.g;
  let accumulated = vec3f(1.0, 0.16, 0.06) * red * 1.8 + vec3f(0.05, 0.28, 1.0) * blue * 2.1;
  return vec4f(accumulated, 1.0);
}
