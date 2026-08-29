import { rc_atlas_texel, rc_block_size, rc_ray_count } from "./rc-directions.wgsl";

@group(0) @binding(0) var cascade_tex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> field_size: vec2f;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let atlas_size = vec2f(textureDimensions(cascade_tex));
  let block = rc_block_size(0.0);
  let probe = clamp(floor(uv * field_size), vec2f(0.0), field_size - 1.0);
  let rays = rc_ray_count(0.0);
  var irradiance = vec3f(0.0);
  for (var ray = 0.0; ray < rays; ray = ray + 1.0) {
    irradiance += textureLoad(cascade_tex, vec2i(rc_atlas_texel(probe, ray, block)), 0).rgb;
  }
  return vec4f(irradiance / rays, 1.0);
}
