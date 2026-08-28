# ADR 0002: Grid Space And Table Camera

## Status

Accepted for the table-bounds implementation.

## Context

Fantassist scenes do not store pixel coordinates. Assets, fog vertices, lights, obstruction walls, table offsets, and interaction positions all share one unbounded grid coordinate system. A grid cell is the canonical scene unit.

The editor and the table output are two projections of that same scene:

- The editor camera is an ephemeral view used to pan and zoom around the infinite grid.
- The table camera is the persisted rectangle that defines exactly what players see on the physical display.
- The configured display resolution and physical TV size determine the output pixel density.
- The table camera must remain visible and manipulable inside the editor without becoming coupled to the editor camera.

The v1 storage boundaries already separate these concepts. `Scene.table.offset` and `Scene.table.scale` are persisted with the scene. Display resolution and diagonal size are stored as user settings. Editor pan and zoom are not persisted in the scene.

## Coordinate Systems

### Grid Space

Grid space is authoritative:

- One unit is one grid cell.
- Positive X points right.
- Positive Y points down.
- The origin is arbitrary.
- Coordinates may be positive or negative.
- The world has no rendered or interaction bounds.
- Scene records never store editor pixels, output pixels, CSS pixels, or normalized UV coordinates.

The current renderer spike's normalized coordinates are temporary fixture data. They must be converted to grid-space values before table-camera support is considered complete.

### Editor Screen Space

The editor camera is session state:

```ts
interface EditorCamera {
  centerGrid: { x: number; y: number };
  cssPixelsPerGrid: number;
}
```

`cssPixelsPerGrid` is the editor zoom. It is dynamic and independent of device pixel ratio. Camera position changes only the translation between grid and screen coordinates; it does not modify scene coordinates or pixel density.

For a grid point `world`, editor viewport size `viewportCss`, and camera `camera`:

```text
screenCss = viewportCss / 2 + (world - camera.centerGrid) * camera.cssPixelsPerGrid

world = camera.centerGrid + (screenCss - viewportCss / 2) / camera.cssPixelsPerGrid
```

The canvas backing resolution applies device pixel ratio after this CSS-space projection. Changing DPR must not change the world point beneath the pointer or the apparent editor zoom.

### Physical Display Space

The display configuration remains separate from scene data:

```ts
interface DisplayConfiguration {
  resolutionPx: { width: number; height: number };
  diagonalInches: number;
}
```

Given resolution `(Rw, Rh)` and diagonal `D`, the physical display dimensions are:

```text
pixelDiagonal = hypot(Rw, Rh)
displayWidthInches = D * Rw / pixelDiagonal
displayHeightInches = D * Rh / pixelDiagonal
displayPpi = pixelDiagonal / D
```

The existing defaults are `3840x2160` and `45 inches`, producing approximately `39.22x22.06 physical inches` and `97.91 pixels per inch`.

### Table Camera

The table camera is persisted scene state normalized from the existing protobuf:

```ts
interface TableCamera {
  originGrid: { x: number; y: number };
  scale: number;
  displayGrid: boolean;
}
```

`originGrid` is the top-left visible grid coordinate. The table camera is free to move anywhere on the infinite grid.

`scale` is the number of physical inches occupied by one grid cell. Its default is `1`, so each grid cell is one physical inch on the configured TV. This preserves the existing `TableOptions.scale` behavior while making the unit explicit.

The table bounds in grid units are:

```text
tableWidthGrid = displayWidthInches / table.scale
tableHeightGrid = displayHeightInches / table.scale

left = table.originGrid.x
top = table.originGrid.y
right = left + tableWidthGrid
bottom = top + tableHeightGrid
```

The output conversion is:

```text
outputPixelsPerGrid = displayPpi * table.scale

outputPixel.x = (world.x - table.originGrid.x) * outputPixelsPerGrid
outputPixel.y = (world.y - table.originGrid.y) * outputPixelsPerGrid
```

At `table.scale = 1`, a one-unit grid cell occupies exactly one configured physical inch and therefore `displayPpi` output pixels.

The v1 `rotation` field is preserved in storage but is not part of this first implementation. V1 output ignores it, and applying it only in the v2 editor would make the table bounds disagree with player output. Rotation must be either supported in both profiles or ignored in both profiles.

## Pixel Density

The product uses two related but distinct runtime scales:

- Editor pixels per grid unit: `camera.cssPixelsPerGrid`, selected by editor zoom and initial fit.
- Output pixels per grid unit: `displayPpi * table.scale`, derived from TV configuration and the persisted table camera.

Neither value is stored on assets, lights, fog, or walls. Both are projection inputs.

