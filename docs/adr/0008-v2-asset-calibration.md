# ADR 0008: V2 Asset Calibration

## Status

Accepted.

## Context

Fantassist v1 stores optional image calibration as horizontal and vertical pixels per inch plus source-pixel offsets. The persisted asset transform stores scene-grid dimensions separately. V2 previously preserved calibration opaquely while editing transforms but could neither inspect nor change it.

Calibration affects the physical size of a map on the player table. It must remain interoperable with v1, participate in global editor history, autosave through the existing scene repository, and update editor and player output without a calibration-specific renderer path.

## Decision

`ImageAsset` exposes the existing optional calibration values at the engine boundary. `asset.calibration` is one committed command that validates all four values, stores calibration, and atomically computes asset dimensions as:

- `width = intrinsic pixel width / horizontal PPI`
- `height = intrinsic pixel height / vertical PPI`

Position and rotation remain unchanged. Removing calibration removes its metadata without guessing replacement dimensions. History stores exact calibration and transform values before and after each command so undo and redo remain correct even when a calibrated asset was manually resized.

The inspector opens a local draft editor with a fixed table-style grid and equivalent numeric controls. The source image moves and scales beneath that grid: dragging changes source-pixel offsets, while horizontal and vertical zoom sliders change PPI. The axes scale together while locked and independently only after an explicit unlock. Applying the draft dispatches one engine command. Missing local media disables only the visual preview, not numeric calibration.

The v1 adapter explicitly projects and patches calibration for existing and newly inserted images. Unsupported v1 video, snap, volume, light, and wall data continues to be preserved by patching the complete loaded v1 scene.

## Consequences

Calibration immediately reaches both render profiles through the ordinary asset transform. It requires no WGSL or GPU resource changes. Source offsets identify a printed-grid intersection for movement snapping: while the scene grid is visible, quarter-turn maps snap that calibrated point to the closest scene-grid intersection when it comes within `0.10` grid units. Offsets do not shift rendering by themselves.
