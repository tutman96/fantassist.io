struct Params { fog_opacity: f32 }

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var fog_mask: texture_2d<f32>;
@group(0) @binding(2) var texture_sampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, texture_sampler, uv, 0.0);
  let fog = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r * params.fog_opacity;
  return vec4f(base.rgb * (1.0 - fog), 1.0);
}
