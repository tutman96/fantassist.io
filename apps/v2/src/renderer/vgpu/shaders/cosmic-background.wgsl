struct Params {
  target_size: vec2f,
  time: f32,
  intensity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453);
}

fn value_noise(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let blend = local * local * (3.0 - 2.0 * local);
  let low = mix(hash(cell), hash(cell + vec2f(1.0, 0.0)), blend.x);
  let high = mix(hash(cell + vec2f(0.0, 1.0)), hash(cell + vec2f(1.0, 1.0)), blend.x);
  return mix(low, high, blend.y);
}

fn fbm(point: vec2f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var sample_point = point;
  for (var octave = 0; octave < 4; octave += 1) {
    value += value_noise(sample_point) * amplitude;
    sample_point = sample_point * 2.03 + vec2f(8.1, 3.7);
    amplitude *= 0.5;
  }
  return value;
}

fn possibility_wisp(point_y: f32, main_y: f32, t: f32, enabled: f32, offset: f32, bend: f32) -> vec2f {
  let path = main_y + offset * t * t + sin(t * 3.14159) * bend;
  let fade = enabled * (1.0 - smoothstep(0.18, 1.0, t));
  let distance_to_path = abs(point_y - path);
  return vec2f(exp(-720.0 * distance_to_path), exp(-125.0 * distance_to_path)) * fade;
}

