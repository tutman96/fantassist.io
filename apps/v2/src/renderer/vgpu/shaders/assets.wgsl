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

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var map_texture: texture_2d<f32>;
@group(0) @binding(2) var texture_sampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
  @location(2) @interpolate(flat) kind: u32,
}

@vertex fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let centers_grid = array<vec2f, 4>(
    vec2f(19.5, 11.5), vec2f(12.5, 12.0), vec2f(26.0, 12.4), vec2f(27.0, 6.5),
  );
  let sizes_grid = array<vec2f, 4>(
    vec2f(36.0, 18.0), vec2f(13.0, 8.5), vec2f(10.5, 5.8), vec2f(10.0, 4.0),
  );
  let tints = array<vec4f, 4>(
    vec4f(0.34, 0.55, 0.58, 1.0),
    vec4f(0.75, 0.12, 0.20, 0.82),
    vec4f(0.62, 0.34, 0.16, 0.96),
    vec4f(0.10, 0.72, 0.88, 1.0),
  );
  let corner = corners[vertex_index];
  let point_grid = centers_grid[instance_index] + (corner - 0.5) * sizes_grid[instance_index];
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  var output: VertexOutput;
  output.position = vec4f(
    point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0),
    0.0,
    1.0,
  );
  output.uv = corner;
  output.tint = tints[instance_index];
  output.kind = instance_index;
  return output;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let sampled = textureSampleLevel(map_texture, texture_sampler, input.uv * 5.0, 0.0).rgb;
  var color = sampled * input.tint.rgb;
  if (input.kind == 3u) {
    let wave = 0.55 + 0.45 * sin(input.uv.x * 31.0 + input.uv.y * 17.0 + params.time * 2.0);
    color = mix(vec3f(0.02, 0.18, 0.34), input.tint.rgb, wave);
  }
  return vec4f(color * input.tint.a, input.tint.a);
}
