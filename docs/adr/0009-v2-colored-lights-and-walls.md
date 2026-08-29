# ADR 0009: V2 Colored Lights and Obstruction Walls

## Status

Accepted.

## Decision

Lights and obstruction walls remain ordered members of their owning v1 fog layer. Array index is their durable identity because the shared protobuf schema has no entity IDs. The v2 scene model projects and deeply freezes both collections, and the v1 adapter explicitly patches them while preserving unrelated legacy fields.

Lights store a grid-space position, bright and dim radii, and 8-bit RGBA color. The persisted alpha channel is interpreted as light energy rather than display opacity: it scales direct linear radiance before accumulation without changing hue, the authored dim-radius cutoff, or editor-guide visibility. Bright and Dim remain gameplay-facing measurements but calibrate one shared physical heuristic internally: Bright is the inverse-square reference distance, Dim is the finite gameplay cutoff with a narrow smooth extinction zone, and Energy scales the resulting radiance linearly. A conservative source radius is inferred from Bright distance for shadow softness. New lights default to 20 feet bright, 40 feet dim, and full-energy white, using the established five-feet-per-grid-unit UI conversion. Before placement, pointer hover creates a transient `light.insert` preview so color, attenuation, wall shadows, emitter, and radius rings are visible before a click commits one undoable insertion. Leaving the canvas or changing tools cancels that preview. The inspector previews radius and embedded HSL/energy changes continuously through one replaceable engine command and commits one history entry when manipulation ends. Light movement uses the same preview and optional grid-snap feedback conventions as other editor geometry.

Walls are visible or editor-only open polylines. Drawing, vertex editing, whole-wall translation, snapping, visibility, deletion, and history reuse the engine-owned polygon workflow. Two distinct points are sufficient. Hidden walls remain editor-visible but do not occlude output lighting.

Each visible fog-layer composition barrier owns a wall segment storage buffer and one additive, full-resolution `rgba16float` contribution per light. The light shader performs finite-segment ray intersection and radial attenuation entirely in WGSL. Direct walls are `1/32` grid unit capsules with rounded end caps; the complete physical width is opaque before the analytical penumbra begins. A small continuous source-area approximation produces a stable, continuous penumbra outside that core without discrete sampling bands. A layer with no lights preserves the exact ungraded scene path. When at least one light exists, the fog composite grades unlit artwork to a dark, reduced-saturation ambient baseline and adds only direct colored radiance against map albedo through a smooth exposure response. Direct light punches through fog within its physical falloff; fog blocks both ambient and direct light where no unobstructed light path exists. Unfogged artwork retains the ambient baseline outside direct illumination. Walls and lights affect only their containing fog layer. Editor-only wall guides, light emitters, radius rings, and selection diagnostics are GPU rendered and omitted from player output.

The renderer is intentionally direct-only. The experimental radiance-cascade bounce field and its CPU reachability mask were removed because their low-resolution transport and interpolation produced unstable artifacts around thin walls, corners, and camera changes. Fog composition therefore consumes only the stable full-resolution analytical direct-light target; there are no cascade, distance-field, light-coverage, reachability, or indirect-light resources and passes.

## Consequences

- Browser and headless output use the same shaders and ordered executor.
- Light property and movement previews update uniforms without rebuilding image resources or render pipelines.
- Wall topology changes rebuild only fog-layer geometry and storage resources.
- Direct lighting has no CPU reachability generation or low-resolution transport targets, so its output remains tied to the full-resolution scene projection.
- The initial per-pixel segment test is deterministic and simple, but dense 4K scenes must be benchmarked against segment extrusion before claiming heavy-scene performance.
