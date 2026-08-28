# ADR 0005: V1-Compatible Persistence And Image Loading

## Status

Accepted for the first persisted-scene vertical slice.

## Context

Fantassist v1 stores campaigns, scenes, asset files, and display settings in separate LocalForage databases under the stable application origin. Scene values are protobuf bytes containing substantially more data than the initial v2 engine document. Saving a reduced v2 document directly would destroy videos, fog, lights, calibration, visibility, optional fields, and layer ordering.

## Decision

V2 opens the existing `campaign`, `scene_2`, `asset_file`, and `settings` LocalForage databases without changing their object stores or physical IndexedDB versions. It reproduces the `${database}_storage_changed` LocalStorage notification protocol after committed writes.

The frozen v1 protobuf schema has a v2-owned non-React codec. A loaded repository record retains the complete supported v1 scene. The adapter projects ordered layer summaries and supported image transforms into an immutable engine document. On save, it clones the complete v1 scene, patches image transforms by stable asset ID, advances the scene version exactly once, and re-encodes every other supported field unchanged.

Only committed engine revisions enter the serialized save queue. Selection, hover, camera movement, previews, and canceled interactions do not persist. Before each write, the repository rereads the stored scene and rejects a stale expected version. External v1 storage notifications reload a clean scene and produce a conflict state when local committed work has not been saved.

The editor scene provider owns catalog loading, active repository records, engine hydration, autosave status, conflict status, and the browser image loader. The scene selector consumes this provider rather than maintaining a second scene model. Display resolution and diagonal load from the existing global settings records; scene table offset, scale, and output-grid state load from the selected scene.

Stored image `File` values decode with `createImageBitmap`. The browser uploader creates a vgpu-owned `rgba8unorm-srgb` texture and uses raw `GPUQueue.copyExternalImageToTexture`, because vgpu does not wrap external-image uploads. Node and mock rendering use the same executor and shader with a deterministic RGBA byte upload. A missing, corrupt, or unsupported image falls back to the deterministic texture without corrupting scene data.

Scene changes and device recovery reacquire durable files and create new generation-owned image uploads. The output window owns a separate repository/image loader and reloads the media ID received in committed scene snapshots.

When no shared scene exists, the first direct-v2 image upload creates a local campaign, v1-compatible scene, asset layer, and file records before hydrating the engine. This makes the upload workflow testable and usable at the standalone v2 origin without requiring a v1 gateway or pre-seeded database.

Asset-layer creation is a typed, undoable engine command. New asset layers append at the top of the persisted layer order without separating or moving intervening fog layers. Each asset layer owns its upload action, and inserted images are ordered within that explicit target layer before the complete layer sequence is re-encoded.

## Consequences

- Existing v1 campaigns and scenes appear in the v2 selector on the same origin.
- V2 transform commits remain decodable and editable by v1.
- Unedited supported v1 fields survive v2 saves.
- Concurrent stale writes fail instead of silently overwriting a newer scene version.
- Real stored images render through WebGPU in both editor and output profiles.
- Supported images render as ordered draws inside one shared asset pass, reusing one compiled pipeline while retaining independent textures and transforms. Complete persisted fog compilation remains subsequent renderer work.
- V2 does not migrate, combine, rename, or upgrade existing browser databases.
- Files inserted by undoable commands remain in `asset_file` after undo so redo can restore them. Orphan collection is deferred until the referencing history entry expires.
