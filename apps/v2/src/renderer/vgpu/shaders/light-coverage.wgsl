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
}

@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let radius = max(params.bright_distance, params.dim_distance);
  let light_distance = distance(world, params.light_position);
  if (radius <= 0.0 || light_distance >= radius) { return vec4f(0.0); }
  let bright = min(params.bright_distance, radius);
  var attenuation: f32;
  if (bright > 0.0 && light_distance <= bright) {
    attenuation = mix(1.0, 0.7, light_distance / bright);
  } else {
    attenuation = 0.7 * (1.0 - smoothstep(bright, radius, light_distance));
  }
  return vec4f(attenuation);
}
