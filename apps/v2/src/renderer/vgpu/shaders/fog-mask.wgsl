struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let feather_grid = 1.5 / params.pixels_per_grid;
  let clear_region = 1.0 - smoothstep(7.8 - feather_grid, 7.8 + feather_grid, distance(world, vec2f(16.8, 11.7)));
  let passage = (1.0 - smoothstep(1.7 - feather_grid, 1.7 + feather_grid, abs(world.y - 11.7))) * step(world.x, 16.8);
  let visibility = max(clear_region, passage);
  let fog = 1.0 - visibility;
  return vec4f(fog, fog, fog, 1.0);
}
