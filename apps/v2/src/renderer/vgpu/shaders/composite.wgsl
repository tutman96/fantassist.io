struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
  target_pixels_per_css_pixel: f32,
  show_editor: f32,
  show_grid: f32,
  asset_origin: vec2f,
  asset_size: vec2f,
  asset_rotation: f32,
  selected: f32,
  table_editing: f32,
  interaction_point: vec2f,
  snap_point: vec2f,
  interaction_active: f32,
  interaction_clear: f32,
  interaction_wall: f32,
  snap_active: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

fn box_distance(point: vec2f, center: vec2f, half_size: vec2f) -> f32 {
  let delta = abs(point - center) - half_size;
  return length(max(delta, vec2f(0.0))) + min(max(delta.x, delta.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let target_position = uv * params.target_size;
  let css_scale = params.target_pixels_per_css_pixel;
  if (any(target_position < params.content_min) || any(target_position > params.content_max)) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let world = target_position / params.pixels_per_grid + params.target_to_grid_offset;
  var color = textureSampleLevel(scene, texture_sampler, uv, 0.0).rgb;
  let outside_table = select(0.0, 1.0, any(world < params.table_min) || any(world > params.table_max));
  color = mix(color, vec3f(0.010, 0.012, 0.028), outside_table * params.show_editor * 0.92);

  let grid_distance = min(
    min(fract(world.x), 1.0 - fract(world.x)),
    min(fract(world.y), 1.0 - fract(world.y))
  ) * params.pixels_per_grid;
  let grid = (1.0 - smoothstep(0.25 * css_scale, 0.75 * css_scale, grid_distance)) * params.show_grid * mix(1.0, 0.05, outside_table * params.show_editor);
  color = mix(color, vec3f(1.0) - clamp(color, vec3f(0.0), vec3f(1.0)), grid * mix(0.3, 0.12, params.show_editor));

  let table_edge_distance = min(
    min(abs(world.x - params.table_min.x), abs(world.x - params.table_max.x)),
    min(abs(world.y - params.table_min.y), abs(world.y - params.table_max.y))
  ) * params.pixels_per_grid;
  let near_table = select(0.0, 1.0,
    world.x >= params.table_min.x - 0.2 && world.x <= params.table_max.x + 0.2 &&
    world.y >= params.table_min.y - 0.2 && world.y <= params.table_max.y + 0.2
  );
  let table_dash = step(0.42, fract((world.x + world.y) * params.pixels_per_grid / (14.0 * css_scale)));
  let table_context_edge = (1.0 - smoothstep(1.0 * css_scale, 2.2 * css_scale, table_edge_distance)) * near_table * table_dash * params.show_editor * (1.0 - params.table_editing);
  color = mix(color, vec3f(1.0, 0.68, 0.25), table_context_edge);
  let table_edge = (1.0 - smoothstep(1.0 * css_scale, 2.2 * css_scale, table_edge_distance)) * near_table * params.table_editing;
  color = mix(color, vec3f(1.0, 0.76, 0.24), table_edge * 0.92);
  let table_handle_half = vec2f(6.0 * css_scale / params.pixels_per_grid);
  var table_handle_distance = box_distance(world, params.table_min, table_handle_half);
  table_handle_distance = min(table_handle_distance, box_distance(world, vec2f(params.table_max.x, params.table_min.y), table_handle_half));
  table_handle_distance = min(table_handle_distance, box_distance(world, params.table_max, table_handle_half));
  table_handle_distance = min(table_handle_distance, box_distance(world, vec2f(params.table_min.x, params.table_max.y), table_handle_half));
  let table_outer = 1.0 - smoothstep(-0.5, 0.5, table_handle_distance * params.pixels_per_grid);
  let table_inner = 1.0 - smoothstep(-0.5, 0.5, (table_handle_distance + 2.75 * css_scale / params.pixels_per_grid) * params.pixels_per_grid);
  color = mix(color, vec3f(1.4, 0.72, 0.08), table_outer * (1.0 - table_inner) * params.table_editing);

  let asset_center = params.asset_origin + params.asset_size * 0.5;
  let asset_delta = world - asset_center;
  let cosine = cos(params.asset_rotation);
  let sine = sin(params.asset_rotation);
  let asset_local = vec2f(asset_delta.x * cosine + asset_delta.y * sine, -asset_delta.x * sine + asset_delta.y * cosine);
  let asset_half = params.asset_size * 0.5;
  let absolute_local = abs(asset_local);
  let asset_edge_distance = min(abs(absolute_local.x - asset_half.x), abs(absolute_local.y - asset_half.y)) * params.pixels_per_grid;
  let near_asset = select(0.0, 1.0,
    absolute_local.x <= asset_half.x + 2.5 * css_scale / params.pixels_per_grid &&
    absolute_local.y <= asset_half.y + 2.5 * css_scale / params.pixels_per_grid
  );
  let selection_border = (1.0 - smoothstep(1.25 * css_scale, 2.25 * css_scale, asset_edge_distance)) * near_asset;
  let handle_half = vec2f(5.5 * css_scale / params.pixels_per_grid);
  var resize_distance = box_distance(asset_local, vec2f(-asset_half.x, -asset_half.y), handle_half);
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(0.0, -asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(asset_half.x, -asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(asset_half.x, 0.0), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(asset_half.x, asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(0.0, asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(-asset_half.x, asset_half.y), handle_half));
  resize_distance = min(resize_distance, box_distance(asset_local, vec2f(-asset_half.x, 0.0), handle_half));
  let resize_outer = 1.0 - smoothstep(-0.5, 0.5, resize_distance * params.pixels_per_grid);
  let resize_inner = 1.0 - smoothstep(-0.5, 0.5, (resize_distance + 2.5 * css_scale / params.pixels_per_grid) * params.pixels_per_grid);
  let resize_handles = resize_outer * (1.0 - resize_inner);
  let rotate_center = vec2f(0.0, -asset_half.y - 28.0 * css_scale / params.pixels_per_grid);
  let rotate_distance = distance(asset_local, rotate_center) * params.pixels_per_grid;
  let rotate_outer = 1.0 - smoothstep(5.25 * css_scale, 6.25 * css_scale, rotate_distance);
  let rotate_inner = 1.0 - smoothstep(2.75 * css_scale, 3.75 * css_scale, rotate_distance);
  let rotate_handle = rotate_outer * (1.0 - rotate_inner);
  let stem_extent = select(0.0, 1.0, asset_local.y >= rotate_center.y && asset_local.y <= -asset_half.y);
  let rotate_stem = (1.0 - smoothstep(1.0 * css_scale, 2.0 * css_scale, abs(asset_local.x) * params.pixels_per_grid)) * stem_extent;
  color = mix(color, vec3f(0.008, 0.18, 0.72), max(selection_border, rotate_stem) * params.selected);
  color = mix(color, vec3f(0.03, 0.28, 2.8), max(resize_handles, rotate_handle) * params.selected);
  let interaction_distance = distance(world, params.interaction_point) * params.pixels_per_grid;
  let interaction_ring = (1.0 - smoothstep(5.5 * css_scale, 6.5 * css_scale, interaction_distance)) * smoothstep(2.75 * css_scale, 3.75 * css_scale, interaction_distance);
  let fog_interaction_color = mix(vec3f(0.82, 0.2, 0.95), vec3f(0.12, 0.68, 1.0), params.interaction_clear);
  let interaction_color = mix(fog_interaction_color, vec3f(1.4, 0.72, 0.08), params.interaction_wall);
  color = mix(color, interaction_color, interaction_ring * params.interaction_active);
  let snap_delta = abs(world - params.snap_point) * params.pixels_per_grid;
  let snap_extent = 11.0 * css_scale;
  let snap_cross = max(
    (1.0 - smoothstep(0.5 * css_scale, 1.5 * css_scale, snap_delta.x)) * (1.0 - step(snap_extent, snap_delta.y)),
    (1.0 - smoothstep(0.5 * css_scale, 1.5 * css_scale, snap_delta.y)) * (1.0 - step(snap_extent, snap_delta.x))
  );
  let snap_distance = length(snap_delta);
  let snap_ring = (1.0 - smoothstep(9.0 * css_scale, 10.0 * css_scale, snap_distance)) * smoothstep(7.0 * css_scale, 8.0 * css_scale, snap_distance);
  color = mix(color, vec3f(1.4, 0.72, 0.08), max(snap_cross, snap_ring) * params.snap_active);
  return vec4f(color, 1.0);
}
