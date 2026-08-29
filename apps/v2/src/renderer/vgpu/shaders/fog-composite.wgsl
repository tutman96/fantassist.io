struct Params { fog_opacity: f32 }

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var fog_mask: texture_2d<f32>;
@group(0) @binding(2) var texture_sampler: sampler;
@group(0) @binding(3) var light: texture_2d<f32>;
@group(0) @binding(4) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, texture_sampler, uv, 0.0);
  let fog = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r * params.fog_opacity;
  let illumination = textureSampleLevel(light, texture_sampler, uv, 0.0).rgb;
  return vec4f(base.rgb * (vec3f(1.0 - fog) + illumination), 1.0);
}
