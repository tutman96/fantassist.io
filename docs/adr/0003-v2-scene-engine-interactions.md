# ADR 0003: Scene Engine Interaction Ownership

## Status

Accepted for the draggable-image engine prototype.

## Context

The renderer spike originally sourced asset transforms from constants embedded in WGSL. The table-camera slice translated pointer input into camera session changes, but no authoritative scene engine existed. The first engine milestone must prove that an asset can be selected, previewed, committed, undone, rendered, and mirrored to the table without React owning scene state.

## Decision

The v2 scene engine owns the immutable scene document, committed revision, selection, preview transaction, drag grab offset, and undo/redo history. Asset transforms use v1-compatible top-left grid coordinates, dimensions in grid units, and rotation in degrees.

React normalizes browser pointer positions into grid coordinates and forwards them to the engine. It may retain an active pointer ID and opaque preview token for pointer capture, but it does not retain or calculate the asset transform.

One-finger touch is reserved for scene interaction: touching an asset selects and drags it, while touching empty grid only changes selection. Two active touches cancel any asset preview and atomically pan and pinch-zoom the editor camera around their moving centroid.

Selected assets render a dark stellar-blue border in the final editor composite with eight brighter outlined resize handles and one outlined rotation handle. Cardinal handles resize one edge, corner handles resize width and height freely, Shift locks corner resizing to the active baseline aspect ratio, and Alt mirrors the opposite handle around the active resize center. Pressing or releasing either modifier during a resize rebases the interaction to the current preview and pointer before subsequent movement, preventing modifier changes from jumping the asset. Rotation snaps exactly to a 45-degree increment while the pointer-derived angle is within 5 degrees of it and remains unmodified outside that capture window. Handle picking uses screen-constant tolerances, and pointer cursors follow each handle's rotated screen direction.

Simple rectangular image assets use CPU picking. Picking walks assets from top to bottom and inverse-rotates the grid point before testing local bounds. A successful pointer down selects the asset and starts a replaceable transform preview. Pointer movement replaces that preview. Pointer up commits one transform and one history entry; pointer cancel or Escape discards it.

The engine exposes two revisions:

- `revision` changes only for committed scene mutations, undo, redo, or remote hydration.
- `presentationRevision` also changes for selection and preview updates so the editor renderer can present transient state.

The renderer consumes the effective immutable snapshot. The shared scene executor converts the snapshot's image transform into GPU uniforms and draws the same quad in editor, output, browser, and headless profiles. Selection treatment remains inside WGSL and is disabled by the output render profile.

Static browser scenes render on demand. Camera, selection, preview, committed-scene, and resize changes request frames; the prototype no longer runs an unconditional animation loop.

Only committed revisions cross the `BroadcastChannel` scene boundary. The editor publishes its committed scene after revision changes and responds to full-scene requests. The output owns a separate read-only engine and hydrates it from those committed snapshots. Selection and active previews remain editor-local.

## Consequences

- React scene mutation is prevented by API shape rather than convention alone.
- Drag previews do not alter scene version or cause output-window updates.
- A completed drag, undo, or redo updates the output as one committed revision.
- Device-loss recovery can rebuild from the browser renderer's latest engine snapshot.
- The engine document now carries ordered v1 layer summaries and persisted image media IDs. The current GPU binding still presents one image at a time; ordered multi-asset buffers and command metadata remain later milestones.

## Acceptance Criteria

- The scene and nested asset transforms are frozen snapshots.
- Invalid transforms do not mutate state or notify subscribers.
- Multiple pointer moves remain one preview and one eventual history entry.
- Cancel restores the exact committed transform without changing committed revision.
- Undo and redo restore exact transforms through normal renderer invalidation.
- Picking remains correct for rotated bounds and topmost ordering.
- Selection and preview updates render only in the editor profile.
- The output receives only committed scene revisions.
- Browser rendering is idle after the latest requested frame completes.
