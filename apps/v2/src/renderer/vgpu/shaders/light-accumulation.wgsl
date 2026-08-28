struct Params { time: f32 }

@group(0) @binding(0) var shadows: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let visibility = textureSampleLevel(shadows, texture_sampler, uv, 0.0).rg;
  let red_center = vec2f(0.28 + sin(params.time * 0.7) * 0.08, 0.40 + cos(params.time * 0.7) * 0.05);
  let blue_center = vec2f(0.72 + cos(params.time * 0.6) * 0.06, 0.62 + sin(params.time * 0.6) * 0.08);
  let red = pow(max(1.0 - distance(uv, red_center) / 0.43, 0.0), 2.0) * visibility.r;
  let blue = pow(max(1.0 - distance(uv, blue_center) / 0.48, 0.0), 2.0) * visibility.g;
  let accumulated = vec3f(1.0, 0.16, 0.06) * red * 1.8 + vec3f(0.05, 0.28, 1.0) * blue * 2.1;
  return vec4f(accumulated, 1.0);
}
