# ADR 0001: V2 Lighting Pipeline

## Status

Accepted for the renderer spike. Production scaling remains subject to scene-driven workload tests.

## Context

Fantassist v2 must render assets, fog, obstruction shadows, colored lights, and the final output entirely through WebGPU. Browser and headless rendering must use the same pass order and WGSL so CI can validate renderer output without Chromium.

Video texture upload is intentionally deferred because video is not a near-term product priority. The time-based display in the spike validates deterministic invalidation only; it is not evidence of browser video decoding or upload support.

## Decision

Use one immutable render plan for editor and output profiles:

1. Draw ordered, sampled map assets as premultiplied instanced quads into `rgba8unorm`.
2. Rasterize fog and clear regions into an `rgba8unorm` mask.
3. Calculate per-light obstruction visibility in WGSL and store it in an `rgba8unorm` shadow target.
4. Accumulate linear colored light into `rgba16float`.
5. Composite assets, fog, and lighting into an `rgba16float` linear target. Output fog is opaque black and reveals assets only in explicit clear regions or where unobstructed light reaches them; the editor profile keeps partial fog transparency for the GM.
6. Tone map and convert linear color to the display transfer function in the present pass.

The browser adapter owns the canvas surface, on-demand scheduling, resize handling, and complete device recreation after loss. The Node adapter owns an offscreen target and readback. Both call `createSceneExecutor` with the same render plan and shader set.

The technical-spike UI starts the on-demand renderer at a capped 30 FPS to demonstrate moving lights and shadows. Editor rendering can toggle a final-pass grid overlay, derives purple fog boundaries from the fog mask, overlays finite obstruction segments as cyan guides, and shows light emitters as colored points with white cores. Output rendering applies the same fog, lights, and obstructions but defaults the grid off and does not expose editor geometry to players.

The current shadow pass uses per-pixel segment intersection. It is simple and deterministic for the spike's small light/wall count. Before supporting dense scenes, compare it with extruded segment geometry using representative 4K workloads.

## Performance Budget

Initial hardware targets are:

- Typical 4K output: p95 completed-frame wall time at or below 16.7 ms after pipeline prewarming.
- Heavy 4K output: p95 completed-frame wall time at or below 33.3 ms.
- Static scenes: no continuous frame loop.
- Renderer-owned intermediate targets: approximately 28 bytes per physical pixel, plus 4 bytes per pixel for the supplied output target.

The CLI reports CPU wall-clock measurements around completed GPU work, not timestamp-query GPU durations. Hardware and software-adapter results must be recorded separately; deterministic software CI is a correctness gate, not a real-time performance gate.

The initial 3840x2160 run on the macOS Metal adapter completed 20 prewarmed frames with a 4.58 ms mean and 1.77 ms p95 CPU wall time. Readback took 11.63 ms; the intermediate targets and supplied output target used an estimated 265,420,800 bytes together. These numbers validate the small spike scene only; they are not evidence that the future heavy-scene budget is met.

## Consequences

- Headless renders produce PNG and JSON diagnostics from one explicit frame by default.
- `--performance` renders 20 prewarmed frames at 3840x2160 and records mean, p50, and p95 completion time.
- Linux CI installs Lavapipe, forces `VGPU_ADAPTER=software`, runs shader and orchestration checks, and uploads the headless artifacts.
- Device loss discards every device-owned resource and rebuilds the renderer instead of attempting partial reuse.
- Real browser video upload, decode cadence, and cleanup remain a named follow-up rather than a hidden assumption.
