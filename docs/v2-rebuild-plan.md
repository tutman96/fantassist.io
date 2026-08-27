# Fantassist v2 Rebuild Plan

## Status

This document is the working plan for rebuilding Fantassist around a standalone scene engine, a WebGPU renderer powered by Vercel Labs `vgpu`, and a shadcn-based interface.

It is intentionally expected to change as technical spikes answer the open questions recorded below.

Current implementation progress:

- Node.js 24 runtime and package-manager requirements are declared.
- The legacy app builds on Node 24 with `canvas@3.2.3`.
- Removed marker protobuf values are reserved.
- A frozen v1 schema and representative non-tracker scene fixture exist.
- Bidirectional scene and `.scene` export compatibility tests run with Node's built-in test runner.
- Legacy marker layers are discarded safely at the v1 compatibility boundary.

## Goals

- Replace Konva with a renderer built on `vgpu` and WebGPU.
- Perform all fog, dynamic lighting, shadowing, and final scene composition in GPU shaders and render passes.
- Treat the editor and table output as distinct render profiles with intentionally different visuals and frame scheduling.
- Render the active table output exclusively through WebGPU, with no React, DOM, SVG, CSS, or Canvas 2D scene composition.
- Move scene state, editing operations, interaction previews, and history out of React and into a proper scene engine.
- Continue using Next.js to provide routing, application lifecycle, deployment, and the React interface.
- Replace Material UI with an application-owned shadcn design system.
- Keep v1 and v2 scene storage compatible so users can switch between versions.
- Keep both versions deployable through Vercel.
- Keep v2 installable as a desktop PWA and progressively enhance table-window placement with modern browser APIs.
- Render complete scenes without a browser through a deterministic headless test harness built on `vgpu/node`.
- Make the architecture easy for coding agents to understand, test, maintain, and extend.

## Non-Goals

- Reintroducing the tracker, Bluetooth, ArUco, camera, Go, C++, or marker-layer functionality.
- Adding a remote database or requiring a backend for normal use.
- Preserving the current React component architecture.
- Preserving Konva as a fallback renderer.
- Maintaining compatibility with removed tracker or marker data.
- Shipping new map-building features before the existing feature set is stable on the new architecture.

## Core Constraints

### Browser Storage Is Origin-Scoped

IndexedDB access is restricted to an exact origin: scheme, hostname, and port. URL paths do not participate in the origin.

| URLs | Shared IndexedDB |
| --- | --- |
| `https://app.fantassist.io/v1` and `/v2` | Yes |
| `https://app.fantassist.io` and `https://v2.app.fantassist.io` | No |
| Production and a Vercel preview URL | No |
| The same custom-domain URL pointed at a different deployment | Yes |
| The same hostname on different ports | No |

V1 and v2 must therefore remain on the same permanent browser origin to share live data. CORS, `document.domain`, and cross-origin iframes do not provide access to another origin's IndexedDB.

### The V1 Scene Format Is Frozen

The existing protobuf schema and LocalForage storage configuration are compatibility boundaries. V2 may have a richer internal engine model, but shared scene records must remain representable by v1.

V1 protobuf readers ignore unknown fields but may discard them when a scene is saved. V2 must not depend on new protobuf fields surviving a v1 edit. Any future v2-only information must live in an optional sidecar store and must not be required to render or edit the shared v1 scene.

Removed marker field numbers and enum values must be marked `reserved` before future schema evolution so they cannot be reused accidentally.

### WebGPU Support Is Deliberate

`vgpu` has no WebGL fallback. V2 must define its supported browser policy and provide a clear unsupported-browser experience. Maintaining a second rendering engine is out of scope unless a concrete requirement emerges.

### Node 24 Is The Deployment Baseline

Both the maintained v1 deployment and the new v2 application must run on Node.js 24 or newer. The runtime must be declared in repository configuration and in Vercel rather than relying on a developer's default Node version.

The legacy `canvas@2.11.2` dependency did not install under Node 24. The initial deployment baseline upgrades it to `canvas@3.2.3`, which has been verified with a Node 24 production build. A later architecture may remove the server-side native dependency by ensuring browser-only renderer modules never enter the server build.

## Architecture

```text
Next.js routes and shadcn UI
              |
              | commands and selectors
              v
         Scene Engine
          |        |
          |        | immutable render snapshots
          |        v
          |    vgpu Renderer
          |        |
          |        v
          |      WebGPU
          |
          | persistence snapshots
          v
  V1 Compatibility Adapter
          |
          v
 Existing IndexedDB Stores
```

The primary ownership rule is:

> Only the scene engine mutates scene state.

React may own temporary interface state such as an open dialog, sidebar visibility, inspector expansion, and unsubmitted form text. React must not own or mutate scenes, layer order, asset transforms, fog geometry, light state, editor selection, or rendering resources.

The renderer receives snapshots from the engine and owns all GPU resources. The persistence adapter receives committed engine revisions and owns all IndexedDB access.

## Proposed Source Layout

