@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(scene, texture_sampler, uv, 0.0);
}