fn wisp_window(point_x: f32, start: f32, end: f32) -> f32 {
  let feather = (end - start) * 0.09;
  return smoothstep(start, start + feather, point_x) * (1.0 - smoothstep(end - feather, end, point_x));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.target_size.x / max(params.target_size.y, 1.0);
  let centered = (uv - 0.5) * vec2f(aspect, 1.0);
  let drift = vec2f(params.time * 0.022, -params.time * 0.011);
  let cloud = fbm(centered * 2.2 + drift + vec2f(4.0, 8.0));
  let filament = fbm(centered * 5.0 - drift * 1.7 + cloud * 1.4);
  let violet_center = vec2f(-0.28 * aspect + sin(params.time * 0.09) * 0.08, -0.12 + cos(params.time * 0.07) * 0.05);
  let blue_center = vec2f(0.34 * aspect + cos(params.time * 0.08) * 0.07, 0.18 + sin(params.time * 0.1) * 0.06);
  let violet = exp(-3.5 * distance(centered, violet_center)) * (0.42 + 0.72 * cloud);
  let blue = exp(-4.0 * distance(centered, blue_center)) * (0.38 + 0.78 * filament);
  let amber = exp(-12.0 * distance(centered, vec2f(0.03 * aspect, -0.32))) * cloud;
  let aurora_wave = sin(centered.x * 4.2 + cloud * 3.5 - params.time * 0.18) * 0.12;
  let aurora = exp(-24.0 * abs(centered.y + 0.08 - aurora_wave)) * (0.25 + 0.75 * filament);
  let fate_phase = centered.x * 5.2 - params.time * 0.11;
  let fate_slope = centered.x * 0.1;
  let fate_spread = 0.003 + 0.15 * smoothstep(0.0, 0.62 * aspect, abs(centered.x));
  let fate_path_a = fate_slope + sin(fate_phase + cloud * 0.9) * fate_spread;
  let fate_path_b = fate_slope + sin(fate_phase + 2.094 + cloud * 0.75) * fate_spread;
  let fate_path_c = fate_slope + sin(fate_phase + 4.188 + cloud * 0.65) * fate_spread;
  let fate_distance_a = abs(centered.y - fate_path_a);
  let fate_distance_b = abs(centered.y - fate_path_b);
  let fate_distance_c = abs(centered.y - fate_path_c);
  let fate_core = min(exp(-360.0 * fate_distance_a) + exp(-360.0 * fate_distance_b) + exp(-360.0 * fate_distance_c), 1.55);
  let fate_halo = min(exp(-58.0 * fate_distance_a) + exp(-58.0 * fate_distance_b) + exp(-58.0 * fate_distance_c), 1.8);
  let fate_pulse = 0.62 + 0.38 * sin(centered.x * 8.0 - params.time * 0.24 + filament * 2.0);
  let fate_envelope = 1.0 - smoothstep(0.42 * aspect, 0.78 * aspect, abs(centered.x));
  let fate_text_zone_x = 1.0 - smoothstep(0.25 * aspect, 0.46 * aspect, abs(centered.x));
  let fate_text_zone_y = 1.0 - smoothstep(0.16, 0.3, abs(centered.y));
  let fate_readability = 1.0 - 0.84 * fate_text_zone_x * fate_text_zone_y;
  let wisp_a_start = -0.58 * aspect;
  let wisp_a_end = -0.34 * aspect;
  let wisp_a_t = clamp((centered.x - wisp_a_start) / (wisp_a_end - wisp_a_start), 0.0, 1.0);
  let wisp_a = possibility_wisp(centered.y, fate_path_a, wisp_a_t, wisp_window(centered.x, wisp_a_start, wisp_a_end), -0.085, 0.012);
  let wisp_b_start = -0.42 * aspect;
  let wisp_b_end = -0.2 * aspect;
  let wisp_b_t = clamp((centered.x - wisp_b_start) / (wisp_b_end - wisp_b_start), 0.0, 1.0);
  let wisp_b = possibility_wisp(centered.y, fate_path_c, wisp_b_t, wisp_window(centered.x, wisp_b_start, wisp_b_end), 0.07, -0.01);
  let wisp_c_start = -0.12 * aspect;
  let wisp_c_end = 0.07 * aspect;
  let wisp_c_t = clamp((centered.x - wisp_c_start) / (wisp_c_end - wisp_c_start), 0.0, 1.0);
  let wisp_c = possibility_wisp(centered.y, fate_path_b, wisp_c_t, wisp_window(centered.x, wisp_c_start, wisp_c_end), -0.055, 0.008);
  let wisp_d_start = 0.16 * aspect;
  let wisp_d_end = 0.36 * aspect;
  let wisp_d_t = clamp((centered.x - wisp_d_start) / (wisp_d_end - wisp_d_start), 0.0, 1.0);
  let wisp_d = possibility_wisp(centered.y, fate_path_a, wisp_d_t, wisp_window(centered.x, wisp_d_start, wisp_d_end), 0.075, 0.009);
  let wisp_e_start = 0.32 * aspect;
  let wisp_e_end = 0.55 * aspect;
  let wisp_e_t = clamp((centered.x - wisp_e_start) / (wisp_e_end - wisp_e_start), 0.0, 1.0);
  let wisp_e = possibility_wisp(centered.y, fate_path_c, wisp_e_t, wisp_window(centered.x, wisp_e_start, wisp_e_end), -0.08, -0.011);
  let wisp_f_start = 0.48 * aspect;
  let wisp_f_end = 0.7 * aspect;
  let wisp_f_t = clamp((centered.x - wisp_f_start) / (wisp_f_end - wisp_f_start), 0.0, 1.0);
  let wisp_f = possibility_wisp(centered.y, fate_path_b, wisp_f_t, wisp_window(centered.x, wisp_f_start, wisp_f_end), 0.065, 0.009);
  let fate_wisps = wisp_a + wisp_b + wisp_c + wisp_d + wisp_e + wisp_f;
  let fate_wisp_core = fate_wisps.x;
  let fate_wisp_halo = fate_wisps.y;

  let star_grid = uv * vec2f(150.0 * aspect, 150.0);
  let star_cell = floor(star_grid);
  let star_position = vec2f(hash(star_cell), hash(star_cell + 17.0));
  let star_seed = hash(star_cell + 41.0);
  let star_shape = 1.0 - smoothstep(0.0, 0.055, distance(fract(star_grid), star_position));
  let twinkle_phase = 0.5 + 0.5 * sin(params.time * (0.1 + star_seed * 0.08) + star_seed * 19.0);
  let twinkle_fade = twinkle_phase * twinkle_phase * (3.0 - 2.0 * twinkle_phase);
  let twinkle = mix(0.12, 0.82, twinkle_fade);
  let stars = star_shape * step(0.925, star_seed) * twinkle;

  var color = vec3f(0.012, 0.018, 0.052);
  color += vec3f(0.27, 0.085, 0.48) * violet * params.intensity;
  color += vec3f(0.055, 0.23, 0.58) * blue * params.intensity;
  color += vec3f(0.46, 0.18, 0.035) * amber * params.intensity;
  color += vec3f(0.16, 0.11, 0.31) * pow(filament, 2.7) * params.intensity;
  color += vec3f(0.08, 0.32, 0.38) * aurora * params.intensity;
  color += vec3f(0.46, 0.25, 0.025) * fate_halo * fate_envelope * fate_readability * fate_pulse * params.intensity;
  color += vec3f(1.0, 0.82, 0.3) * fate_core * fate_envelope * fate_readability * (0.72 + 0.28 * fate_pulse) * params.intensity;
  color += vec3f(0.36, 0.2, 0.025) * fate_wisp_halo * fate_envelope * fate_readability * params.intensity;
  color += vec3f(0.92, 0.76, 0.3) * fate_wisp_core * fate_envelope * fate_readability * params.intensity;
  color += vec3f(0.58, 0.66, 0.9) * stars;
  let vignette = 1.0 - 0.42 * smoothstep(0.28, 0.92, length(centered));
  let dither = (hash(floor(uv * params.target_size)) - 0.5) / 255.0;
  return vec4f(max(color * vignette + dither, vec3f(0.0)), 1.0);
}
