# ADR 0007: V2 Table Display Launcher

## Status

Accepted.

## Decision

The table launcher is a permission-aware wizard around Chromium's Window Management and Fullscreen APIs.

On first use, the launcher checks the `window-management` permission without prompting. A granted permission loads `getScreenDetails()` immediately. A prompt state presents one explicit screen-access action. Denied or unsupported access falls back to manual resolution, physical TV size, and a normal popup window; core table output never depends on the optional API.

With screen access, display selection is the first choice. Screen cards show only user-identifying details: browser label, primary/secondary and internal/external classification, physical resolution, and orientation. The launcher retains the remaining useful `ScreenDetailed` geometry internally for placement and generated identity. Selecting a screen card applies and persists its physical resolution before physical TV-size configuration. An **Other** card explicitly bypasses Window Management and enters the normal-window flow, where 4K, 1080p, or a custom resolution can be selected even though screen permission is available. The selected generated ID is stored as `table_display_target`, restored after future screen discovery, and marked as the last-used display; Chromium does not expose a durable hardware identifier.

Primary displays open the named `fantassist-table` window as a centered, bounded popup and do not request fullscreen. Secondary displays open the same named window at the selected display's bounds and navigate it to fullscreen-required mode. Reusing the window also changes its route and dimensions, preventing a previous primary or secondary launch mode from leaking into the next choice.

The named window also participates in a same-origin `BroadcastChannel` presence protocol. It announces on mount, responds to discovery requests, and heartbeats while open. Reloaded or additional editor tabs first recover the named browsing context without navigating it. If browser context-group rules prevent direct recovery but presence is known, the editor closes any newly created blank context and asks the existing table to focus, move, resize, or switch mode itself. Presence expires shortly after heartbeats stop, so a genuinely closed table can be recreated.

Secondary output resolves its current permitted `ScreenDetailed` and attempts the Fullscreen API with that screen and hidden navigation UI. Window Management permission alone does not waive the Fullscreen API's transient-activation requirement. Chromium's separate `automatic-fullscreen` content setting can do so, but is blocked by default for normal sites and standard installed PWAs; automatic user control is initially scoped to Isolated Web Apps, with enterprise allow-listing available for HTTPS origins. Until fullscreen succeeds, the player scene is completely covered by a display-lock screen that accepts its large action, a click anywhere, or an unmodified character/Enter key. That instruction is derived from current fullscreen state, so it returns after exiting fullscreen. Toolbar diagnostics are evaluated only after the document enters fullscreen; if the physical viewport then remains shorter than the configured resolution, the gate explains Chrome's fullscreen shortcut and the macOS **View → Always Show Toolbar in Full Screen** setting.

While `/table` is visible it requests a Screen Wake Lock. The lock is released when the document becomes hidden or unmounts and reacquired when the table becomes visible again. Missing support, browser denial, and OS power-policy overrides degrade silently without blocking player output.

Resolution and diagonal changes use the unchanged v1 `table_resolution` and `table_size` settings. Manual resolution presets are 4K and 1080p with custom width/height; physical-size presets are 60, 55, and 50 inches with a custom diagonal.

## Consequences

- Screen permission is requested only from a clear user action.
- Secondary display output cannot accidentally expose a player scene in a toolbar-constrained window.
- Primary-display development and preview remain convenient and windowed.
- Detected display resolution and manual configuration share the existing persistence and live table-session channel.
