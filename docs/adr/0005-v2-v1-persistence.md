# ADR 0005: V1-Compatible Persistence And Image Loading

## Status

Accepted for the first persisted-scene vertical slice.

## Context

Fantassist v1 stores campaigns, scenes, asset files, and display settings in separate LocalForage databases under the stable application origin. Scene values are protobuf bytes containing substantially more data than the initial v2 engine document. Saving a reduced v2 document directly would destroy videos, fog, lights, calibration, visibility, optional fields, and layer ordering.

## Decision

V2 opens the existing `campaign`, `scene_2`, `asset_file`, and `settings` LocalForage databases without changing their object stores or physical IndexedDB versions. It reproduces the `${database}_storage_changed` LocalStorage notification protocol after committed writes.

The frozen v1 protobuf schema has a v2-owned non-React codec. A loaded repository record retains the complete supported v1 scene. The adapter projects ordered layer summaries and supported image transforms into an immutable engine document. On save, it clones the complete v1 scene, patches image transforms by stable asset ID, advances the scene version exactly once, and re-encodes every other supported field unchanged.

The codec also owns the exact v1 `SceneExport` envelope used by `.scene` files. Import preparation is non-React and write-free: it validates all referenced media first, assigns destination campaign IDs to the scene and assets, preserves scene contents and layer ordering, resolves destination name collisions, and returns repository-ready scene and file records. Blank scenes use the v1 table defaults and ordered Assets/Fog layers. Global setting writes continue to use the exact `settings` database and its v1 cross-tab notification key.

Only committed engine revisions enter the serialized save queue. Selection, hover, camera movement, previews, and canceled interactions do not persist. Before each write, the repository rereads the stored scene and rejects a stale expected version. External v1 storage notifications reload a clean scene and produce a conflict state when local committed work has not been saved.

The editor scene provider owns catalog loading, active repository records, engine hydration, autosave status, conflict status, and the browser image loader. The scene selector consumes this provider rather than maintaining a second scene model. Display resolution and diagonal load from the existing global settings records; scene table offset, scale, and output-grid state load from the selected scene.

Stored image `File` values decode with `createImageBitmap`. The browser uploader creates a vgpu-owned `rgba8unorm-srgb` texture and uses raw `GPUQueue.copyExternalImageToTexture`, because vgpu does not wrap external-image uploads. Node and mock rendering use the same executor and shader with a deterministic RGBA byte upload. A missing, corrupt, or unsupported image falls back to the deterministic texture without corrupting scene data.

Scene changes and device recovery reacquire durable files and create new generation-owned image uploads. The output window owns a separate repository/image loader and reloads the media ID received in committed scene snapshots.

Asset-set changes do not remount the canvas or recreate its GPU surface. The browser loader acquires replacement uploads, the existing executor creates and prewarms new texture draws, then atomically swaps its asset resource set after prior GPU work settles. Add, delete, undo, and redo therefore preserve the last presented frame until the replacement is ready.

The editor provider owns an explicit active campaign and persists it through the v1-compatible `last_campaign` setting. Campaign creation writes the unchanged `{ id, name }` record shape. Blank-scene creation and `.scene` import both hydrate the resulting record immediately; media uploads require an active persisted scene and remain scoped to an explicit asset layer.

The routed editor scene and player-displayed scene are deliberately separate. Navigating between scenes changes only the DM workspace. An explicit Display Scene action writes the exact v1 `displayed_scene` setting and publishes that committed snapshot; the scene selector marks the scene currently on the table. The named table window is opened once and subsequently focused rather than navigated for each scene.

The table route restores `displayed_scene`, its complete scene record, optional v2 metadata, media files, and physical display settings directly from shared storage before joining live channels. Editor channels announce current state when mounted and compare scene identity plus per-scene revision, allowing an already-open table to accept lower-version scenes with a different ID while rejecting stale same-scene messages. Navigating to a non-displayed editor scene does not publish it to the player window.

Asset-layer creation is a typed, undoable engine command. New asset layers append at the top of the persisted layer order without separating or moving intervening fog layers. Each asset layer owns its upload action, and inserted images are ordered within that explicit target layer before the complete layer sequence is re-encoded.

Layer visibility and layer reordering are typed, undoable commands written directly to the v1 layer fields and repeated-layer order. V1 has no per-asset visibility field, so asset visibility is optional v2 metadata stored by scene key in the separate `fantassist_v2` LocalForage database. Rendering and picking require both the asset and its containing layer to be visible. V1 remains able to open the scene but does not apply the optional per-asset sidecar.

Asset and layer deletion are typed, undoable commands. Deleting a layer removes its contained assets from the scene in one history entry; undo restores the exact layer index, asset order, selection-safe scene state, and media references. Empty scenes and scenes with no layers remain valid. Referenced files are retained while undo history can restore them, so physical asset garbage collection remains deferred.

## Consequences

- Existing v1 campaigns and scenes appear in the v2 selector on the same origin.
- V2 transform commits remain decodable and editable by v1.
- Unedited supported v1 fields survive v2 saves.
- Concurrent stale writes fail instead of silently overwriting a newer scene version.
- Real stored images render through WebGPU in both editor and output profiles.
- Supported images render as ordered draws inside one shared asset pass, reusing one compiled pipeline while retaining independent textures and transforms. Complete persisted fog compilation remains subsequent renderer work.
- V2 does not migrate, combine, rename, or upgrade existing browser databases.
- Files inserted by undoable commands remain in `asset_file` after undo so redo can restore them. Orphan collection is deferred until the referencing history entry expires.
