@group(0) @binding(0) var linear_scene: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;

fn linear_to_display(value: vec3f) -> vec3f {
  let low = value * 12.92;
  let high = 1.055 * pow(max(value, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, value <= vec3f(0.0031308));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let linear = textureSampleLevel(linear_scene, texture_sampler, uv, 0.0).rgb;
  return vec4f(linear_to_display(clamp(linear, vec3f(0.0), vec3f(1.0))), 1.0);
}
