# ADR 0010: V2 Effects Layers

## Status

Accepted.

This decision amends the sidecar-only schema rule in the v2 rebuild plan. Effects extend the shared scene protobuf. V1 data loss after a v1 save is an accepted compatibility boundary.

## Context

Fantassist v2 needs ordered, animated scene effects for weather, spells, hazards, and atmosphere. Effects must be rendered through the production vgpu pipeline in the editor, table output, headless renderer, and campaign thumbnail worker. React must not compose effect pixels or own effect state.

Effects participate in the existing bottom-to-top scene layer order. An asset or fog layer may appear above an effect and cover or modify it. An effect may also appear above fog or assets and composite over their current result.

The stable v1 codec recognizes only asset and fog layers. Its decoder skips unknown protobuf fields, and its compatibility normalization removes unsupported layers before re-encoding. Merely reading stored bytes does not change them, but a v1 scene save, import, or export may remove every effects layer. This loss is acceptable. The shared portions of the scene must remain readable and editable by v1 before and after that loss.

## Persistence Decision

Effects are stored in the scene protobuf as a third `Layer` variant. They are not stored in a v2 sidecar.

`Layer` field number 3 and `LayerType` value 2 remain reserved. The new wire allocation uses:

```proto
message Layer {
  reserved 3;

  oneof layerType {
    AssetLayer assetLayer = 1;
    FogLayer fogLayer = 2;
    EffectsLayer effectsLayer = 4;
  }

  enum LayerType {
    ASSETS = 0;
    FOG = 1;
    reserved 2;
    EFFECTS = 3;
  }
}
```

`EffectsLayer` follows the established layer field layout and owns an ordered effect collection:

```proto
message EffectsLayer {
  string id = 1;
  string name = 3;
  bool visible = 4;
  Layer.LayerType type = 5;
  repeated Effect effects = 6;
}

message Effect {
  oneof effectType {
    RainEffect rain = 1;
    EmbersEffect embers = 2;
  }
}

message RainEffect {
  string id = 1;
  string name = 2;
  bool visible = 3;
  repeated Vector2d vertices = 4;
  uint32 seed = 5;
  Color color = 6;
  double opacity = 7;
  double density = 8;
  double speed = 9;
  reserved 10;
  double dropSize = 11;
}

message EmbersEffect {
  string id = 1;
  string name = 2;
  bool visible = 3;
  repeated Vector2d vertices = 4;
  uint32 seed = 5;
  Color color = 6;
  double opacity = 7;
  double density = 8;
  double speed = 9;
  double particleSize = 10;
}
```

Every effect has a stable string ID. Effect identity must not depend on array index. The persisted model uses a discriminated effect variant rather than accepting arbitrary shader source, shader names, or untyped parameter maps. Each variant owns its geometry and validated parameters. Common authored properties include name, visibility, seed, speed, opacity, intensity, primary color, and optional secondary color.

Initial geometry families are:

- Polygon geometry for precipitation, clouds, swarms, darkness, and area hazards.
- Open path geometry with authored world width for walls, barriers, streams, and beams.
- Point geometry with an authored radius for portals, vortexes, auras, and localized bursts.
- Global geometry for scene-wide weather and ambience.

Concrete protobuf messages may share geometry messages, but each effect variant remains explicit in the engine. Adding a new effect requires a known codec mapping, validation policy, inspector, and shader implementation.

Geometry coordinates, path widths, point radii, and rain drop size are persisted in grid units. Opacity and normalized intensity use the inclusive range from zero to one. Persisted colors use 8-bit sRGB channels and are converted to linear color for rendering. Animation rates have effect-specific meanings: rain, barrier, and point animation use cycles per second, while cloud drift uses grid units per second. The editor presents feet using the existing five-feet-per-grid-unit convention where a world distance is useful.

