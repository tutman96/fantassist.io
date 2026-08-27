---
name: fantassist-v2
description: Project-specific guidance for rebuilding and maintaining Fantassist, a browser-local tabletop map builder on the long-lived v2 branch. Use for any Fantassist feature, renderer, storage, protobuf, scene editor, table display, import/export, or migration work.
license: MIT
metadata:
  author: Fantassist
  version: "1.0.0"
---

# Fantassist v2

Fantassist is a client-heavy Next.js application for creating and presenting tabletop roleplay maps. The editor runs in a browser, stores data locally, and sends a scene to a second browser window or Presentation API display for use as a physical table display.

## Project Rules

- Work on the long-lived `v2` branch. Do not create additional feature branches unless explicitly requested.
- Ask before committing or opening a pull request.
- Preserve unrelated user changes in the working tree.
- Prefer small, direct changes over compatibility layers without a concrete need.
- Keep the app deployable to Vercel. There is no server database or required backend.
- Do not reintroduce tracker, Bluetooth, ArUco, camera, Go, C++, or marker-layer functionality. The tracker subsystem was intentionally removed.

## Stack

- Next.js 14 App Router
- React 18 and TypeScript
- Material UI for the interface
- `localforage` for IndexedDB-backed browser storage
- `protobufjs` and generated `ts-proto` files for scene/display messages
- Current renderer: Konva through `react-konva`
- Planned renderer: Vercel Labs `vgpu` / WebGPU
- Vercel deployment

The renderer should be treated as an implementation detail behind the scene model. Keep storage, scene mutation, import/export, and display transport independent from the rendering engine.

## Routes

- `/`: landing page
- `/campaigns`: chooses the last campaign, first campaign, or campaign creation
- `/campaigns/new`: creates a campaign
- `/campaigns/[campaignId]`: campaign scene list and campaign export
- `/campaigns/[campaignId]/scenes/[sceneId]`: current scene editor
- `/table`: external player/table display
- `/scenes/[campaignId]/[sceneId]`: legacy/stale scene route; do not copy its routing bug into new code

## Storage Contract

All persistent application data is browser-local. Storage names are compatibility boundaries and must not be renamed casually.

- `campaign`: JSON `{ id: string, name: string }` records, keyed by campaign ID
- `scene_2`: protobuf-encoded `Scene` bytes, keyed by `${campaignId}/${sceneId}`
- `asset_file`: `File` blobs, keyed by asset ID
- `settings`: JSON values keyed by settings names

`src/storage.ts` wraps LocalForage and broadcasts changes through a localStorage event key so multiple tabs can observe updates. Preserve this behavior when replacing the storage layer.

Settings currently include:

- `displayed_scene`
- `table_freeze`
- `table_resolution`
- `table_size`
- `last_campaign`
- `display_preference` (`window` or `presentationApi`)

Default table settings are 3840x2160 resolution and 45 inches diagonal. Table dimensions are derived from resolution aspect ratio and diagonal size; table units are inches.

## Scene Data Model

The canonical schema is `protos/scene.proto`; `src/protos/scene.ts` is generated and must be regenerated after schema changes.

`Scene` contains:

- `id`, `name`, and monotonically increasing `version`
- `TableOptions`: grid visibility, offset, rotation, and scale
- ordered `layers`

Supported layer types:

- `AssetLayer`: map of image/video assets
- `FogLayer`: fog polygons, fog-clear polygons, obstruction polygons, and light sources

Asset records contain:

- stable asset ID
- image/video type
- source pixel `size`
- editable `transform` (`x`, `y`, `rotation`, `width`, `height`)
- optional physical `calibration` (`xOffset`, `yOffset`, `ppiX`, `ppiY`)
- optional `snapToGrid`
- optional video `volume`

Fog records contain polygon vertices in scene units and light sources with position, bright/dim distances, and RGBA color. Polygons also have `visibleOnTable`, allowing editor-only construction geometry.

`SceneExport` embeds a scene plus every referenced asset file as `{ id, payload, mediaType }`. `.scene` files are the portable compatibility format; campaign export packages multiple `.scene` files in a tar archive.

## Compatibility Requirements

When implementing v2 or a new renderer:

- Continue reading existing `campaign`, `scene_2`, `asset_file`, and `settings` stores.
- Keep campaign IDs, scene IDs, asset IDs, layer IDs, and scene version semantics stable.
- Preserve layer order and all transform/table/fog fields when loading and saving.
- Preserve protobuf field numbers and existing enum meanings. Never renumber fields.
- Keep `.scene` import/export interoperable with the current app.
- Reuse asset IDs from imported scene references or apply a complete, consistent remap to both scene records and embedded files.
- Increment `Scene.version` for every persisted scene mutation that should reach the table display.
- Treat absent optional protobuf fields as valid old data and apply current defaults at the application boundary.
- Do not silently convert binary scene data to lossy JSON.

The tracker and marker layer were removed intentionally. Old tracker/marker data is not an active v2 feature and may be discarded when decoded and re-encoded under the reduced schema. Non-tracker scene data must remain round-trippable.

## Editor Behavior

The editor composes an active layer list with a canvas/stage. It supports:

- adding, deleting, renaming, hiding/showing, and reordering asset/fog layers
- uploading multiple image/video assets
- selecting, dragging, resizing, rotating, deleting, and grid-snapping assets
- physical asset calibration using a visual and numeric PPI editor
- adding and editing fog, fog-clear, and wall polygons
- adding, moving, deleting, and configuring colored lights
- table view reset, zoom, repositioning, resizing, and grid visibility
- video playback and per-video table audio mute/unmute

The table display renders the current scene read-only. It receives scene updates over a protobuf `Packet` transport and requests missing asset bytes from the editor.

## Display Transport

`src/external/` contains the generic display protocol and two supported channels:

- popup window via `postMessage`
- browser Presentation API

The transport messages that remain are hello, display scene, get asset, get table configuration, get current scene, and acknowledgements. Keep transport independent from the renderer so the editor and table display can migrate separately.

## WebGPU / vgpu Migration

The intended direction is to replace Konva with `vgpu` while retaining the scene and storage contracts. Prefer an explicit renderer adapter with clear boundaries:

- scene state and mutations remain ordinary TypeScript/domain code
- asset loading resolves browser `File` records into GPU textures/media resources
- editor interaction produces scene transform/polygon updates
- table rendering consumes an immutable/read-only scene snapshot
- fog and lighting should become explicit GPU passes/shaders rather than hidden scene-graph effects

WebGPU is browser-dependent. Keep initialization client-only, handle unavailable adapters deliberately, and avoid importing browser/GPU-only modules into server-rendered paths. Use `vgpu/mock` or pure domain tests for deterministic non-browser tests where practical.

## Verification

Use Node 24 or newer for this repository. The legacy application uses `canvas@3`, which supports the deployment runtime.

```bash
fnm use 24
npm install
npm run check
```

`npm run check` runs type checking, Node's built-in test runner, and the production build. The build currently emits existing React hook dependency warnings.

For schema changes, ensure the `protoc` binary is installed and run:

```bash
npm run gen-proto
```

After changes, inspect `git status`, `git diff --check`, and confirm no environment files or generated runtime state are staged.
