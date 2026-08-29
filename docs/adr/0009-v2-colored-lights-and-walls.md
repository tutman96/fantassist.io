# ADR 0009: V2 Colored Lights and Obstruction Walls

## Status

Accepted.

## Decision

Lights and obstruction walls remain ordered members of their owning v1 fog layer. Array index is their durable identity because the shared protobuf schema has no entity IDs. The v2 scene model projects and deeply freezes both collections, and the v1 adapter explicitly patches them while preserving unrelated legacy fields.

Lights store a grid-space position, bright and dim radii, and 8-bit RGBA color. The persisted alpha channel is interpreted as light energy rather than display opacity: it scales linear radiance without changing hue, the authored dim-radius cutoff, or editor-guide visibility. Bright and Dim remain gameplay-facing measurements but calibrate one shared physical heuristic internally: Bright is the inverse-square reference distance, Dim is the finite gameplay cutoff with a narrow smooth extinction zone, and Energy scales the resulting radiance linearly. New lights default to 20 feet bright, 40 feet dim, and full-energy white, using the established five-feet-per-grid-unit UI conversion. Before placement, pointer hover creates a transient `light.insert` preview so color, attenuation, wall shadows, bounce, emitter, and radius rings are visible before a click commits one undoable insertion. Leaving the canvas or changing tools cancels that preview. The inspector previews radius and embedded HSL/energy changes continuously through one replaceable engine command and commits one history entry when manipulation ends. Light movement uses the same preview and optional grid-snap feedback conventions as other editor geometry.

Walls are visible or editor-only open polylines. Drawing, vertex editing, whole-wall translation, snapping, visibility, deletion, and history reuse the engine-owned polygon workflow. Two distinct points are sufficient. Hidden walls remain editor-visible but do not occlude output lighting.

Each visible fog-layer composition barrier owns packed wall and light storage buffers, one additive full-resolution direct contribution per light, and a reduced-resolution radiance-cascade field. Direct visibility, physical attenuation, cascade interval termination, diffuse wall response, and final bounce-path validation are evaluated entirely in WGSL. Walls are mathematical line segments with no physical width or capsule penumbra. A ray crossing a segment is fully blocked; a diffuse contribution is accepted only when exact light-to-wall and wall-to-receiver paths remain on the reflective side of that segment. Output uses four receiver samples and the editor uses two. Their narrow half-pixel footprint antialiases direct shadow edges without adding source lights, widening wall geometry, or creating a broad quantized visibility band.

The cascade chain follows the vgpu radiance-cascade atlas layout: five or six geometric interval levels are merged from far to near through visibility alpha, then cascade zero resolves to irradiance. The latency-oriented editor field runs at one eighth of output width and height; player output runs at one half. Wall-hit radiance uses a 1.4 diffuse gain. Each light runs an independent cascade and exact bounce-path authorization before its color is additively accumulated. Reachability is therefore never shared between lights, and there is no CPU reachability matrix, shadow polygon, intensity calculation, or lighting texture upload. The field is anchored to output/table space so editor camera movement does not move its probe lattice. Resolve uses a center-weighted five-tap spatial filter. Every tap requires an exact same-light bounce path and is rejected when a wall separates it from the receiver; dividing by the complete kernel weight makes indirect light fade as valid paths disappear around corners instead of switching at one receiver threshold. Nearest sampling at final composition avoids a second unconstrained interpolation across adjacent field texels.

A layer with no lights preserves the exact ungraded scene path. With lights present, the fog composite grades unlit artwork to a dark, reduced-saturation ambient baseline and combines full-resolution direct light with cascade bounce against map albedo through a smooth exposure response. The cascade resolve emits unrestricted and per-light radius-clipped radiance in one GPU pass. Inside an authored fog polygon, the clipped result fades over a narrow inner band and is exactly zero at and beyond that light's Dim radius. Outside authored fog, unrestricted cascade bounce may continue beyond that radius. Walls and lights affect only their containing fog layer. Editor-only wall guides, light emitters, radius rings, and selection diagnostics are GPU rendered and omitted from player output.

## Consequences

- Browser and headless output use the same shaders and ordered executor.
- Light property and movement previews update GPU buffers and uniforms without rebuilding image resources or render pipelines.
- Wall topology changes rebuild only fog-layer geometry and storage resources.
- Lighting has no CPU reachability or visibility generation; the CPU only packs authored lights and wall segments into storage buffers.
- Direct lights rasterize only a GPU-generated square around their Dim radius; fragments outside that conservative bound are never launched.
- Resolved cascade fields are cached per fog layer. Editor camera movement reuses them; lights, walls, table/output projection, target size, and quality changes invalidate them.
- Independent per-light cascades prevent cross-color authorization but make transport cost scale with light count. Dense 4K scenes must be benchmarked by lights and segments before claiming heavy-scene performance.
