struct Params {
  viewport: vec2f,
  fog_opacity: f32,
  show_fog_edges: f32,
  show_grid: f32,
  show_walls: f32,
  show_lights: f32,
  time: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var fog_mask: texture_2d<f32>;
@group(0) @binding(2) var light: texture_2d<f32>;
@group(0) @binding(3) var shadow_map: texture_2d<f32>;
@group(0) @binding(4) var texture_sampler: sampler;
@group(0) @binding(5) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, texture_sampler, uv, 0.0).rgb;
  let fog_mask_value = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r;
  let fog = fog_mask_value * params.fog_opacity;
  let lighting = textureSampleLevel(light, texture_sampler, uv, 0.0).rgb;
  let lit_scene = base * (0.34 + lighting);
  let light_reveal = smoothstep(0.03, 0.18, max(max(lighting.r, lighting.g), lighting.b));
  let fog_coverage = fog * (1.0 - light_reveal);
  let wall = textureSampleLevel(shadow_map, texture_sampler, uv, 0.0).b * params.show_walls;
  let scene_with_fog = lit_scene * (1.0 - fog_coverage);
  let fog_edge = (1.0 - smoothstep(0.035, 0.075, abs(fog_mask_value - 0.5))) * params.show_fog_edges;
  var editor_scene = mix(scene_with_fog, vec3f(0.72, 0.28, 1.0), fog_edge * 0.9);
  let grid_position = uv * params.viewport / 48.0;
  let grid_distance = min(
    min(fract(grid_position.x), 1.0 - fract(grid_position.x)),
    min(fract(grid_position.y), 1.0 - fract(grid_position.y))
  ) * 48.0;
  let grid = (1.0 - smoothstep(0.6, 1.4, grid_distance)) * params.show_grid;
  editor_scene = mix(editor_scene, vec3f(0.18, 0.62, 0.78), grid * 0.28);
  editor_scene = mix(editor_scene, vec3f(0.05, 0.85, 1.0), wall * 0.9);

  let red_light = vec2f(0.28 + sin(params.time * 0.7) * 0.08, 0.40 + cos(params.time * 0.7) * 0.05);
  let blue_light = vec2f(0.72 + cos(params.time * 0.6) * 0.06, 0.62 + sin(params.time * 0.6) * 0.08);
  let red_distance = length((uv - red_light) * params.viewport);
  let blue_distance = length((uv - blue_light) * params.viewport);
  let red_ring = (1.0 - smoothstep(9.0, 11.0, red_distance)) * params.show_lights;
  let blue_ring = (1.0 - smoothstep(9.0, 11.0, blue_distance)) * params.show_lights;
  let red_core = (1.0 - smoothstep(3.0, 5.0, red_distance)) * params.show_lights;
  let blue_core = (1.0 - smoothstep(3.0, 5.0, blue_distance)) * params.show_lights;
  editor_scene = mix(editor_scene, vec3f(1.0, 0.12, 0.04), red_ring);
  editor_scene = mix(editor_scene, vec3f(0.08, 0.35, 1.0), blue_ring);
  editor_scene = mix(editor_scene, vec3f(1.0), max(red_core, blue_core));
  return vec4f(editor_scene, 1.0);
}
