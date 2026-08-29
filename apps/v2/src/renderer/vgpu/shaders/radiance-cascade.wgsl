import { rc_atlas_decode, rc_atlas_texel, rc_block_size } from "./rc-directions.wgsl";
import { rc_direction, rc_probe_origin, rc_probe_spacing, rc_ray_count } from "./rc-directions.wgsl";
import { radiance_sphere_trace } from "./radiance-sdf-sample.wgsl";

fn interval_start(cascade: f32) -> f32 {
  return 2.0 * (pow(4.0, cascade) - 1.0) / 3.0;
}

fn interval_end(cascade: f32) -> f32 {
  return interval_start(cascade) + 2.04 * pow(4.0, cascade);
}

struct Params { state: vec4f }

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var sdf_tex: texture_2d<f32>;
@group(0) @binding(2) var sdf_sampler: sampler;
@group(0) @binding(3) var emitter_tex: texture_2d<f32>;
@group(0) @binding(4) var emitter_sampler: sampler;
@group(0) @binding(5) var upper_tex: texture_2d<f32>;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let atlas_size = vec2f(textureDimensions(upper_tex));
  let scene_size = vec2f(textureDimensions(sdf_tex));
  let cascade = params.state.x;
  let block = rc_block_size(cascade);
  let decoded = rc_atlas_decode(floor(uv * atlas_size), block);
  let origin = rc_probe_origin(decoded.xy, rc_probe_spacing(cascade));
  var radiance = radiance_sphere_trace(
    sdf_tex, sdf_sampler, emitter_tex, emitter_sampler, scene_size, origin,
    rc_direction(decoded.z, rc_ray_count(cascade)), interval_start(cascade), interval_end(cascade),
  );
  if (params.state.y > 0.5) {
    let upper_block = block * 2.0;
    let upper_spacing = rc_probe_spacing(cascade) * 2.0;
    let upper_grid = atlas_size / upper_block;
    let position = origin / upper_spacing - 0.5;
    let base = floor(position);
    let fraction = clamp(position - base, vec2f(0.0), vec2f(1.0));
    let weights = vec4f(
      (1.0 - fraction.x) * (1.0 - fraction.y), fraction.x * (1.0 - fraction.y),
      (1.0 - fraction.x) * fraction.y, fraction.x * fraction.y,
    );
    var far = vec4f(0.0);
    for (var branch = 0; branch < 4; branch++) {
      let upper_direction = decoded.z * 4.0 + f32(branch);
      var interpolated = vec4f(0.0);
      for (var corner = 0; corner < 4; corner++) {
        let offset = vec2f(f32(corner % 2), f32(corner / 2));
        let probe = clamp(base + offset, vec2f(0.0), upper_grid - 1.0);
        let coord = rc_atlas_texel(probe, upper_direction, upper_block);
        interpolated += weights[corner] * textureLoad(upper_tex, vec2i(coord), 0);
      }
      far += interpolated * 0.25;
    }
    radiance = vec4f(radiance.rgb + radiance.a * far.rgb, radiance.a * far.a);
  }
  return radiance;
}