The v2 codec decodes and encodes effects alongside asset and fog layers. The stable v1 generated codec remains frozen and must not be regenerated from the extended schema. A compatibility fixture must prove that the frozen v1 decoder can read the extended scene, preserve recognized asset and fog data, and produce a valid effects-free scene when it re-encodes the result.

V2 `.scene` and campaign exports include effects because they carry the complete extended scene protobuf. V1 may import these files and ignore their effects. A subsequent v1 export may omit effects. Initial effects are procedural and do not add media files to `SceneExport`; a future effect that references media must include those files through the existing export envelope.

## Engine Decision

The immutable scene document gains an explicit third layer variant:

```ts
interface EffectsSceneLayer extends SceneLayerBase {
  readonly type: "effects";
  readonly effects: readonly SceneEffect[];
}
```

`SceneEffect` is a discriminated union of supported effect variants. Every variant contains a stable ID, immutable grid-space geometry, authored parameters, and a stable random seed.

The engine owns:

- Effects-layer insertion, deletion, rename, visibility, and ordering.
- Effect insertion, deletion, visibility, selection, and parameter updates.
- Polygon, path, and point geometry editing.
- Replaceable previews for geometry movement and inspector scrubbing.
- Global undo and redo ordering across assets, fog, lights, walls, and effects.
- Validation of finite coordinates, minimum geometry, dimensions, ranges, IDs, and effect-specific parameters.

Selection uses stable layer and effect IDs. New effects must not repeat the index-based identity used by legacy fog polygons and lights.

Generic layer code must switch exhaustively across assets, fog, and effects. Existing binary assets-or-fog branches must be removed from scene freezing, insertion validation, deletion, persistence projection, UI rendering, and render-plan compilation. An effects layer must never fall through to fog serialization.

Effect animation is renderer state, not an engine mutation. Animation frames do not change the scene revision, create history entries, trigger persistence, or publish scene snapshots. Changes to authored geometry, parameters, visibility, or seed are normal committed engine mutations.

## Layer Composition

Persisted layer order is authoritative and remains bottom to top. The render plan emits an explicit operation for each visible layer:

```text
assets -> fog -> effects -> assets -> effects -> fog
```

Each effects operation composites into the current linear scene target at its exact position. Later layers operate on or cover that result normally.

This produces the following semantics:

- A fog layer above rain can obscure the rain.
- An asset layer above a cloud can cover the cloud.
- A wall of fire above fog remains visible over that fog.
- Magical darkness suppresses scene content already composed below it.
- Assets, fog, lighting, and effects above magical darkness remain visible according to their own composition.

Effects are not implemented as DOM, canvas, CSS, or final-screen overlays. Editor-only outlines, handles, and selection guides remain in the final editor overlay pass and are omitted from table output.

All effect color blending occurs in the existing `rgba16float` linear-light scene pipeline. Effect shaders use premultiplied alpha or an explicit additive mode selected by the effect implementation. Blend behavior is part of the effect type and is not a freely authored low-level pipeline setting.

## GPU Geometry And Shaders

Polygon fills reuse a renderer-owned concave tessellation utility generalized from fog geometry. Polygon boundaries and open paths use segment geometry with cumulative path distance. Finished path effects do not depend on implementation-defined wide line primitives. They use instanced conservative quads, shader extrusion, analytic edge antialiasing, and explicit joins or caps.

Animated particle effects use the reusable in-scope renderer library under `src/renderer/particles`. Its vgpu compute passes own current and target emission rates, fractional accumulation, monotonic emission sequence, parallel burst spawning, and a fixed particle ring in GPU storage. Particle records contain spawn time, lifetime, initialization seed, and allocation state. WGSL derives spawn position, projected motion, geometry, and opacity from each initialization seed and local renderer time. CPU responsibilities are setting target rate, advancing the local clock, and scheduling the compute dispatches. Cloud effects derive animation from procedural world-space fields. Additional stateful simulation is deferred until a concrete effect cannot be expressed with emitted records, deterministic shader initialization, or procedural fields.

