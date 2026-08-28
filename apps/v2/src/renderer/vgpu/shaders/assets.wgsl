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
  asset_origin: vec2f,
  asset_size: vec2f,
  asset_rotation: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var map_texture: texture_2d<f32>;
@group(0) @binding(2) var texture_sampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
}

@vertex fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let corner = corners[vertex_index];
  let local = (corner - 0.5) * params.asset_size;
  let cosine = cos(params.asset_rotation);
  let sine = sin(params.asset_rotation);
  let rotated = vec2f(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
  let point_grid = params.asset_origin + params.asset_size * 0.5 + rotated;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  var output: VertexOutput;
  output.position = vec4f(
    point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0),
    0.0,
    1.0,
  );
  output.uv = corner;
  output.tint = vec4f(0.34, 0.55, 0.58, 1.0);
  return output;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let sampled = textureSampleLevel(map_texture, texture_sampler, input.uv * 5.0, 0.0).rgb;
  let color = sampled * input.tint.rgb;
  return vec4f(color * input.tint.a, input.tint.a);
}
