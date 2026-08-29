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
@group(0) @binding(4) var light_coverage: texture_2d<f32>;
@group(0) @binding(5) var indirect_light: texture_2d<f32>;
@group(0) @binding(6) var indirect_reachability: texture_2d<f32>;
@group(0) @binding(7) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, texture_sampler, uv, 0.0);
  let fog = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r * params.fog_opacity;
  let direct = textureSampleLevel(light, texture_sampler, uv, 0.0);
  let coverage = clamp(textureSampleLevel(light_coverage, texture_sampler, uv, 0.0).r, 0.0, 1.0);
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let radiance_uv = (world * params.radiance_pixels_per_grid + params.grid_to_radiance_offset) / params.radiance_target_size;
  let inside_radiance = all(radiance_uv >= vec2f(0.0)) && all(radiance_uv <= vec2f(1.0));
  let indirect_sample = textureSampleLevel(indirect_light, texture_sampler, clamp(radiance_uv, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
  let reachability_size = vec2f(textureDimensions(indirect_reachability));
  let reachability_coord = vec2i(clamp(floor(radiance_uv * reachability_size), vec2f(0.0), reachability_size - 1.0));
  let reachable = textureLoad(indirect_reachability, reachability_coord, 0).r;
  let indirect = select(vec3f(0.0), indirect_sample, inside_radiance) * coverage * reachable;
  let illumination = direct.rgb + indirect;
  let luminance = dot(base.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let ambient = mix(vec3f(luminance), base.rgb, 0.35) * 0.06;
  let incoming = ambient * (1.0 - fog) + base.rgb * illumination * 1.35;
  let illuminated_scene = vec3f(1.0) - exp(-incoming);
  let scene_without_lights = base.rgb * (1.0 - fog);
  return vec4f(mix(scene_without_lights, illuminated_scene, params.has_lights), 1.0);
}
