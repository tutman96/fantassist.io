# Fantassist v2

Fantassist v2 is an independent Next.js application built around an engine-owned scene model and a WebGPU renderer powered by `vgpu`.

## Commands

Run from the repository root:

```bash
npm run dev:v2
npm run build:v2
npm run check:v2
```

The root command serves v2 at `http://localhost:3001` so v1 can continue using port 3000.

Run from this directory:

```bash
npm run dev
npm run check
```

## Boundaries

- `src/app` owns Next.js routes and application lifecycle.
- `src/features` owns React UI composition.
- `src/components/ui` contains application-owned shadcn primitives.
- `src/engine` owns scene state and mutations without React.
- `src/renderer` owns render plans and GPU resources without React.
- Client components may attach a renderer to a canvas but may not compose scene pixels.

The editor and table output will use separate profiles of the same renderer. All fog, lighting, shadows, and final scene composition belong in WGSL and vgpu passes.

Read `../../docs/v2-rebuild-plan.md` before changing architecture or persistence behavior.
