struct Params {
  viewport: vec2f,
  editor: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.viewport.x / max(params.viewport.y, 1.0);
  let world = vec2f((uv.x - 0.5) * aspect, uv.y - 0.5) * 18.0;
  let minor = min(abs(fract(world.x) - 0.5), abs(fract(world.y) - 0.5));
  let majorWorld = world / 5.0;
  let major = min(abs(fract(majorWorld.x) - 0.5), abs(fract(majorWorld.y) - 0.5));
  let minorLine = 1.0 - smoothstep(0.47, 0.5, minor);
  let majorLine = 1.0 - smoothstep(0.46, 0.5, major);

  let center = uv - vec2f(0.5);
  let glow = exp(-dot(center, center) * 5.0);
  let edge = smoothstep(0.9, 0.15, length(center));

  let deepSpace = vec3f(0.025, 0.055, 0.095);
  let stellarBlue = vec3f(0.03, 0.32, 0.78);
  let nebula = vec3f(0.56, 0.08, 0.68);
  var color = deepSpace + stellarBlue * glow * 0.22 + nebula * glow * glow * 0.1;
  color += vec3f(0.12, 0.35, 0.58) * minorLine * 0.14 * params.editor;
  color += vec3f(0.25, 0.62, 0.95) * majorLine * 0.22 * params.editor;
  color *= 0.55 + edge * 0.45;

  return vec4f(color, 1.0);
}