The initial editor camera fits the table bounds into the available viewport with padding:

```text
fitPixelsPerGrid = min(
  availableCssWidth / tableWidthGrid,
  availableCssHeight / tableHeightGrid
) * paddingFactor

camera.centerGrid = center(tableBounds)
camera.cssPixelsPerGrid = fitPixelsPerGrid
```

After initial fit, resizing the browser preserves `centerGrid` and `cssPixelsPerGrid`; a larger editor reveals more world. Refitting the table is an explicit command, not automatic resize behavior.

## Editor Behavior

The v2 editor becomes a WebGPU workspace beneath a compact application bar. The measured canvas viewport starts below that bar; application-chrome pixels are excluded from camera centering, fit calculations, and pointer normalization. Controls and status may be DOM UI around or above the canvas, but all scene content and editor guides remain GPU rendered.

The editor profile renders:

- The infinite world background.
- A one-unit grid aligned to integer grid coordinates.
- Scene assets, fog, lights, and obstruction walls in grid space.
- A dashed table-camera rectangle derived from TV dimensions and table scale.
- A darker treatment outside the table bounds so the player-visible region is obvious.
- Editor-only fog borders, wall guides, light points, selection guides, and diagnostics.

The table bounds are not clipped by the editor viewport. Panning can move them fully offscreen.

### Editor Camera Interaction

- Middle-button drag pans the editor camera.
- Right-button drag may pan while suppressing the context menu, matching v1.
- Space plus primary-button drag provides an accessible alternative to middle-button pan.
- Trackpad scrolling pans when not used as a zoom gesture.
- Wheel or trackpad zoom is anchored to the grid coordinate beneath the pointer.
- Keyboard zoom is anchored to the viewport center.
- A Fit Table command centers and fits the current table bounds.
- Zoom is clamped to finite product limits; world coordinates themselves are not clamped.

For a pointer-anchored zoom from `z0` to `z1`:

```text
anchorGrid = center0 + (pointerCss - viewportCss / 2) / z0
center1 = anchorGrid - (pointerCss - viewportCss / 2) / z1
```

For a pan from pointer start `p0` to current pointer `p1`:

```text
center1 = center0 - (p1 - p0) / cssPixelsPerGrid
```

Editor camera changes are session-only invalidations. They do not update the protobuf scene version, persist scene data, enter undo history, or synchronize to the table window.

### Table Camera Interaction

The table camera is separate from editor pan and zoom:

- Dragging the table bounds updates `originGrid` in a preview transaction.
- Releasing the drag commits one scene command and one undo entry.
- Changing TV resolution or diagonal recomputes table width and height while preserving `originGrid`, `scale`, and editor camera.
- Changing table scale changes the visible grid extent while preserving the configured physical display size and aspect ratio.
- Table scale remains user-configurable: values above `1` zoom the player view in and values below `1` zoom it out.
- A Reset Table View command restores origin `(0, 0)` and scale `1`.
- Display View mode renders four screen-sized corner handles. Dragging the interior previews an origin change; dragging a corner previews aspect-preserving scale and origin changes while fixing the opposite corner. Scroll and pinch gestures continue to navigate the editor camera rather than resizing the player view.
- Table previews live in the scene engine and invalidate only the editor. Commit, cancel, undo, redo, persistence, and player-output synchronization use the same revisioned scene command path as asset edits.

The first bounds slice may render and fit the table camera before table dragging is enabled, but the data model and projection must not prevent free movement later.

## Output Behavior

The output profile renders only the grid-space rectangle selected by the table camera.

- `table.originGrid` maps to output pixel `(0, 0)`.
- The table's bottom-right grid coordinate maps to the configured resolution's bottom-right edge.
- One grid cell occupies `table.scale` configured physical inches.
- Opaque black fills pixels outside the selected viewport or in letterbox regions.
- Fog remains opaque black outside clear or illuminated regions.
- Editor guides, table borders, fog borders, wall guides, light points, and selection UI are never visible.
- The persisted `displayGrid` setting controls both the DM view and player output. The editor toolbar commits the shared scene setting, so both views update together and reload consistently.

When the browser canvas aspect ratio differs from the configured display aspect ratio, the renderer uses uniform contain scaling and black letterboxing. It must never stretch X and Y independently. Browser and operating-system scaling can affect real-world physical accuracy; the renderer guarantees the logical mapping implied by the configured resolution and diagonal.

## Renderer Architecture

Projection is compiled outside WGSL from normalized immutable inputs and passed to every spatial render pass.

