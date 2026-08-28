struct Params {
  target_size: vec2f,
  pixels_per_grid: f32,
  spread_grid: f32,
}

@group(0) @binding(0) var fog_mask: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

const weights = array<f32, 5>(1.0, 4.0, 6.0, 4.0, 1.0);

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let original = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r;
  let spread_pixels = params.spread_grid * params.pixels_per_grid;
  var blurred = 0.0;
  for (var y = 0u; y < 5u; y++) {
    for (var x = 0u; x < 5u; x++) {
      let offset = (vec2f(f32(x), f32(y)) - 2.0) * spread_pixels * 0.5;
      let nearby = textureSampleLevel(fog_mask, texture_sampler, uv + offset / params.target_size, 0.0).r;
      blurred += nearby * weights[x] * weights[y];
    }
  }
  let exterior_falloff = smoothstep(0.0, 0.5, blurred / 256.0);
  let coverage = max(original, exterior_falloff);
  return vec4f(coverage, coverage, coverage, 1.0);
}
