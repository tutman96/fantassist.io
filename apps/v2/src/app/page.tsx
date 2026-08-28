import { ArrowRight, Cpu, Layers3, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { GpuViewport } from "@/features/scaffold/gpu-viewport";

const foundations = [
  {
    icon: Cpu,
    title: "Engine-owned state",
    description: "Commands and immutable snapshots live outside React.",
  },
  {
    icon: Layers3,
    title: "Explicit render passes",
    description: "Editor and output profiles share one vgpu pipeline.",
  },
  {
    icon: Sparkles,
    title: "GPU composition",
    description: "Lighting, shadows, and fog will remain entirely in WGSL.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_28%),radial-gradient(circle_at_90%_18%,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-svh max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-border/70 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-md border border-primary/40 bg-primary/10 font-mono text-xs font-bold text-primary">
              FA
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] uppercase">
                Fantassist
              </p>
              <p className="text-xs text-muted-foreground">Scene engine v2</p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary">
            <Link href="/beta">Beta active</Link>
          </Badge>
        </header>

        <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-[34rem] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/40 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Output pipeline probe</p>
                <p className="text-xs text-muted-foreground">
                  Pixels below are rendered by vgpu
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                WebGPU lifecycle
              </div>
            </div>
            <GpuViewport profile="editor" />
          </div>

          <aside className="flex flex-col rounded-xl border border-border/80 bg-card/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
            <Badge className="w-fit">Scaffolding</Badge>
            <h1 className="mt-5 text-4xl leading-none font-semibold tracking-tight">
              Build the engine before the editor.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              This app is isolated from v1 so its runtime, interface, and GPU
              architecture can evolve without touching the stable deployment.
            </p>

            <Separator className="my-6" />

            <div className="space-y-5">
              {foundations.map(({ icon: Icon, title, description }) => (
                <div key={title} className="grid grid-cols-[2rem_1fr] gap-3">
                  <div className="grid size-8 place-items-center rounded-md bg-secondary text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-medium">{title}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-8">
              <Button className="w-full" asChild>
                <Link href="/table">
                  Open output probe
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <p className="mt-3 text-center font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                Scene compatibility comes next
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
