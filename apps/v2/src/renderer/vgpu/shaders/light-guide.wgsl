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
  position: vec2f,
  bright_distance: f32,
  dim_distance: f32,
  color: vec4f,
  selected: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let distance_px = distance(world, params.position) * params.pixels_per_grid;
  let css = params.target_pixels_per_css_pixel;
  let bright_px = params.bright_distance * params.pixels_per_grid;
  let dim_px = params.dim_distance * params.pixels_per_grid;
  let bright_ring = 1.0 - smoothstep(1.0 * css, 2.0 * css, abs(distance_px - bright_px));
  let dim_ring = 1.0 - smoothstep(1.0 * css, 2.0 * css, abs(distance_px - dim_px));
  let outer = 1.0 - smoothstep(6.0 * css, 7.0 * css, distance_px);
  let core = 1.0 - smoothstep(2.0 * css, 3.0 * css, distance_px);
  let guide = max(bright_ring * 0.35, dim_ring * 0.55) * mix(0.35, 1.0, params.selected);
  let emitter = max(outer * params.color.a, core);
  let rgb = mix(params.color.rgb, vec3f(1.0), core);
  return vec4f(rgb * max(guide, emitter), max(guide, emitter));
}