```text
src/
  app/                       Next.js routes and application lifecycle
  components/
    ui/                      Application-owned shadcn primitives
  features/
    campaigns/               React feature composition
    editor/
    settings/
  engine/
    scene-engine.ts
    commands/
    history/
    input/
    selectors/
    validation/
  renderer/
    renderer.ts
    render-plan.ts
    resources/
    passes/
      assets.ts
      fog-mask.ts
      light-accumulation.ts
      fog-composite.ts
      editor-overlay.ts
      picking.ts
      present.ts
    shaders/
  render-harness/
    render-scene.ts
    asset-providers/
    cli.ts
  persistence/
    v1-schema/
    indexeddb/
    import-export/
  transport/
    window/
    presentation/
  generated/
    protobuf/
```

### Dependency Direction

```text
app/features -> engine interfaces
app/features -> renderer lifecycle interfaces
engine       -> domain types
renderer     -> immutable engine snapshots
persistence  -> domain types and committed revisions
transport    -> serialized scene snapshots and revisions
```

The engine, renderer, persistence, transport core, and headless render harness must not import React. Generated protobuf files must remain isolated and must never be hand-edited.

The browser renderer and headless harness must invoke the same render-plan compiler, render passes, resource abstractions, and WGSL modules. Headless rendering is not permitted to become a second implementation of the scene renderer.

## Storage Compatibility

### Existing Stores

| Store | Existing format | Key |
| --- | --- | --- |
| `campaign` | JSON `{ id, name }` | Campaign ID |
| `scene_2` | Protobuf-encoded `Scene` bytes | `${campaignId}/${sceneId}` |
| `asset_file` | Browser `File` object | Asset ID |
| `settings` | JSON values | Setting name |

V2 must open the same LocalForage databases with the same names, drivers, store names, keys, and value formats. Avoid an IndexedDB version upgrade while v1 switching remains supported.

### Compatibility Rules

- Preserve campaign, scene, layer, and asset IDs.
- Preserve scene key construction.
- Preserve ordered layer semantics.
- Preserve all table, transform, calibration, fog, wall, light, visibility, snap, and volume fields.
- Preserve existing protobuf field numbers and enum meanings.
- Continue incrementing `Scene.version` for committed changes that must reach the table display.
- Treat missing optional fields as valid old data.
- Apply defaults at the engine or adapter boundary without rewriting unrelated data.
- Keep `.scene` imports and exports interoperable with v1.
- Keep campaign tar exports composed of valid individual `.scene` files.
- Never convert the shared binary scene representation to lossy JSON.
- Do not edit the same scene concurrently in v1 and v2.

### Compatibility Test Fixtures

Capture fixtures using the current v1 implementation before replacing it:

- Blank scene
- Multiple ordered layers
- Calibrated image asset
- Rotated and grid-snapped assets
- Video asset with volume
- Multiple fog polygons
- Fog-clear polygons
- Light obstruction walls
- Multiple colored lights
- Hidden layers and editor-only polygons
- A complete `.scene` export with embedded media
- A campaign tar containing multiple scenes

Each fixture must pass this round trip:

```text
v1 encode -> v2 decode -> v2 encode -> frozen v1 decode -> semantic comparison
```

Add a browser test that opens v1 and v2 under the same test origin and verifies both versions observe the same LocalForage records.

## Scene Engine

### Responsibilities

The scene engine owns:

- The canonical shared scene document
- Ordered layers and entity indexes
- Active selection and editing tool
- Editor camera and viewport
- Interaction previews
- Command validation
- Scene revision and saved revision
- Undo and redo history
- Persistence state and errors
- Renderer invalidation metadata

### External Interface

The engine exposes commands and immutable selector snapshots rather than mutable protobuf objects.

```ts
interface SceneEngine {
  getSnapshot(): SceneView
  subscribe(listener: () => void): () => void
  dispatch(command: SceneCommand): CommandResult
  beginPreview(command: PreviewCommand): PreviewToken
  updatePreview(token: PreviewToken, command: PreviewCommand): void
  commitPreview(token: PreviewToken): CommandResult
  cancelPreview(token: PreviewToken): void
  undo(): CommandResult
  redo(): CommandResult
}
```

React bindings use `useSyncExternalStore` with focused selectors. The React context contains only a stable engine handle.

### Commands

Every mutation is a typed, serializable command. Initial commands include:

| Area | Commands |
| --- | --- |
| Scene | `scene.rename`, `scene.table.update` |
| Layers | `layer.insert`, `layer.remove`, `layer.move`, `layer.rename`, `layer.visibility` |
| Assets | `asset.insert`, `asset.remove`, `asset.transform`, `asset.calibration`, `asset.snap`, `asset.volume` |
| Fog | `fog.polygon.insert`, `fog.polygon.update`, `fog.polygon.remove` |
| Lights | `light.insert`, `light.update`, `light.move`, `light.remove` |
| Session | `selection.set`, `tool.set`, `viewport.update` |

Committed commands include enough metadata for validation, persistence, history, synchronization, and diagnostics:

```text
command ID
scene ID
base revision
transaction ID
command version
payload
```

The command registry maps every command type to its validator, reducer, inverse builder, persistence effect, synchronization behavior, and renderer invalidation flags.

### Interaction Previews

Drag, resize, rotate, polygon drawing, viewport movement, and property scrubbing use preview transactions:

1. Pointer down starts a preview.
2. Pointer movement replaces transient preview values.
3. The renderer draws committed state plus the active preview.
4. Pointer up commits one command and creates one history entry.
5. Escape cancels the preview.

Preview updates are not persisted and do not increment the committed scene version.

### Undo And Redo

