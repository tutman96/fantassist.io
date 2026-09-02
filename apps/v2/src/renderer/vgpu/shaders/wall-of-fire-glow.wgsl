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
  width: f32,
  intensity: f32,
  speed: f32,
  transition: f32,
  color: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) path_distance: f32,
  @location(1) lateral: f32,
  @location(2) cap_amount: f32,
}

@vertex fn vs_main(
  @location(0) center_grid: vec2f,
  @location(1) extrusion: vec2f,
  @location(2) path_distance: f32,
  @location(3) lateral: f32,
  @location(4) path_offset: f32,
) -> VertexOutput {
  let point_grid = center_grid + extrusion * params.width * 0.72;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  var output: VertexOutput;
  output.position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.path_distance = path_distance + path_offset * params.width * 0.72;
  output.lateral = lateral;
  output.cap_amount = abs(path_offset);
  return output;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let seed_phase = f32(params.seed & 1023u) * 0.00613592315;
  let pulse = 0.78 + 0.22 * sin(input.path_distance * 0.53 - params.time * params.speed * 0.9 + seed_phase);
  let falloff = 1.0 - smoothstep(0.08, 1.0, abs(input.lateral));
  let cap_falloff = 1.0 - smoothstep(0.04, 1.0, input.cap_amount);
  let alpha = clamp(params.opacity * params.intensity * params.transition * falloff * cap_falloff * pulse * 0.15, 0.0, 0.18);
  let glow_color = params.color * vec3f(0.38, 0.2, 0.12);
  return vec4f(glow_color * alpha, alpha);
}
