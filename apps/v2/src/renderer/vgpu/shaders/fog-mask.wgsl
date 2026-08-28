@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let clear_region = 1.0 - smoothstep(0.20, 0.25, distance(uv, vec2f(0.43, 0.53)));
  let passage = (1.0 - smoothstep(0.045, 0.06, abs(uv.y - 0.53))) * step(uv.x, 0.43);
  let visibility = max(clear_region, passage);
  let fog = 1.0 - visibility;
  return vec4f(fog, fog, fog, 1.0);
}
