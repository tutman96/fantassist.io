struct Params { jump: vec4f }

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var seeds: texture_2d<f32>;

fn choose_seed(current: vec4f, candidate: vec4f, position: vec2f) -> vec4f {
  if (candidate.w < 0.5) { return current; }
  if (current.w < 0.5) { return candidate; }
  return select(current, candidate, distance(candidate.xy, position) < distance(current.xy, position));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(seeds));
  let pixel = clamp(vec2i(floor(uv * vec2f(size))), vec2i(0), size - 1);
  let position = vec2f(pixel) + 0.5;
  let jump = i32(params.jump.x);
  var best = textureLoad(seeds, pixel, 0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let neighbour = pixel + vec2i(x, y) * jump;
      if (all(neighbour >= vec2i(0)) && all(neighbour < size)) {
        best = choose_seed(best, textureLoad(seeds, neighbour, 0), position);
      }
    }
  }
  return best;
}
