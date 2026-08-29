import { physical_light_attenuation } from "./light-physics.wgsl";

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
  let light_distance = distance(world, params.light_position);
  let attenuation = physical_light_attenuation(light_distance, params.bright_distance, params.dim_distance);
  return vec4f(attenuation);
}
