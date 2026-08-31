import { VgpuParticle, particle_alpha_envelope, particle_is_alive, particle_normalized_age, particle_random } from "../../src/renderer/particles/wgsl/particle-library.wgsl";

struct Params { time: f32, _padding: vec3f }
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) alpha: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<VgpuParticle>;
@group(0) @binding(1) var<uniform> params: Params;

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let particle = particles[instance];
  let age = particle_normalized_age(particle, params.time);
  let base = vec2f(
    particle_random(particle.initialization_seed, 0u) * 1.5 - 0.75,
    particle_random(particle.initialization_seed, 1u) * 1.5 - 0.75,
  );
  let center = base + vec2f(age * 0.35, age * 0.2);
  var output: VertexOutput;
  output.position = select(vec4f(2.0, 2.0, 0.0, 1.0), vec4f(center + corners[vertex] * 0.055, 0.0, 1.0), particle_is_alive(particle, params.time));
  output.alpha = select(0.0, particle_alpha_envelope(age, 0.25, 0.55, 1.0), particle_is_alive(particle, params.time));
  return output;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(vec3f(0.25, 0.7, 1.0) * input.alpha, input.alpha);
}
