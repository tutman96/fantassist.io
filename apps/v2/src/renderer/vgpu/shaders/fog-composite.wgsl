struct Params {
  fog_opacity: f32,
  has_lights: f32,
  target_size: vec2f,
  target_to_grid_offset: vec2f,
  pixels_per_grid: f32,
  radiance_target_size: vec2f,
  grid_to_radiance_offset: vec2f,
  radiance_pixels_per_grid: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var fog_mask: texture_2d<f32>;
@group(0) @binding(2) var texture_sampler: sampler;
@group(0) @binding(3) var light: texture_2d<f32>;
@group(0) @binding(4) var indirect_light: texture_2d<f32>;
@group(0) @binding(5) var fog_indirect_light: texture_2d<f32>;
@group(0) @binding(6) var radiance_sampler: sampler;
@group(0) @binding(7) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, texture_sampler, uv, 0.0);
  let fog_coverage = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r;
  let fog = fog_coverage * params.fog_opacity;
  let direct = textureSampleLevel(light, texture_sampler, uv, 0.0);
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let radiance_uv = (world * params.radiance_pixels_per_grid + params.grid_to_radiance_offset) / params.radiance_target_size;
  let inside_radiance = all(radiance_uv >= vec2f(0.0)) && all(radiance_uv <= vec2f(1.0));
  let sample_uv = clamp(radiance_uv, vec2f(0.0), vec2f(1.0));
  let indirect_sample = textureSampleLevel(indirect_light, radiance_sampler, sample_uv, 0.0).rgb;
  let fog_indirect_sample = textureSampleLevel(fog_indirect_light, radiance_sampler, sample_uv, 0.0).rgb;
  let inside_authored_fog = fog_coverage > 0.001;
  let indirect = select(vec3f(0.0), select(indirect_sample, fog_indirect_sample, inside_authored_fog), inside_radiance);
  let illumination = direct.rgb + indirect;
  let luminance = dot(base.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let ambient = mix(vec3f(luminance), base.rgb, 0.35) * 0.06;
  let incoming = ambient * (1.0 - fog) + base.rgb * illumination * 1.35;
  let illuminated_scene = vec3f(1.0) - exp(-incoming);
  let scene_without_lights = base.rgb * (1.0 - fog);
  return vec4f(mix(scene_without_lights, illuminated_scene, params.has_lights), 1.0);
}
