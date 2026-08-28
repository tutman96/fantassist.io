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

@vertex fn vs_main(
  @location(0) point_grid: vec2f,
  @location(1) corner: vec2f,
) -> VertexOutput {
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset + corner * 5.5;
  var output: VertexOutput;
  output.position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.corner = corner;
  return output;
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) corner: vec2f,
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let radius = length(input.corner);
  if (radius > 1.0 || radius < 0.54) { discard; }
  return params.color;
}
