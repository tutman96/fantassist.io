<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Fantassist v2 Boundaries

- Read `../../docs/v2-rebuild-plan.md` before architectural work.
- React belongs in `src/app`, `src/features`, and `src/components` only.
- `src/engine` owns scene state, commands, previews, and history. It must not import React.
- `src/renderer` owns vgpu resources, render plans, and WGSL passes. It must not import React or IndexedDB.
- React may attach a renderer to a canvas but may not compose scene pixels or mutate scene objects.
- Editor and output profiles must share render-plan and shader implementations.
- Run `npm run check` after renderer or application changes.