Particle effect lifecycle is shared. Each supported kind registers a renderer definition containing its shader, blend mode, quality-scaled density limit, lifetime policy, live uniforms, editor guide palette, and optional per-particle spawn context. The executor owns allocation, prewarming, rate changes, retiming, transitions, ordered drawing, draining, and disposal once for all registered particle effects. Editor definitions similarly own defaults and inspector range metadata, while effect icons and engine polygon authoring use exhaustive kind-aware entry points. Adding a particle effect must extend these exhaustive registries instead of copying the Rain lifecycle.

Effect resources follow the existing renderer lifecycle:

- Tessellate and pack geometry outside the frame loop.
- Create and prewarm pipelines before replacing active resources.
- Retain geometry and buffers across animation frames.
- Update only frame-global or compact effect uniforms while animating.
- Rebuild affected effect resources after committed geometry or type changes.
- Destroy superseded resources only after prior GPU work settles.

Shaders must conservatively bound submitted geometry. A path shader runs only over its segment quads, a point effect runs only over its radius bounds, and a polygon effect runs only over its tessellated area. Fragment shaders must not loop across every scene effect or every path segment.

## Time And Scheduling

Seconds are the canonical renderer time unit. `SceneExecutor.render(timeSeconds)` passes time into effect uniforms. Browser, worker, and Node adapters use the same convention.

Editor and table output use independent local animation epochs. The scene channel transports committed effect definitions but does not transport frame time, animation phase, or per-frame particle state. A shader phase is derived from:

```text
local elapsed seconds * authored speed + stable seeded offset
```

The editor and table may therefore display different instantaneous rain drops, snowflakes, flames, or noise. They preserve the same authored geometry and appearance.

Effect insertion, removal, effect visibility, and effects-layer visibility use renderer-local transitions. Rain ramps its emission rate over 240 milliseconds. Existing drops retain their authored opacity envelope and finish their individual lifetime after emission stops. Removed effects and layers retain their prior GPU resources and layer-order position until the emitter reaches zero and its final particle expires, then release those resources. Restoring the same effect while particles drain raises its emission rate again and preserves the live particles. Initial scene hydration deterministically prewarms a steady-state particle population.

A scene ID change is a hard effects boundary. It bypasses removal transitions, disposes every emitter and particle context from the previous scene, and initializes only the new scene's effects before its first frame. Effect edits within one scene retain the normal ramp and drain behavior.

Emission density and fall speed are live emitter controls. Density changes ramp the target rate without replacing particle storage. Fall-speed changes retime every live particle around its current normalized phase, then apply the new lifetime to future records. This changes speed immediately without changing particle position or opacity at the update instant. The pool is allocated for the supported density range and slowest supported fall speed so ordinary inspector changes preserve live particles and the monotonic emission sequence.

The particle renderer library is independent of Fantassist scene and engine types. It exposes the particle storage buffer and accepts caller-provided compute shader sources while its WGSL record library supports effect-specific instanced draws. Focused `vgpu/node` library tests validate rate integration, ramps, bursts, seed uniqueness, emission timestamps, ring overflow, steady-state initialization, stop/drain/reactivation, and compute-to-render consumption before Fantassist integration tests exercise rain.

Browser renderers request continuous frames only while at least one visible animated effect contributes to the current profile. The scheduler pauses when its document is hidden and returns to on-demand rendering when no animated effects are visible. Resize, scene revisions, resource replacement, and animation ticks continue through one serialized frame drain so GPU submissions do not overlap incorrectly.

Campaign thumbnails render one deterministic poster frame at a fixed canonical time. Headless rendering accepts an explicit fixed time. Equal scene data, render profile, dimensions, seed, and time must produce equal pixels within the existing backend tolerance.

## Quality Profiles

Editor and table output share effect geometry, render-plan operations, shader implementations, and parameter semantics. Quality policy may differ:

| Policy | Editor | Table output |
| --- | --- | --- |
| Animation cadence | Capped at 30 FPS | Up to display refresh |
| Procedural detail | Reduced | Full |
| Noise octaves | Reduced | Full |
| Particle density | Reduced visual sample density | Authored density |
| Expensive effect field resolution | Half resolution where suitable | Full resolution where suitable |
| Geometry guides and handles | Enabled | Disabled |

Lower editor fidelity must not alter authored effect data. It is a render policy only. Quality settings belong in `RenderPlan` rather than being inferred from editor-grid visibility.

## Effect Semantics

The first effect system distinguishes visual composition from gameplay lighting and visibility:

- Alpha effects visually cover or tint lower scene content.
- Additive effects appear emissive but do not automatically illuminate fog or assets.
- Obscuring effects reduce visibility of lower scene content at their layer position.
- Gameplay light emission would enter direct and radiance-cascade lighting.
- Fog revealing would modify a fog layer's visibility calculation.
- Animated obstruction would modify wall visibility geometry.

Initial spell and weather effects are visual, alpha, additive, or obscuring operations. They do not become light sources or obstruction walls implicitly. Animated gameplay lighting, fog revelation, and obstruction are deferred because they would invalidate expensive lighting resources on every frame.

Magical darkness is an obscuring effect rather than a translucent black cloud. It suppresses lower scene color and lower composed light within its polygon. Layer order determines which later assets, fog layers, lights, and effects appear above it.

## Initial Effect Library

The first implementation establishes reusable shader families rather than one unrelated shader per named spell:

- Precipitation family: rain and snow within a polygon or across the full scene.
- Cloud family: smoke, poison cloud, ground mist, and insect swarm within a polygon.
- Barrier family: wall of fire, wall of force, and wall of ice along an open path.
- Obscuring family: magical darkness within a polygon.
- Point family: portal, vortex, aura, and ritual glyph within a radius.

Additional candidates include ash, leaves, sand, flower petals, spores, fireflies, webs, creeping vines, acid pools, lava, flowing water, ice fields, lightning barriers, electrical arcs, holy or necrotic auras, heat distortion, underwater caustics, dimensional tears, localized wind, dream distortion, gravity wells, and scene-wide lightning flashes.

Rain is viewed from above. Authored density maps to emissions per grid area per second. Every emission allocates one drop with a monotonic initialization seed. WGSL uses that seed to choose an independent ground-impact point, lifetime, perspective path, size, intensity, length, and width. A drop begins at low opacity at an outer point on the perspective ray, moves inward toward its own impact point, reaches the authored opacity during travel, then fades to zero. The next emission receives a new seed and path. Drops do not share a reset or global sideways fall angle.

Rain position advances linearly in grid space. The vanishing point is the midpoint of the physical table bounds after applying table origin, scale, display resolution, and display size. Editor camera pan and zoom do not change it. A rain-specific GPU context stores the current vanishing point beside each newly initialized package particle slot; existing particles retain their original point when the table configuration changes. Perspective travel is proportional to distance from that snapshotted point, so drops near the center have less apparent lateral movement over the same interval while retaining the same depth speed. Streak length represents motion blur and scales with the square root of each particle's recorded fall speed. The shader evaluates an anisotropic Gaussian in grid units: `dropSize` controls only cross-streak sigma, while fall speed controls the longer longitudinal sigma. Both axes contract toward the vanishing point to match their lower apparent camera motion. Center opacity falls to 7.5 percent of authored strength and reaches full strength over six grid units. Per-emission seed variation keeps width within 90 to 110 percent and opacity within 82 to 100 percent of authored values. Streak dimensions remain stable during one drop's lifetime. The opacity envelope completes at 88 percent of the path, leaving the final 12 percent invisible before the particle record expires.

