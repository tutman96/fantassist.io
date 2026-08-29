# ADR 0009: V2 Colored Lights and Obstruction Walls

## Status

Accepted.

## Decision

Lights and obstruction walls remain ordered members of their owning v1 fog layer. Array index is their durable identity because the shared protobuf schema has no entity IDs. The v2 scene model projects and deeply freezes both collections, and the v1 adapter explicitly patches them while preserving unrelated legacy fields.

Lights store a grid-space position, bright and dim radii, and 8-bit RGBA color. New lights default to 20 feet bright, 40 feet dim, and opaque white, using the established five-feet-per-grid-unit UI conversion. The inspector previews radius and embedded HSL/opacity changes continuously through one replaceable engine command and commits one history entry when manipulation ends. Light movement uses the same preview and optional grid-snap feedback conventions as other editor geometry.

Walls are visible or editor-only open polylines. Drawing, vertex editing, whole-wall translation, snapping, visibility, deletion, and history reuse the engine-owned polygon workflow. Two distinct points are sufficient. Hidden walls remain editor-visible but do not occlude output lighting.

Each visible fog-layer composition barrier owns a wall segment storage buffer and one additive `rgba16float` contribution per light. The light shader performs finite-segment ray intersection and radial attenuation entirely in WGSL. The fog composite multiplies scene color by clear coverage plus colored illumination, preserving the exact no-light path while allowing unobstructed lights to reveal and tint fogged artwork. Walls and lights affect only their containing fog layer. Editor-only wall guides, light emitters, radius rings, and selection diagnostics are GPU rendered and omitted from player output.

## Consequences

- Browser and headless output use the same shaders and ordered executor.
- Light property and movement previews update uniforms without rebuilding image resources or render pipelines.
- Wall topology changes rebuild only fog-layer geometry and storage resources.
- The initial per-pixel segment test is deterministic and simple, but dense 4K scenes must be benchmarked against segment extrusion before claiming heavy-scene performance.