```ts
type RenderView =
  | {
      kind: "editor";
      camera: EditorCamera;
      viewportCss: { width: number; height: number };
      targetPx: { width: number; height: number };
    }
  | {
      kind: "output";
      table: TableCamera;
      display: DisplayConfiguration;
      targetPx: { width: number; height: number };
    };
```

A platform-neutral projection compiler produces world-to-device and device-to-world affine transforms. The browser and `vgpu/node` adapters use the same compiler, render plan, executor, and WGSL.

Ownership remains:

- Engine/session: editor camera and persisted table camera semantics.
- Projection compiler: grid-to-pixel transforms and inverse transforms.
- Browser adapter: canvas measurements, DPR, pointer normalization, resize notifications, and frame requests.
- Scene executor: projection uniforms, target allocation, and shared passes.
- WGSL: grid-space rendering, table-bound diagnostics, and final composition.
- React: application bar, buttons, settings controls, and renderer lifecycle only.

React must not calculate scene pixels, draw the table rectangle, render the grid, or place DOM scene guides over the canvas.

## Scheduling And Resize

Static scenes render on demand.

- Editor camera movement invalidates only the editor renderer.
- Table camera previews invalidate the editor; committed changes invalidate editor and output.
- Canvas resize keeps editor center and zoom stable and reveals more or less world.
- DPR changes resize physical targets without changing CSS-space camera behavior.
- Output resize recomputes contain mapping without changing persisted table state.
- The current animated spike may request frames for demonstration, but table-camera architecture cannot depend on continuous animation.

The renderer must submit a resized target and matching projection in the same frame. It must not render with resized intermediate targets and a stale camera transform.

## Validation And Defaults

Normalize unsafe legacy values at the v2 boundary without rewriting stored data merely because a fallback was used:

- Missing or non-finite table origin defaults to `(0, 0)`.
- Missing, zero, negative, or non-finite table scale defaults to `1`.
- Missing, zero, negative, or non-finite resolution defaults to `3840x2160`.
- Missing, zero, negative, or non-finite diagonal defaults to `45 inches`.
- Editor zoom is clamped to finite minimum and maximum values.

The existing protobuf schema and settings keys remain unchanged. No IndexedDB migration is introduced.

## Acceptance Criteria

### Projection

- Scene fixture coordinates are expressed in grid units, not normalized UV or pixel coordinates.
- Editor camera center maps to the center of the physical canvas target.
- Grid-to-screen-to-grid round trips stay within floating-point tolerance for positive and negative coordinates.
- Pointer mapping is invariant across DPR 1 and DPR 2.
- Cursor-anchored zoom leaves the grid point beneath the cursor unchanged.
- Panning by `N` CSS pixels changes camera center by exactly `N / cssPixelsPerGrid` grid units.

### Table Bounds

- Display width and height derive from configured resolution and diagonal.
- The editor table rectangle has the display aspect ratio and dimensions `physical inches / table.scale` in grid units.
- Default `3840x2160`, `45-inch`, scale `1` bounds are approximately `39.22x22.06` grid units.
- Table origin may be any finite positive or negative grid coordinate.
- Fit Table centers the bounds with stable padding.
- Ordinary editor resize does not reset pan or zoom.

### Output

- At scale `1`, one grid cell maps to one configured physical inch.
- At rotation zero, v2 output reproduces the v1 transform `pixel = (world - offset) * scale * displayPpi`.
- Mismatched output aspect ratios letterbox instead of stretching.
- The table rectangle shown in the editor maps to the exact world region rendered by the output profile.
- Output hides all editor-only guides.

### Rendering And Lifecycle

- Grid, table bounds, fog boundaries, walls, and lights remain WebGPU-rendered.
- Camera-only updates reuse pipelines and textures.
- Browser and headless renders use identical projection math and passes.
- Resize, Strict Mode remount, and device recovery restore the latest camera and table view.
- Focused tests cover projection round trips, pan, pointer-anchored zoom, fit, TV dimension derivation, output mapping, invalid legacy defaults, and letterboxing.

## Deferred Decisions

- Whether v2 should honor persisted table rotation in both editor and output.
- Persisting editor camera state in a v2-only workspace sidecar.
- Touch pinch and multi-touch table manipulation.
- Table-bound resize handles and direct scale editing.
- Real display calibration for browser zoom, OS scaling, and overscan.
- Video scheduling and upload behavior.

## Consequences

- Grid space becomes an explicit architecture boundary rather than an implication of v1 rendering code.
- Editor camera position and zoom can evolve without mutating scene data.
- TV size changes affect the table rectangle and output projection without rewriting asset coordinates.
- Output mapping remains compatible with v1 at rotation zero.
- The renderer must replace normalized spike constants with grid-space fixture data and share one projection across every spatial pass.