Every committed command produces an inverse receipt. Undo applies the inverse through the normal command pipeline so renderer invalidation, persistence, and table synchronization behave identically to a normal edit.

Continuous edits are coalesced into one transaction. Asset files referenced by undo history cannot be garbage-collected until the history entry expires.

## vgpu Renderer

### Responsibilities

The renderer owns:

- `vgpu` and WebGPU initialization
- Canvas surfaces and offscreen render targets
- Shader modules and render pipelines
- Image and video textures
- Geometry, instance, uniform, and storage buffers
- Render-plan compilation
- Frame scheduling
- Resource caching and disposal
- Device-loss recovery
- Editor picking
- Pixel-level diagnostics

The renderer does not access IndexedDB directly. It requests media from an asset provider interface.

### Render Plan

Scene layers compile into an explicit ordered render plan. Fog layers remain composition barriers so asset layers cannot be batched across them.

```text
Acquire or update media textures
Build instance and geometry buffers

For each ordered layer:
  Asset layer -> Asset Raster Pass
  Fog layer   -> Fog Mask Pass
                 Light Accumulation Pass
                 Fog Composite Pass

Editor only:
  Editor Overlay Pass
  Picking Pass when requested

Final Color Pass
Present Pass
```

The renderer should render on demand when idle. Continuous frames are enabled only while video, animation, or an active preview requires them.

### Editor And Output Profiles

The editor and table output are two profiles of the same renderer, not separate rendering implementations.

| Concern | Editor profile | Output profile |
| --- | --- | --- |
| Engine | Authoritative editable engine | Read-only mirrored engine |
| Scene rendering | WebGPU | WebGPU |
| Visual treatment | Editing-oriented and diagnostic | Final player-visible composition |
| Extra passes | Selection, handles, polygon edges, wall guides, light radii, picking | None |
| Frame scheduling | On demand, capped near 30 FPS during interaction | On demand when static; display refresh while animated |
| React | Controls and panels beside the canvas | Mounts the canvas and lifecycle only |

Editor guides, selection outlines, transform handles, fog visualization, wall visualization, and light diagnostics must be GPU-rendered passes. React may surround the editor canvas with controls, but it may not visually compose the scene or place DOM editing elements over the scene.

The active output view is a single WebGPU canvas. React may show a loading, permission, or disconnected state before output begins, but it must not layer player-visible scene content over an active output canvas.

Frame scheduling is profile-specific:

- Static editor and output views render zero continuous frames after their current revision is presented.
- Editor previews invalidate at a controlled rate, initially capped at 30 FPS.
- Output animation may run at the display refresh rate.
- Video textures invalidate from `requestVideoFrameCallback` where available.
- A scene revision invalidates both profiles independently; it does not force them to present at the same frame rate.

### Assets

Use one reusable quad geometry with instance data for transforms, UVs, tint, opacity, ordering, and picking IDs. Batch by texture atlas or compatible texture binding strategy after the vgpu spike determines the best supported path.

Image loading converts stored `File` records into `ImageBitmap` or an equivalent upload source. Video support initially uses a stable GPU texture updated with `copyExternalImageToTexture` and `requestVideoFrameCallback`, subject to spike validation.

### Fog And Dynamic Lighting

No fog mask generation, light visibility calculation, shading, shadow composition, or final fog composition may run in React.

The initial GPU design is:

1. Tessellate polygon geometry outside React.
2. Rasterize fog polygons into an offscreen mask.
3. Rasterize fog-clear polygons to remove coverage.
4. Upload visible obstruction segments to GPU buffers.
5. Render radial light attenuation into a per-light or accumulated light target.
6. Generate extruded 2D shadow geometry from each obstruction segment in a vertex shader relative to the light.
7. Remove shadowed fragments from that light's contribution.
8. Accumulate colored light contributions in linear color.
9. Composite scene color, fog coverage, clear coverage, and accumulated lights in WGSL.
10. Convert the final linear image to the canvas display format.

Use premultiplied alpha and an HDR intermediate such as `rgba16float` if supported by the validated pipeline.

Polygon tessellation and interaction geometry may run in the engine or renderer support code. They are geometry preparation, not lighting or fog composition. CPU ray casting, Canvas 2D masks, CSS masks, and React-generated composite images are prohibited.

### Picking

Prefer CPU picking for simple rectangular asset bounds if it remains accurate with layer ordering and transforms. Use a GPU ID pass when alpha masks, overlapping geometry, or complex polygons require pixel-accurate selection.

Picking is read-only and must never mutate scene state directly. A picking result is translated into an engine selection command.

## Renderer Spike

The renderer spike is a go/no-go gate before the application is rebuilt around vgpu.

### Required Demonstrations

- Instanced textured image quads
- Multiple ordered asset layers
- Video texture updates and looping
- Fog polygon rasterization
- Fog-clear subtraction
- One colored radial light
- GPU-generated obstruction shadows
- Multiple lights at 4K output resolution
- Editor/table resize and DPR handling
- Resource cleanup and React Strict Mode remounts
- Device-loss recovery
- Deterministic render-plan tests with `vgpu/mock`
- Headless or browser pixel tests
- WGSL validation with `vgpu check --require-validation`

### Performance Scenarios

Test at minimum:

| Scenario | Content |
| --- | --- |
| Typical | 10 asset layers, 100 assets, 4 lights, 100 wall segments |
| Heavy | 25 asset layers, 500 assets, 16 lights, 500 wall segments |
| Video | 4 simultaneous video assets plus lighting and fog |
| Display | Full scene rendered at 3840x2160 |

Record frame time, GPU memory, texture upload time, shader compilation time, picking latency, and resize cost. Final budgets should be established from measured spike results rather than guessed in advance.

### Known vgpu Risks

- `vgpu` is young and its API may change rapidly; pin the validated version.
- It provides no sprite engine, image loader, atlas builder, or scene graph.
- Released video texture support is limited and needs direct WebGPU uploads.
- GPU picking may require lower-level WebGPU readback.
- Mixed compute/render work may require raw WebGPU where the public frame API is insufficient.
- Offscreen target resizing can invalidate texture identities and recorded bundles.

## shadcn Interface

### Foundation

Upgrade Next.js and React before generating current shadcn components. Use:

- Tailwind CSS v4
- CSS-variable theming
- Radix primitives
- Lucide icons
- `components.json` as the authoritative generator configuration

Shadcn is source distribution, not a conventional component dependency. Generated files under `src/components/ui` are owned by Fantassist and must be reviewed like application code.

### Initial Components

- Button and Button Group
- Input and Field
- Select
- Slider
- Toggle and Toggle Group
- Tooltip
- Dropdown Menu
- Dialog and Alert Dialog
- Command palette
- Sidebar
- Resizable panels
- Scroll Area
- Tabs
- Card
- Separator
- Skeleton and Spinner

Application compositions such as the scene sidebar, layer panel, asset inspector, lighting inspector, and display controls belong under `features`, not `components/ui`.

### Migration Rule

Do not mix MUI `sx`, Emotion styling, and Tailwind classes in one component. V2 should use shadcn and Tailwind exclusively. MUI remains only in the frozen v1 application until v1 is retired.

### Accessibility

Radix handles many interaction primitives but the application remains responsible for labels, semantic navigation, contrast, focus visibility, touch targets, shortcut discovery, and canvas alternatives.

Test dialogs, menus, command palette, tooltips, resizable panels, and sidebars using keyboard-only interaction, screen-reader-oriented role queries, and automated axe scans.

## Display Architecture

The editor and table display run separate engine and renderer instances. GPU resources are never shared across windows.

```text
Editor Engine
    |
    | committed snapshot and revision
    v
Display Transport
    |
    v
Read-only Table Engine
    |
    v
vgpu Renderer
```

Initially retain the existing protobuf request/response protocol and both transport implementations:

- Same-origin popup using `postMessage`
- Browser Presentation API

The table engine cannot issue editing commands. It accepts authoritative snapshots and revisions from the editor.

The table display should load asset files directly from same-origin IndexedDB when possible, while preserving the request-based asset path as a transport abstraction. On a missing revision or validation failure, the table requests a complete snapshot rather than attempting an ambiguous merge.

Synchronize video playback state using media time, playing state, playback rate, and send timestamp. Do not synchronize decoded video frames.

### Window Placement

Progressively enhance display launch with the Window Management API:

1. Begin from an explicit user action such as `Launch Table Display`.
2. Feature-detect `window.getScreenDetails` and query the `window-management` permission defensively.
3. Present the available displays when permission is granted.
4. Open one named output window using the selected display's `left`, `top`, `width`, and `height`.
5. Request fullscreen on the selected screen with `requestFullscreen({ screen })` where supported.
6. Observe screen-configuration changes and reconcile a disconnected or moved table display.

Screen labels, coordinates, and connected displays can change. A stored display preference is a hint that must be matched against current screen details, not a permanent identifier.

When Window Management is unsupported or denied, open the normal named popup and let the user move it manually. The output must provide a user-activated fullscreen fallback because fullscreen permission may not transfer from the editor's launch gesture.

Acquire a Screen Wake Lock while table output is active and visible. Reacquire it after visibility changes when the platform releases it, and release it when the display closes.

### Installable Desktop Application

Fantassist v2 remains an installable PWA with a stable application identity on the permanent production origin. The gateway should own the stable manifest and application start URL so switching implementations does not create a second desktop application.

Use `display: standalone` as the baseline. Treat `window-controls-overlay`, file handling for `.scene` files, launch handling, and multi-screen placement as progressive enhancements behind feature detection.

Service-worker ownership must be centralized. V1 and v2 must not register competing root-scoped service workers. Avoid caching version-selected HTML until cookie routing and cache invalidation are proven; version-specific static assets may use immutable caches.

## Deployment Topology

### Workspace Topology

Keep independently deployable applications in one workspace:

```text
apps/
  gateway/                  Same-origin routing, manifest, and switch endpoint
  v1/                       Frozen legacy application
  v2/                       New application

packages/
  scene-format-v1/          Frozen protobuf and compatibility adapter
  compatibility-fixtures/  Shared scenes and media
```

V1 and v2 may use different Next.js and UI dependency versions. The gateway contains no scene or rendering logic.

### Cookie-Selected Public Routes

Public URLs remain unchanged. The gateway chooses the implementation using one host-only cookie:

```text
__Host-fantassist-version=v1 | v2
```

In production, set the cookie with `Secure`, `SameSite=Lax`, and `Path=/`, without a `Domain` attribute. The gateway is the authoritative reader; LocalStorage is not used for request routing.

