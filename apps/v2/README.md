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
npm run render:scene -- --scene spike --profile output --size 640x360 --time 1.25 --out artifacts/dynamic-lighting.png
npm run render:performance
```

## Boundaries

- `src/app` owns Next.js routes and application lifecycle.
- `src/features` owns React UI composition.
- `src/components/ui` contains application-owned shadcn primitives.
- `src/engine` owns scene state and mutations without React.
- `src/renderer` owns render plans and GPU resources without React.
- Client components may attach a renderer to a canvas but may not compose scene pixels.

The editor and table output use separate profiles of the same render plan. The browser canvas and `vgpu/node` headless target execute the same instanced asset, fog, obstruction-shadow, light-accumulation, composite, and present passes.

Headless rendering defaults to Dawn's automatic adapter locally and the software adapter on Linux. Render artifacts are generated under `artifacts/` and are not committed.

Read `../../docs/v2-rebuild-plan.md` before changing architecture or persistence behavior.
