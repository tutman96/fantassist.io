# ADR 0006: V2 Fog And Clear Polygons

## Status

Accepted.

## Decision

V2 projects v1 fog and fog-clear polygons into immutable, engine-owned grid-space geometry. The domain model uses the correctly spelled `vertices`; the persistence adapter alone translates to and from the frozen v1 protobuf field `verticies`. Polygon array order remains the durable identity because the shared schema has no polygon IDs.

Conceal and clear polygons are edited through replaceable engine previews. Pointer movement updates the final draft segment continuously, clicks anchor vertices, double-click or Enter commits one history entry, and Escape or changing tools cancels without advancing the scene revision. Committed insert, update, remove, visibility, layer creation, and layer deletion operations participate in the shared undo history and autosave queue.

Polygon selection is also engine-owned. An unselected polygon requires an outline hit so broad fog coverage does not prevent selecting assets beneath it. Once selected, every vertex receives a screen-stable hollow GPU ring; dragging a ring reshapes one vertex, while dragging inside the selected polygon translates all vertices by one grid-space delta. While the scene grid is visible, newly drawn points and individually dragged vertices snap to intersections within `0.10` grid units. Whole-polygon translation tests every moved vertex, chooses the closest eligible intersection, and applies that vertex's snap delta to every point without distorting the polygon. Pre-placement hover, drawing, and vertex-drag previews always expose a GPU cursor ring, including before the first point is placed. An active snap adds the same gold intersection ring and cross used by calibrated asset snapping, while the underlying fog cursor retains its magenta conceal or cyan clear color. Both edit paths are replaceable previews and one undoable commit.

Activating either fog drawing tool ensures a fog layer exists and selects it. If the scene has no fog layer, the editor inserts one through the normal engine command and persistence path before drawing begins.

The renderer tessellates concave polygons in renderer-owned TypeScript and uploads triangle geometry to WebGPU. Fog polygons write coverage into a per-layer mask and clear polygons overwrite that coverage with zero. Each visible fog layer is a composition barrier in persisted layer order, so assets above a fog layer remain unobscured. Editor-only polygon guides are rendered through WebGPU and never appear in player output.

Sampled sRGB assets are decoded by their `rgba8unorm-srgb` textures, composed in linear `rgba16float` targets, and converted directly back to the sRGB display transfer function. The present pass does not tone-map ordinary scene color while no HDR lighting contribution exists; doing so would mute source artwork. Any future HDR lighting implementation must introduce an explicit exposure and tone-mapping policy with color-preservation coverage.

Asset composition, fog masks, and editor overlays render into native 4x multisampled targets that resolve into ordinary sampleable textures between passes. The final display conversion remains single-sampled because it consumes already-resolved scene color. This anti-aliases geometric edges without filtering or blurring source image interiors.

Resolved fog masks receive a `1/16` grid Gaussian feather before composition. The normalized Gaussian's exterior half is remapped to full edge coverage and then clamped against the original mask, so the transition begins continuously at opaque fog and falls outward without weakening established coverage. Clear polygons receive the inverse visual effect naturally because surrounding fog feathers inward around the clear boundary without weakening the fog itself.

Polygons with `visibleOnTable: false` remain persisted and visible as editor guides but do not contribute to the fog mask. Scene-driven light sources and obstruction walls are projected and edited as members of their persisted fog layer; their renderer and interaction decisions are recorded in ADR 0009. The previous hard-coded demonstration lights, wall, and fog shapes remain removed.

## Consequences

- Shared `scene_2` protobuf records remain readable and editable by v1 without an IndexedDB migration.
- Fog broadcasts to the named table window as part of the committed scene document.
- Renderer targets that accumulate scene content must explicitly use load semantics (`clear: false`) because vgpu clears omitted pass options by default.
- Dense-light performance beyond the initial scene-driven GPU path requires representative 4K benchmarking.