Examples remain stable across versions:

```text
/campaigns/{campaignId}/scenes/{sceneId}
/table
```

The gateway rewrites the request to the selected immutable deployment without redirecting the browser away from `app.fantassist.io`. Never expose upstream `*.vercel.app` URLs to users.

Version-specific static assets must use independent namespaces so an old document never receives assets from the other implementation. Version-selected HTML and React Server Component responses must not be shared through a public cache without correctly varying on the version cookie.

### Version Switch UI

Both versions contain a small implementation-local switch action. The action navigates to a gateway-owned endpoint rather than changing cookies independently:

```text
/switch-version?to=v2&returnTo=/campaigns/{campaignId}/scenes/{sceneId}
```

The gateway validates `returnTo` as a same-origin path, changes the cookie, and returns a `303` redirect to the same logical location. A switch is a full document reload, never a client-side React navigation.

Before navigation, the current application broadcasts a version-switch message over `BroadcastChannel`, with a LocalStorage event fallback. Other Fantassist tabs stop writing and reload, and the named table output closes itself. The switch UI warns when a table display or unsaved edit is active.

Cookie routing intentionally supports one active production version at a time. Keeping old-version tabs alive after changing the cookie is unsupported because later route requests could reach the new implementation.

### Explicit Development Routes

The gateway also exposes non-user-facing, same-origin overrides:

```text
/__v1/*
/__v2/*
```

These routes bypass the version cookie and exist for local development, compatibility tests, and side-by-side diagnosis. They preserve the same origin, so both applications can operate against the same IndexedDB data in controlled tests.

Use one stable local HTTPS origin and port, for example `https://fantassist.localhost:3000`. A root `npm run dev` command starts the gateway and both application servers while preserving hot reload.

Normal development disables service-worker registration to prevent stale bundles. A separate `npm run dev:pwa` mode enables the production-like manifest, service worker, installation, Window Management, fullscreen, and wake-lock testing. Use a dedicated Chromium profile for persistent PWA installation, display permissions, and multi-screen tests.

### Vercel Preview Deployments

Every Vercel preview URL has isolated IndexedDB. Preview development must not depend on production browser data.

Provide committed compatibility fixtures, a development-only sample campaign loader, deterministic browser-test seeding, and `.scene` import/export. Compatibility CI runs v1 and v2 behind one test gateway origin rather than attempting to share storage between Vercel preview domains.

If same-origin production routing proves impractical, explicit scene export/import remains the fallback. It transfers a snapshot and does not provide shared storage.

## Testing Strategy

| Layer | Tests |
| --- | --- |
| Domain | Command validation, selectors, ordering invariants, schema adapters |
| History | Commands followed by inverse commands restore equivalent scenes |
| Persistence | Fake IndexedDB, interrupted saves, quota failures, cross-tab updates |
| Compatibility | Frozen v1 fixtures and v1/v2 semantic round trips |
| Render plan | Scene fixtures produce expected passes and invalidation sets |
| Shaders | Fog masks, attenuation, shadows, blending, and color conversion |
| Pixels | Fixed-time, fixed-DPR screenshot or buffer comparisons |
| Interaction | Preview commit/cancel, transforms, polygon editing, picking |
| Transport | Handshake, revision gaps, reconnect, read-only enforcement |
| End-to-end | Campaign to editor to popup table, reload recovery, import/export |
| Performance | Typical/heavy 4K scenes, videos, resizing, memory, device loss |

### Headless Scene Render Harness

Headless scene rendering is a required product-development capability. It allows agents and CI to render, inspect, and compare a complete Fantassist scene without launching a browser.

Use `vgpu/node`, which runs WebGPU through Dawn and renders into an offscreen `Target`. Use `target.read()` for final `rgba8unorm` pixels and `target.readFloats()` when inspecting HDR intermediate targets.

The harness accepts:

```ts
interface HeadlessRenderRequest {
  scene: SceneDocument
  assets: AssetProvider
  profile: "editor" | "output"
  width: number
  height: number
  timeMs: number
  devicePixelRatio: number
}
```

The default profile is `output`, because it represents the player-visible scene contract. The editor profile must also be renderable so GPU guides, handles, fog visualization, and diagnostics can receive pixel coverage without a browser.

The harness returns raw pixels and can optionally encode them as PNG:

```ts
interface HeadlessRenderResult {
  width: number
  height: number
  pixels: Uint8Array
}
```

It must not depend on Next.js, React, DOM canvas APIs, IndexedDB, LocalForage, browser `File` objects, or window globals.

### Asset Providers

Renderer media access is dependency-injected through an `AssetProvider` shared by browser and headless entry points.

Provide these implementations:

| Provider | Purpose |
| --- | --- |
| IndexedDB provider | Production editor and output windows |
| Scene export provider | Reads embedded media from a `.scene` fixture |
| File-system provider | Local CLI rendering from fixture directories |
| In-memory provider | Unit tests and generated test cases |

Browser-only decode objects such as `ImageBitmap`, `HTMLImageElement`, and `HTMLVideoElement` must not leak into the render plan. Asset decoding produces a renderer-owned upload description that can be implemented in both browser and Node environments.

Video tests use an injected deterministic frame source at a fixed media time. Browser video decoding and playback synchronization remain covered by Playwright because headless Node rendering must not depend on platform video timing or codecs.