Embers are also viewed from above. Their polygon is a source region: seeded particles spawn only inside it, then vertical lift toward the camera is represented by subtle growth while randomized planar convection and curl keep movement independent of screen north. Particles use additive warm-core and soft-halo composition, seeded size and flicker variation, and a smooth lifetime envelope. `density` is emissions per grid area per second, `speed` controls lift lifetime, and `particleSize` is authored in grid units. Embers are decorative emissive pixels and do not implicitly become scene lights.

## Performance And Caching

Static scenes retain on-demand rendering. Animated scenes must remain inside the existing total-frame budgets; effects do not receive a separate budget that permits the complete frame to exceed its target.

Because effects participate in layer order, an animated effect invalidates composition from its layer through the top of the stack. The initial correct implementation may replay the complete ordered scene each animation frame. Optimization then caches a static prefix before the earliest visible animated effects layer and replays only the affected suffix. It must not reorder effects or move them into a final overlay to gain performance.

The renderer must not allocate one full-resolution texture per effect or per layer. A reusable reduced-resolution effect target is allowed where profile policy and effect quality permit it. Any static-prefix checkpoint must be measured against the existing 4K memory budget before adoption.

Representative performance scenes must vary:

- Output resolution and device pixel ratio.
- Number and screen coverage of effect polygons.
- Number of path segments and point effects.
- Number of animated effects layers and the position of the earliest animated layer.
- Fog and lighting barriers above animated effects.
- Alpha and additive overdraw depth.
- Editor and output quality profiles.

## Delivery Sequence

1. Extend the protobuf, v2 codec, semantic fixtures, import/export path, and frozen-v1 lossy compatibility tests.
2. Add the effects-layer domain type and replace binary layer assumptions with exhaustive handling.
3. Add engine commands, stable-ID selection, previews, history, and layer-panel controls.
4. Generalize polygon and path geometry editing for effect ownership.
5. Make renderer time functional and add explicit effect quality and animation-demand policy.
6. Add ordered effects render operations and shared browser, worker, and Node shader loading.
7. Implement precipitation, cloud, barrier, darkness, and point shader families incrementally.
8. Add fixed-time pixel tests, ordering tests, scheduler tests, and representative 4K benchmarks.
9. Optimize static-prefix caching only after profiling identifies ordered scene replay as a limiting cost.

## Acceptance Criteria

- V2 protobuf round trips preserve all supported effects and their exact layer order.
- The frozen v1 decoder opens a v2 scene and preserves every recognized field.
- A frozen v1 decode and re-encode produces a valid scene with effects removed.
- V2 import, individual export, and campaign export preserve effects.
- Effect insertion, editing, deletion, visibility, ordering, undo, and redo are engine owned.
- Assets and fog above an effect produce observably different pixels from those below it.
- Hidden layers and hidden effects do not request animation frames or contribute pixels.
- Added, removed, shown, and hidden effects transition instead of changing intensity in one frame.
- Editor and output execute the same effect shaders under explicit quality policies.
- Editor and output clocks remain independent and are never synchronized per frame.
- Equal fixed-time headless renders are deterministic, and different times change animated effect pixels.
- Animation frames do not mutate the engine, advance the persisted scene version, or enter history.
- Static scenes remain idle after their requested render completes.
- Effect resources survive ordinary animation frames without geometry rebuilds or pipeline recreation.

## Consequences

- V2 effects are portable in v2-created `.scene` files and campaign exports.
- V1 can open the base scene because the protobuf extension is wire compatible.
- Any v1 save, import, or export may permanently delete effects from that scene or file.
- Layer-order semantics remain consistent across assets, fog, lighting, and effects.
- Animated effects require continuous GPU work only while visible.
- Effects below fog or assets may require replaying expensive upper layers each frame.
- Decorative emission does not silently increase light count or radiance-cascade cost.
- The shared scene schema is no longer globally frozen; stable v1 generated code remains frozen while v2 owns schema evolution and explicit compatibility tests.
