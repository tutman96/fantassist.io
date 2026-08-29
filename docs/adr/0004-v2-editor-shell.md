# ADR 0004: Editor Shell And Contextual Panels

## Status

Accepted for the prototype editor shell.

## Context

The renderer and interaction prototypes initially placed all controls over a full-viewport canvas. The application header covered part of the measured viewport, display calibration remained permanently visible, and there was no scene or layer navigation structure. The persisted scene, campaign, and ordered-layer models are not implemented yet, so the shell must establish product structure without presenting unfinished operations as functional.

## Decision

The editor uses a compact application command bar followed by a separately measured WebGPU workspace. Header pixels are not part of the editor camera viewport.

The command bar contains project identity, a searchable scene selector, and the table-output action. The scene selector exposes existing v1-compatible scenes with loading, save, conflict, error, and empty/search states, plus a route back to campaign and scene management.

Campaign selection uses a full-screen observatory rather than compressing campaign state into the editor command bar. It owns explicit active-campaign state, presents scene cards scoped to that campaign, and keeps empty campaigns useful through blank-scene creation and `.scene` import. The empty archive uses a decorative one-pass vgpu star field behind semantic HTML, with a CSS fallback, reduced-motion still frame, visibility/intersection pausing, and no dependency on the production scene renderer.

Navigation preserves the stable campaign route model while giving `/` a standalone landing experience. The landing CTA creates the first campaign for an empty archive and links returning users to the campaign list at `/campaigns`. Campaign creation uses `/campaigns/new`, campaign scene decks use `/campaigns/[campaignId]`, and editors use `/campaigns/[campaignId]/scenes/[sceneId]`. The legacy `/scenes/[campaignId]/[sceneId]` path redirects to the canonical editor. The root layout owns the decorative canvas, while the campaign layout owns editor providers, so client-side transitions preserve the cosmic surface and campaign/engine state without flashing.

The workspace contains:

- A responsive tool rail with engine-backed undo and redo.
- Ordered layer metadata and the currently supported image content from the active engine scene.
- An independent contextual inspector anchored at the top-right.
- An independent layer stack anchored at the bottom-right.

Display configuration is global shared state rather than a scene layer or inspector mode. The Open Table menu owns shared-session calibration, progressive screen discovery, target-screen selection, and the output launch action. Selecting image content dispatches engine selection and reveals transform metadata and interaction guidance. With no asset selected, the inspector shows scene metadata. React owns only panel-navigation and display-menu state; asset selection and mutations remain engine-owned.

The layers panel reflects persisted ordering and exposes image insertion on each asset layer. Fog and asset layers remain intermingled in their persisted paint order; an upload is never assigned to a layer implicitly. Visibility mutation and layer reordering use engine commands and v1-compatible persistence. Asset calibration is implemented as an atomic engine command with a visual and numeric editor; media replacement remains visibly disabled until its storage boundary exists.

Desktop opens the inspector and layer stack as separate panels. Mobile uses a horizontal tool strip and keeps both panels collapsed by default; choosing a layer closes the layer sheet and reveals the corresponding inspector, preserving the canvas as the primary surface.

Interactive controls use project-generated shadcn primitives rather than reimplementing focus, disclosure, field, selection, and disabled-state behavior. Feature components apply the editor's square fantasy styling without changing generic primitives. Scene and table overlays use controlled `Popover` composition; workspace panels use controlled `Collapsible` and `ScrollArea`; controls use `Button`, `Toggle`, `ButtonGroup`, `Tooltip`, `Badge`, `Field`, `InputGroup`, `NativeSelect`, `Kbd`, `Separator`, and `Spinner` as appropriate.

The React implementation is split by responsibility:

- `EditorShell` composes route chrome and providers.
- `CampaignGate` and `CampaignObservatory` switch between campaign management and the active editor without duplicating persistence state.
- `GpuViewport` mounts the canvas and feature compositions.
- `useSceneViewport` owns canvas measurement and renderer lifecycle.
- `useEditorInteractions` owns keyboard, pointer, wheel, and touch translation.
- `EditorToolbar`, `WorkspacePanels`, `EditorPanel`, and viewport-status components own presentation only.
- Table field semantics and screen discovery live outside the table-menu composition.

## Consequences

- Initial camera fit and pointer mapping use only visible workspace pixels.
- Display configuration is available on demand from the global table-output workflow rather than permanent editor chrome.
- Camera diagnostics remain centered along the workspace edge so the bottom-right layer stack cannot cover them.
- Future scene, campaign, layer, and inspector workflows have stable UI regions.
- Prototype limitations remain visible and cannot be mistaken for persisted behavior.
- Enabling currently disabled controls requires the corresponding engine, compatibility, and persistence work rather than local React mutations.
