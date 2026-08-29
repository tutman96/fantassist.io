export fn radiance_sdf_uv(pixel: vec2f, size: vec2f) -> vec2f {
  let half_texel = 0.5 / size;
  return clamp(pixel / size, half_texel, vec2f(1.0) - half_texel);
}

export fn radiance_sphere_trace(
  sdf_tex: texture_2d<f32>,
  sdf_samp: sampler,
  emitter_tex: texture_2d<f32>,
  emitter_samp: sampler,
  size: vec2f,
  origin: vec2f,
  direction: vec2f,
  t_start: f32,
  t_end: f32,
) -> vec4f {
  var t = t_start;
  var accumulated = vec3f(0.0);
  for (var step = 0; step < 16; step = step + 1) {
    let point = origin + direction * t;
    if (point.x < -1.0 || point.y < -1.0 || point.x > size.x + 1.0 || point.y > size.y + 1.0) {
      break;
    }
    let uv = radiance_sdf_uv(point, size);
    let sdf = textureSampleLevel(sdf_tex, sdf_samp, uv, 0.0);
    let distance_px = sdf.r;
    let emitter = textureSampleLevel(emitter_tex, emitter_samp, uv, 0.0);
    if (distance_px <= 0.6) {
      let wall_emitter = textureSampleLevel(emitter_tex, emitter_samp, sdf.gb, 0.0);
      let angle = ((wall_emitter.a - 0.01) / 0.98) * 6.283185307179586 - 3.141592653589793;
      let lit_normal = vec2f(cos(angle), sin(angle));
      let reflected = max(dot(lit_normal, -direction), 0.0);
      return vec4f(accumulated + wall_emitter.rgb * reflected, 0.0);
    }
    let march = max(distance_px, 0.35);
    let floor_weight = 1.0 - smoothstep(0.001, 0.01, emitter.a);
    accumulated += emitter.rgb * floor_weight * min(march, 4.0);
    t += march;
    if (t > t_end) { break; }
  }
  return vec4f(accumulated, 1.0);
}
