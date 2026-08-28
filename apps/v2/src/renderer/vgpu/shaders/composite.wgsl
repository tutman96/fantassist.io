struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
  fog_opacity: f32,
  show_fog_edges: f32,
  show_grid: f32,
  show_walls: f32,
  show_lights: f32,
  time: f32,
  asset_origin: vec2f,
  asset_size: vec2f,
  asset_rotation: f32,
  selected: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var fog_mask: texture_2d<f32>;
@group(0) @binding(2) var light: texture_2d<f32>;
@group(0) @binding(3) var shadow_map: texture_2d<f32>;
@group(0) @binding(4) var texture_sampler: sampler;
@group(0) @binding(5) var<uniform> params: Params;

fn box_distance(point: vec2f, center: vec2f, half_size: vec2f) -> f32 {
  let delta = abs(point - center) - half_size;
  return length(max(delta, vec2f(0.0))) + min(max(delta.x, delta.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let target_position = uv * params.target_size;
  if (any(target_position < params.content_min) || any(target_position > params.content_max)) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let world = target_position / params.pixels_per_grid + params.target_to_grid_offset;
  let base = textureSampleLevel(scene, texture_sampler, uv, 0.0).rgb;
  let fog_mask_value = textureSampleLevel(fog_mask, texture_sampler, uv, 0.0).r;
  let fog = fog_mask_value * params.fog_opacity;
  let lighting = textureSampleLevel(light, texture_sampler, uv, 0.0).rgb;
  let lit_scene = base * (0.34 + lighting);
  let light_reveal = smoothstep(0.03, 0.18, max(max(lighting.r, lighting.g), lighting.b));
  let fog_coverage = fog * (1.0 - light_reveal);
  let wall = textureSampleLevel(shadow_map, texture_sampler, uv, 0.0).b * params.show_walls;
  let scene_with_fog = lit_scene * (1.0 - fog_coverage);
  let outside_table = select(0.0, 1.0, any(world < params.table_min) || any(world > params.table_max));
  let editor_workspace = vec3f(0.018, 0.020, 0.045);
  let scene_on_workspace = mix(
    scene_with_fog,
    editor_workspace,
    outside_table * params.show_fog_edges * 0.88
  );
  let fog_edge = (1.0 - smoothstep(0.035, 0.075, abs(fog_mask_value - 0.5))) * params.show_fog_edges;
  var editor_scene = mix(scene_on_workspace, vec3f(0.65, 0.30, 0.82), fog_edge * 0.9);
  let grid_position = world;
  let grid_distance = min(
    min(fract(grid_position.x), 1.0 - fract(grid_position.x)),
    min(fract(grid_position.y), 1.0 - fract(grid_position.y))
  ) * params.pixels_per_grid;
  let grid = (1.0 - smoothstep(0.25, 0.75, grid_distance)) * params.show_grid;
  let difference_grid = vec3f(1.0) - clamp(editor_scene, vec3f(0.0), vec3f(1.0));
  let editor_grid_opacity = mix(0.16, 0.08, outside_table);
  let grid_opacity = mix(0.3, editor_grid_opacity, params.show_fog_edges);
  editor_scene = mix(editor_scene, difference_grid, grid * grid_opacity);
  editor_scene = mix(editor_scene, vec3f(0.72, 0.40, 0.88), wall * 0.9);

  let table_edge_distance = min(
    min(abs(world.x - params.table_min.x), abs(world.x - params.table_max.x)),
    min(abs(world.y - params.table_min.y), abs(world.y - params.table_max.y))
  ) * params.pixels_per_grid;
  let near_extent = select(0.0, 1.0,
    world.x >= params.table_min.x - 0.2 && world.x <= params.table_max.x + 0.2 &&
    world.y >= params.table_min.y - 0.2 && world.y <= params.table_max.y + 0.2
  );
  let dash = step(0.42, fract((world.x + world.y) * params.pixels_per_grid / 14.0));
  let table_edge = (1.0 - smoothstep(1.0, 2.2, table_edge_distance)) * near_extent * dash * params.show_fog_edges;
  editor_scene = mix(editor_scene, vec3f(1.0, 0.68, 0.25), table_edge);

  let red_light = vec2f(11.0 + sin(params.time * 0.7) * 3.0, 8.5 + cos(params.time * 0.7) * 1.5);
  let blue_light = vec2f(28.0 + cos(params.time * 0.6) * 2.4, 14.0 + sin(params.time * 0.6) * 2.0);
  let red_distance = distance(world, red_light) * params.pixels_per_grid;
  let blue_distance = distance(world, blue_light) * params.pixels_per_grid;
  let red_ring = (1.0 - smoothstep(9.0, 11.0, red_distance)) * params.show_lights;
  let blue_ring = (1.0 - smoothstep(9.0, 11.0, blue_distance)) * params.show_lights;
  let red_core = (1.0 - smoothstep(3.0, 5.0, red_distance)) * params.show_lights;
  let blue_core = (1.0 - smoothstep(3.0, 5.0, blue_distance)) * params.show_lights;
  editor_scene = mix(editor_scene, vec3f(1.0, 0.12, 0.04), red_ring);
  editor_scene = mix(editor_scene, vec3f(0.08, 0.35, 1.0), blue_ring);
  editor_scene = mix(editor_scene, vec3f(1.0), max(red_core, blue_core));

  let asset_center = params.asset_origin + params.asset_size * 0.5;
  let asset_delta = world - asset_center;
  let cosine = cos(params.asset_rotation);
  let sine = sin(params.asset_rotation);
  let asset_local = vec2f(
    asset_delta.x * cosine + asset_delta.y * sine,
    -asset_delta.x * sine + asset_delta.y * cosine
  );
  let asset_half = params.asset_size * 0.5;
  let absolute_local = abs(asset_local);
  let asset_edge_distance = min(
    abs(absolute_local.x - asset_half.x),
    abs(absolute_local.y - asset_half.y)
  ) * params.pixels_per_grid;
  let near_asset = select(0.0, 1.0,
    absolute_local.x <= asset_half.x + 2.5 / params.pixels_per_grid &&
    absolute_local.y <= asset_half.y + 2.5 / params.pixels_per_grid
  );
  let selection_border = (1.0 - smoothstep(1.25, 2.25, asset_edge_distance)) * near_asset;
  let handle_half = vec2f(5.5 / params.pixels_per_grid);
  var resize_distance = box_distance(asset_local, vec2f(-asset_half.x, -asset_half.y), handle_half);
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(0.0, -asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(asset_half.x, -asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(asset_half.x, 0.0), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(asset_half.x, asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(0.0, asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(-asset_half.x, asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(-asset_half.x, 0.0), handle_half));
  let resize_outer = 1.0 - smoothstep(-0.5, 0.5, resize_distance * params.pixels_per_grid);
  let resize_inner_distance = resize_distance + 2.5 / params.pixels_per_grid;
  let resize_inner = 1.0 - smoothstep(-0.5, 0.5, resize_inner_distance * params.pixels_per_grid);
  let resize_handles = resize_outer * (1.0 - resize_inner);
  let rotate_center = vec2f(0.0, -asset_half.y - 28.0 / params.pixels_per_grid);
  let rotate_distance = distance(asset_local, rotate_center) * params.pixels_per_grid;
  let rotate_outer = 1.0 - smoothstep(5.25, 6.25, rotate_distance);
  let rotate_inner = 1.0 - smoothstep(2.75, 3.75, rotate_distance);
  let rotate_handle = rotate_outer * (1.0 - rotate_inner);
  let stem_extent = select(0.0, 1.0,
    asset_local.y >= rotate_center.y && asset_local.y <= -asset_half.y
  );
  let rotate_stem = (1.0 - smoothstep(1.0, 2.0, abs(asset_local.x) * params.pixels_per_grid)) * stem_extent;
  let selection_edges = max(selection_border, rotate_stem) * params.selected;
  let selection_handles = max(resize_handles, rotate_handle) * params.selected;
  editor_scene = mix(editor_scene, vec3f(0.008, 0.18, 0.72), selection_edges);
  editor_scene = mix(editor_scene, vec3f(0.02, 0.72, 2.8), selection_handles);
  return vec4f(editor_scene, 1.0);
}
