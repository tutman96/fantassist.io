struct Params {
  fog_opacity: f32,
  has_lights: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var fog_mask: texture_2d<f32>;
@group(0) @binding(2) var texture_sampler: sampler;
@group(0) @binding(3) var light: texture_2d<f32>;
@group(0) @binding(4) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, texture_sampler, uv, 0.0);
  let fog = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r * params.fog_opacity;
  let direct = textureSampleLevel(light, texture_sampler, uv, 0.0);
  let luminance = dot(base.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let ambient = mix(vec3f(luminance), base.rgb, 0.35) * 0.06;
  let incoming = ambient * (1.0 - fog) + base.rgb * direct.rgb * 1.35;
  let illuminated_scene = vec3f(1.0) - exp(-incoming);
  let scene_without_lights = base.rgb * (1.0 - fog);
  return vec4f(mix(scene_without_lights, illuminated_scene, params.has_lights), 1.0);
}