### Determinism

Pixel tests must control every render input:

- Force `init({ adapter: "software" })` in CI.
- Install and cache the vgpu software renderer in the CI image.
- Use explicit physical dimensions and DPR 1 unless a test targets DPR behavior.
- Render exactly one explicit frame rather than starting `requestAnimationFrame`.
- Use a fixed clock value and deterministic video frame source.
- Disable random shader inputs or provide a fixed seed.
- Wait for `gpu.settled()` before readback.
- Dispose the target, renderer resources, and GPU device so Node exits cleanly.
- Encode PNGs with a portable encoder that does not add another native Node dependency.

Software-rendered goldens are authoritative for deterministic CI comparisons. Browser GPU tests verify integration and allow documented pixel tolerances because hardware, drivers, and color paths can differ slightly.

### Harness CLI

Provide a stable agent-friendly command:

```bash
npm run render:scene -- \
  --input fixtures/scenes/dynamic-lighting.scene \
  --output artifacts/dynamic-lighting.png \
  --profile output \
  --width 1920 \
  --height 1080 \
  --time-ms 0
```

Optional diagnostics can write selected intermediate targets such as the fog mask, per-light shadow mask, accumulated light buffer, picking IDs, and pre-tone-map color target. This functionality must use existing renderer targets and readback rather than altering composition behavior.

On failure, CI preserves the expected image, actual image, difference image, scene fixture, renderer diagnostics, adapter information, and shader validation output as artifacts.

### Test Modes

| Mode | Tool | Purpose |
| --- | --- | --- |
| Pure engine | Node.js test runner | Commands, validation, history, and selectors |
| GPU orchestration | `vgpu/mock` | Resource lifecycle, pass order, bindings, and errors without pixels |
| Headless pixels | `vgpu/node` with software adapter | Deterministic shader and complete-scene output |
| Browser pixels | Playwright WebGPU | Canvas, browser uploads, color path, and browser GPU integration |
| Product E2E | Playwright | UI, IndexedDB, editor/output windows, and version switching |

`vgpu/mock` does not render pixels and cannot replace the headless Dawn harness. Playwright remains necessary for browser APIs, but ordinary scene rendering and shader regression tests must not require it.

Recommended tools:

- Node.js 24's built-in test runner for engine, domain, compatibility, and headless tests
- `fake-indexeddb` for persistence tests
- `vgpu/mock` for deterministic resource and command tests
- `vgpu/node` or Playwright Chromium for pixel tests
- React Testing Library and `user-event` for interface components
- Playwright for editor/table integration
- `@axe-core/playwright` for accessibility checks

## Documentation And Agent Support

### Required Documentation

- `docs/architecture.md`
- `docs/storage-compatibility.md`
- `docs/scene-engine.md`
- `docs/rendering-pipeline.md`
- `docs/dynamic-lighting.md`
- `docs/headless-rendering.md`
- `docs/adding-a-command.md`
- `docs/adding-a-render-pass.md`
- `docs/testing.md`
- `docs/deployment.md`
- `docs/adr/`

### Required Skills

- Fantassist architecture and project conventions
- Scene engine commands and state ownership
- V1 storage compatibility
- vgpu renderer and shader development
- Shadcn interface conventions

### Automated Guardrails

- Enforce import direction with ESLint restrictions or `dependency-cruiser`.
- Prevent React imports in engine, renderer core, and persistence core.
- Prevent IndexedDB access from React components and renderer passes.
- Prevent direct protobuf mutation outside the compatibility adapter or engine reducer.
- Prevent hand edits to generated protobuf files.
- Validate all WGSL in CI.
- Require command registry completeness in tests.
- Keep canonical scene fixtures shared across engine, storage, renderer, and transport tests.
- Assert that browser and headless entry points compile the same render plan for the same scene snapshot.
- Run representative complete-scene headless pixel tests in CI.

Provide a single aggregate command:

```bash
npm run check
```

It should run formatting, linting, type checking, unit tests, compatibility tests, architecture checks, deterministic headless render tests, and WGSL validation.

## Delivery Phases

### Phase 0: Decisions And Baseline

Deliverables:

- Approve this plan and initial architecture decision records.
- Capture v1 compatibility fixtures.
- Freeze and label the v1 protobuf schema.
- Reserve removed marker field numbers.
- Choose the supported browser policy.
- Record cookie-selected same-origin routing as the production topology.
- Define the stable PWA identity and service-worker owner.

Exit criteria:

- Compatibility requirements are executable tests, not only documentation.
- The frozen v1 application can still build and export every fixture.

### Phase 1: Legacy Deployment Readiness

Deliverables:

- Pin Node.js 24 or newer in repository and Vercel configuration.
- Keep the verified `canvas@3.2.3` baseline or remove the native dependency entirely.
- Apply the minimum supported Next.js and dependency updates required for a secure deployment.
- Preserve v1 behavior through compatibility and browser smoke tests.
- Add the v1 version-switch action and cross-window switch listener.
- Deploy the same-origin gateway with v1 as the default implementation.
- Establish version-specific static asset namespaces and cache rules.
- Establish a gateway-owned manifest and non-conflicting service-worker policy.

Exit criteria:

- A clean Node 24 install and production build succeed without native compilation failures.
- V1 runs through the gateway on the permanent production origin.
- Existing public routes, the table popup, import/export, and IndexedDB access still work.
- The switch endpoint can select v1 safely before v2 is exposed.
- No scene data migration occurs.

### Phase 2: vgpu Technical Spike

Deliverables:

- Standalone spike for images, videos, fog masks, lights, and obstruction shadows.
- 4K performance measurements.
- Headless `vgpu/node` render harness using the production render passes.
- Deterministic software-adapter pixel tests and PNG artifacts.
- Written lighting-pipeline ADR.

Exit criteria:

- The complete lighting path executes on the GPU.
- Video updates work in supported browsers.
- 4K results meet an agreed performance budget.
- Device-loss and cleanup behavior are understood.
- The same spike scene renders in Node and the browser through the same render plan.
- CI can render an output scene to pixels without Chromium.

If the spike fails, revise the rendering technique or browser policy before continuing. Do not hide CPU composition in React to pass the gate.

### Phase 3: Application Foundation

Deliverables:

- Node.js 24 or newer pinned consistently with the gateway and v1.
- Current Next.js, React, TypeScript, and test tooling.
- Tailwind and shadcn initialized.
- Empty v2 routes and application shell.
- Dependency-direction checks.
- CI running `npm run check`.
- Stable `render:scene` CLI and cached vgpu software-renderer setup.

Exit criteria:

- A production Vercel build succeeds.
- No MUI or Emotion code is used by v2.
- Architecture violations fail CI.
- A fixture scene can be rendered to PNG on a clean headless CI worker.

### Phase 4: Engine Core

Deliverables:

- Scene engine lifecycle.
- Typed command registry.
- Immutable snapshots and selectors.
- Preview transactions.
- Undo and redo.
- React `useSyncExternalStore` bindings.
- Engine developer inspector.

Exit criteria:

- A test scene can be edited without React owning scene state.
- Command, inverse, validation, and invalidation tests pass.

### Phase 5: V1 Persistence Adapter

Deliverables:

- Reads and writes the existing stores.
- Autosave of committed revisions.
- Save status and quota-error reporting.
- Cross-tab change detection.
- Scene import/export and compatibility suite.
- Persistent-storage request.

Exit criteria:

- V1 and v2 can alternately open and save every non-tracker fixture.
- No destructive IndexedDB migration is required.
- Missing and corrupt assets produce recoverable errors.

### Phase 6: Base Renderer

Deliverables:

- Table camera, dimensions, offset, scale, and grid.
- Ordered image and video asset layers.
- Transform and visibility support.
- Resource cache and disposal.
- Render-plan and base pixel tests.
- Separate editor and output render profiles.
- Independent event-driven frame schedulers for editor and output.

Exit criteria:

- Static and video scenes match compatibility fixtures closely enough for documented tolerances.
- Idle scenes render on demand rather than continuously.
- The output presents a WebGPU canvas without DOM or React scene composition.

### Phase 7: Fog And Dynamic Lighting

Deliverables:

- GPU fog masks and clear masks.
- GPU obstruction shadows.
- GPU colored-light accumulation.
- GPU fog and lighting composite.
- Light and fog diagnostics in the developer inspector.

Exit criteria:

- No React or Canvas 2D lighting/fog composition remains.
- Pixel tests cover overlapping fog, clear regions, walls, colored lights, and layer order.
- 4K performance remains inside the agreed budget.

### Phase 8: Editor Interactions

Deliverables:

- Selection and picking.
- Asset drag, resize, rotate, delete, snap, and keyboard movement.
- Polygon creation and editing.
- Light creation, movement, configuration, and deletion.
- Layer creation, visibility, naming, ordering, and deletion.
- Table view manipulation.
- GPU-rendered editor guides, handles, outlines, wall visualization, and light diagnostics.

Exit criteria:

- Every edit travels through an engine command or preview transaction.
- Undo/redo works across all editor operations.
- React components contain no scene mutation logic.
- React components do not visually compose or overlay the editor scene.

### Phase 9: Product Workflows

Deliverables:

- Campaign creation, selection, and renaming.
- Scene creation, search, rename, deletion, import, and export.
- Asset upload and calibration.
- Video audio controls.
- Display and screen-size settings.
- Responsive desktop and mobile shell.
- PWA manifest, installation flow, and desktop application shell.
- Version-switch UI shared in behavior across v1 and v2.

Exit criteria:

- Existing non-tracker workflows reach feature parity.
- Keyboard and accessibility test suites pass.

### Phase 10: Table Display

Deliverables:

- Popup and Presentation API support.
- Send, hide, freeze, and unfreeze behavior.
- Snapshot handshake and revision recovery.
- Asset and video synchronization.
- Reconnection and error states.
- Window Management screen selection and placement where supported.
- Selected-screen fullscreen with a manual fallback.
- Screen Wake Lock while output is active.

Exit criteria:

- Editor and table maintain the same committed revision.
- The table remains read-only.
- Connection recovery requires no page reload during normal interruptions.
- The active output scene is composed exclusively by WebGPU.
- Denied or unsupported window permissions fall back to a usable popup.

### Phase 11: Rollout

Deliverables:

- Cookie-selected same-origin v1/v2 production routing.
- Gateway-owned validated switch endpoint.
- Coordinated version switch and table-window shutdown.
- Internal explicit-version routes for diagnostics.
- Browser support messaging.
- Compatibility and export reminder.
- Performance, memory, and accessibility review.
- Rollback procedure.

