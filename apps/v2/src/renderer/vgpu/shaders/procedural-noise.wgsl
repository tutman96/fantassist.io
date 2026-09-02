export fn procedural_hash_u32(input: u32) -> u32 {
  var value = input;
  value = (value ^ (value >> 16u)) * 0x7feb352du;
  value = (value ^ (value >> 15u)) * 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn procedural_gradient(cell: vec2i, seed: u32, channel: u32) -> vec2f {
  let mixed = (bitcast<u32>(cell.x) * 0x9e3779b9u) ^ (bitcast<u32>(cell.y) * 0x85ebca6bu) ^ seed ^ (channel * 0xc2b2ae35u);
  let gradients = array<vec2f, 8>(
    vec2f(1.0, 0.0), vec2f(-1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, -1.0),
    vec2f(0.7071, 0.7071), vec2f(-0.7071, 0.7071), vec2f(0.7071, -0.7071), vec2f(-0.7071, -0.7071),
  );
  return gradients[procedural_hash_u32(mixed) & 7u];
}

export fn procedural_gradient_noise(point: vec2f, seed: u32, channel: u32) -> f32 {
  let cell = vec2i(floor(point));
  let local = fract(point);
  let curve = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  let a = dot(procedural_gradient(cell, seed, channel), local);
  let b = dot(procedural_gradient(cell + vec2i(1, 0), seed, channel), local - vec2f(1.0, 0.0));
  let c = dot(procedural_gradient(cell + vec2i(0, 1), seed, channel), local - vec2f(0.0, 1.0));
  let d = dot(procedural_gradient(cell + vec2i(1, 1), seed, channel), local - vec2f(1.0, 1.0));
  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y) * 1.4142;
}

fn procedural_value(cell: vec2i, seed: u32, channel: u32) -> f32 {
  let mixed = (bitcast<u32>(cell.x) * 0x9e3779b9u) ^ (bitcast<u32>(cell.y) * 0x85ebca6bu) ^ seed ^ (channel * 0xc2b2ae35u);
  return f32(procedural_hash_u32(mixed)) / 4294967295.0;
}

export fn procedural_value_noise(point: vec2f, seed: u32, channel: u32) -> f32 {
  let cell = vec2i(floor(point));
  let local = fract(point);
  let curve = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  let a = procedural_value(cell, seed, channel);
  let b = procedural_value(cell + vec2i(1, 0), seed, channel);
  let c = procedural_value(cell + vec2i(0, 1), seed, channel);
  let d = procedural_value(cell + vec2i(1, 1), seed, channel);
  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

export fn procedural_fbm3(point: vec2f, seed: u32, channel: u32) -> f32 {
  let octave_1 = mat2x2f(1.62, -1.18, 1.18, 1.62) * point + vec2f(7.1, 13.7);
  let octave_2 = mat2x2f(1.34, 1.67, -1.67, 1.34) * octave_1 + vec2f(19.3, 3.8);
  return procedural_gradient_noise(point, seed, channel) * 0.55
    + procedural_gradient_noise(octave_1, seed, channel + 31u) * 0.28
    + procedural_gradient_noise(octave_2, seed, channel + 67u) * 0.17;
}

export fn procedural_value_fbm3(point: vec2f, seed: u32, channel: u32) -> f32 {
  let octave_1 = mat2x2f(1.62, -1.18, 1.18, 1.62) * point + vec2f(7.1, 13.7);
  let octave_2 = mat2x2f(1.34, 1.67, -1.67, 1.34) * octave_1 + vec2f(19.3, 3.8);
  return procedural_value_noise(point, seed, channel) * 0.55
    + procedural_value_noise(octave_1, seed, channel + 31u) * 0.28
    + procedural_value_noise(octave_2, seed, channel + 67u) * 0.17;
}
