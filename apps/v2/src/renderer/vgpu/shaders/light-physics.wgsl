export fn physical_light_attenuation(
  light_distance: f32,
  bright_distance: f32,
  dim_distance: f32,
) -> f32 {
  let radius = max(bright_distance, dim_distance);
  if (radius <= 0.0 || light_distance >= radius) { return 0.0; }
  let reference_distance = max(bright_distance, max(radius * 0.25, 0.25));
  let inverse_square = 1.0 / (1.0 + pow(light_distance / reference_distance, 2.0));
  let cutoff = 1.0 - smoothstep(radius * 0.85, radius, light_distance);
  return inverse_square * cutoff;
}

export fn inferred_source_radius(bright_distance: f32) -> f32 {
  return clamp(0.03 + bright_distance * 0.01, 0.03, 0.12);
}