Exit criteria:

- Users can switch versions without moving origins or importing data.
- V1 remains available during the observation period.
- V2 can be rolled back without migrating or corrupting shared scenes.
- The installed PWA retains one stable application identity across version switches.

## Initial Milestones

The first four implementation milestones are deliberately risk-first:

1. Build the frozen v1 compatibility fixture suite.
2. Upgrade and deploy v1 on Node 24 behind the same-origin gateway.
3. Complete the vgpu lighting, video, 4K, and headless rendering spike.
4. Build a scene engine prototype that edits one draggable asset without React scene state.

Do not begin broad interface work until the first three milestones have passed.

## Open Decisions

| Decision | Options | Recommendation |
| --- | --- | --- |
| Supported browsers | Chromium-only initially or broader WebGPU support | Decide from video and performance spike results |
| Unsupported browser behavior | Block v2 or redirect to v1 | Offer a direct switch back to v1 |
| Renderer threading | Main thread or worker | Start on main thread; preserve worker-compatible APIs |
| Picking | CPU bounds or GPU ID pass | CPU for simple assets, GPU where pixel accuracy is required |
| Internal scene representation | V1 schema directly or richer engine model | V1-compatible canonical document plus derived engine state |
| V2-only persisted features | Extend shared protobuf or sidecar store | Sidecar only; never require it for v1-compatible rendering |
| Lighting shadow method | Extruded segment geometry, polar shadow maps, or ray tests | Begin with GPU-extruded segment shadows |
| Color pipeline | Canvas format only or HDR intermediate | Validate `rgba16float` during the spike |
| Undo persistence | Session-only or persisted history | Session-only initially |
| Headless pixel adapter | Hardware, automatic, or software | Force software for deterministic CI; allow local override |

## Resolved Decisions

| Decision | Resolution |
| --- | --- |
| Production version routing | Gateway-owned host cookie with unchanged public routes |
| Development version routing | Same-origin `/__v1` and `/__v2` overrides |
| Version switch | Small UI in both versions using a gateway endpoint and full reload |
| Active-version model | One production version active per browser origin at a time |
| Editor/output rendering | Two profiles of one vgpu renderer with independent frame scheduling |
| Output composition | WebGPU only while a scene is active |
| Desktop installation | One stable gateway-owned PWA identity |
| Deployment runtime | Node.js 24 or newer for gateway, v1, and v2 |
| Headless renderer | `vgpu/node` with Dawn and the production render plan |

## Risks

| Risk | Mitigation |
| --- | --- |
| Vgpu API instability | Pin a validated release and wrap it behind renderer interfaces |
| Video texture limitations | Prove upload and lifecycle behavior before foundation work |
| 4K lighting cost | Benchmark multiple algorithms during the spike |
| V1 dropping v2 protobuf fields | Freeze shared schema and use optional sidecar storage |
| IndexedDB unavailable across deployments | Keep both versions on one exact origin |
| Concurrent v1/v2 writes | Detect external revisions and warn; document single-writer behavior |
| GPU/device loss | Centralize resource ownership and rebuild from engine snapshots |
| Agent-driven architecture drift | Enforce import boundaries and maintain task-specific skills |
| Shadcn source divergence | Treat generated components as owned code and review updates |
| Visual differences from Konva | Use canonical fixtures and documented pixel tolerances |
| Native canvas behavior regresses on Node 24 | Retain the verified `canvas@3.2.3` build check until Konva is retired |
| Version cookie changes while old tabs remain open | Broadcast the switch, stop writes, close output, and force full reloads |
| Cookie-selected responses are cached incorrectly | Namespace static assets and vary or disable caching for selected documents |
| Competing service workers route stale versions | Centralize manifest/service-worker ownership at the gateway |
| Headless and browser renderers drift | Share all render-plan and pass code; vary only platform adapters and targets |
| Software and hardware pixels differ | Use software goldens plus tolerant browser integration tests |
| Video decoding is nondeterministic in Node | Inject a fixed decoded frame; test real playback in Playwright |

## Definition Of Rebuild Complete

- All existing non-tracker features are available in v2.
- React does not own or mutate scene state.
- Dynamic lighting, shadows, fog masks, and fog composition execute through vgpu/WebGPU.
- V2 reads and writes existing v1 scenes and assets without destructive migration.
- Users can switch between v1 and v2 on the same origin.
- Switching is coordinated across tabs and closes the old table output.
- Editor and table display remain synchronized through committed revisions.
- Editor and output use separate visual profiles and independent frame scheduling.
- The active output scene is a WebGPU-only canvas with no React scene composition.
- The interface uses shadcn and contains no v2 MUI dependency.
- Fantassist remains installable under one stable desktop PWA identity.
- Window placement, fullscreen, and wake lock progressively enhance table presentation.
- Gateway, v1, and v2 build and deploy on Node.js 24 or newer.
- Engine, persistence, renderer, shader, transport, accessibility, and compatibility tests run in CI.
- Complete editor and output scenes can be rendered to inspectable pixels without a browser.
- Headless and browser rendering execute the same production render passes and WGSL.
- Architecture and feature-extension workflows are documented and represented in agent skills.
- A rollback to v1 does not require data recovery or conversion.
