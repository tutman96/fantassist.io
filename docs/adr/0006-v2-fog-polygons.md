# ADR 0006: V2 Fog And Clear Polygons

## Status

Accepted.

## Decision

V2 projects v1 fog and fog-clear polygons into immutable, engine-owned grid-space geometry. The domain model uses the correctly spelled `vertices`; the persistence adapter alone translates to and from the frozen v1 protobuf field `verticies`. Polygon array order remains the durable identity because the shared schema has no polygon IDs.

Conceal and clear polygons are edited through replaceable engine previews. Pointer movement updates the final draft segment continuously, clicks anchor vertices, double-click or Enter commits one history entry, and Escape or changing tools cancels without advancing the scene revision. Committed insert, update, remove, visibility, layer creation, and layer deletion operations participate in the shared undo history and autosave queue.

Polygon selection is also engine-owned. An unselected polygon requires an outline hit so broad fog coverage does not prevent selecting assets beneath it. Once selected, every vertex receives a screen-stable hollow GPU ring; dragging a ring reshapes one vertex, while dragging inside the selected polygon translates all vertices by the same grid-space delta. Conceal controls use magenta and clear controls use cyan. Both edit paths are replaceable previews and one undoable commit.

Activating either fog drawing tool ensures a fog layer exists and selects it. If the scene has no fog layer, the editor inserts one through the normal engine command and persistence path before drawing begins.

The renderer tessellates concave polygons in renderer-owned TypeScript and uploads triangle geometry to WebGPU. Fog polygons write coverage into a per-layer mask and clear polygons overwrite that coverage with zero. Each visible fog layer is a composition barrier in persisted layer order, so assets above a fog layer remain unobscured. Editor-only polygon guides are rendered through WebGPU and never appear in player output.

Polygons with `visibleOnTable: false` remain persisted and visible as editor guides but do not contribute to the fog mask. Existing v1 light sources and obstruction polygons remain unchanged by v2 saves but are not rendered or editable in this slice. The previous hard-coded demonstration lights, wall, and fog shapes are removed rather than mixed with persisted scene behavior.

## Consequences

- Shared `scene_2` protobuf records remain readable and editable by v1 without an IndexedDB migration.
- Fog broadcasts to the named table window as part of the committed scene document.
- Renderer targets that accumulate scene content must explicitly use load semantics (`clear: false`) because vgpu clears omitted pass options by default.
- Dynamic lights and obstruction walls require a later scene-driven renderer and editor decision.
