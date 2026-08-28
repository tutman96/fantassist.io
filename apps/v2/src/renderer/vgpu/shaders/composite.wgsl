struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
  show_editor: f32,
  show_grid: f32,
  asset_origin: vec2f,
  asset_size: vec2f,
  asset_rotation: f32,
  selected: f32,
  table_editing: f32,
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
  if (any(target_position < params.content_min) || any(target_position > params.content_max)) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let world = target_position / params.pixels_per_grid + params.target_to_grid_offset;
  var color = textureSampleLevel(scene, texture_sampler, uv, 0.0).rgb;
  let outside_table = select(0.0, 1.0, any(world < params.table_min) || any(world > params.table_max));
  color = mix(color, vec3f(0.018, 0.020, 0.045), outside_table * params.show_editor * 0.88);

  let grid_distance = min(
    min(fract(world.x), 1.0 - fract(world.x)),
    min(fract(world.y), 1.0 - fract(world.y))
  ) * params.pixels_per_grid;
  let grid = (1.0 - smoothstep(0.25, 0.75, grid_distance)) * params.show_grid;
  color = mix(color, vec3f(1.0) - clamp(color, vec3f(0.0), vec3f(1.0)), grid * mix(0.3, 0.12, params.show_editor));

  let table_edge_distance = min(
    min(abs(world.x - params.table_min.x), abs(world.x - params.table_max.x)),
    min(abs(world.y - params.table_min.y), abs(world.y - params.table_max.y))
  ) * params.pixels_per_grid;
  let near_table = select(0.0, 1.0,
    world.x >= params.table_min.x - 0.2 && world.x <= params.table_max.x + 0.2 &&
    world.y >= params.table_min.y - 0.2 && world.y <= params.table_max.y + 0.2
  );
  let table_edge = (1.0 - smoothstep(1.0, 2.2, table_edge_distance)) * near_table * params.table_editing;
  color = mix(color, vec3f(1.0, 0.76, 0.24), table_edge * 0.92);
  let table_handle_half = vec2f(6.0 / params.pixels_per_grid);
  var table_handle_distance = box_distance(world, params.table_min, table_handle_half);
  table_handle_distance = min(table_handle_distance, box_distance(world, vec2f(params.table_max.x, params.table_min.y), table_handle_half));
  table_handle_distance = min(table_handle_distance, box_distance(world, params.table_max, table_handle_half));
  table_handle_distance = min(table_handle_distance, box_distance(world, vec2f(params.table_min.x, params.table_max.y), table_handle_half));
  let table_outer = 1.0 - smoothstep(-0.5, 0.5, table_handle_distance * params.pixels_per_grid);
  let table_inner = 1.0 - smoothstep(-0.5, 0.5, (table_handle_distance + 2.75 / params.pixels_per_grid) * params.pixels_per_grid);
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
  let resize_inner = 1.0 - smoothstep(-0.5, 0.5, (resize_distance + 2.5 / params.pixels_per_grid) * params.pixels_per_grid);
  let resize_handles = resize_outer * (1.0 - resize_inner);
  let rotate_center = vec2f(0.0, -asset_half.y - 28.0 / params.pixels_per_grid);
  let rotate_distance = distance(asset_local, rotate_center) * params.pixels_per_grid;
  let rotate_outer = 1.0 - smoothstep(5.25, 6.25, rotate_distance);
  let rotate_inner = 1.0 - smoothstep(2.75, 3.75, rotate_distance);
  let rotate_handle = rotate_outer * (1.0 - rotate_inner);
  let stem_extent = select(0.0, 1.0, asset_local.y >= rotate_center.y && asset_local.y <= -asset_half.y);
  let rotate_stem = (1.0 - smoothstep(1.0, 2.0, abs(asset_local.x) * params.pixels_per_grid)) * stem_extent;
  color = mix(color, vec3f(0.008, 0.18, 0.72), max(selection_border, rotate_stem) * params.selected);
  color = mix(color, vec3f(0.02, 0.72, 2.8), max(resize_handles, rotate_handle) * params.selected);
  return vec4f(color, 1.0);
}
