import Image from "next/image";
import Link from "next/link";

import { GpuViewport } from "@/features/editor/gpu-viewport";
import { SceneSelector } from "@/features/scenes/scene-selector";
import { DisplayedSceneControl } from "@/features/scenes/displayed-scene-control";
import { TableMenu } from "@/features/table/table-menu";

export function EditorShell() {
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#050713] text-white">
        <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-violet-300/12 bg-[#090817] px-3 shadow-[0_10px_30px_rgba(2,4,14,0.32)] sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
            <Link href="/campaigns" className="group/logo relative grid size-8 shrink-0 place-items-center" aria-label="Campaign observatory">
              <span className="absolute inset-0 rotate-12 bg-violet-500/0 blur-lg transition-colors duration-300 group-hover/logo:bg-violet-500/25" aria-hidden="true" />
              <Image
                src="/fantassist-mark-outlined.png"
                width={32}
                height={32}
                priority
                alt="Fantassist"
                className="absolute size-8 object-contain p-0.5 opacity-100 transition-opacity duration-300 group-hover/logo:opacity-0"
              />
              <Image
                src="/fantassist-mark.png"
                width={32}
                height={32}
                priority
                alt=""
                className="absolute size-8 object-contain opacity-0 drop-shadow-[0_0_8px_rgba(129,92,246,0.5)] transition-opacity duration-300 group-hover/logo:opacity-100"
              />
            </Link>
            <h1 className="sr-only text-[10px] font-semibold tracking-[0.2em] text-violet-100/75 uppercase sm:not-sr-only">Fantassist</h1>
            <span className="hidden h-4 w-px bg-violet-300/15 sm:block" />
            <SceneSelector />
          </div>

          <div className="absolute left-1/2 -translate-x-1/2">
            <DisplayedSceneControl />
          </div>

          <nav className="flex items-center gap-1.5 text-[10px] text-white/60" aria-label="Application">
            <Link className="hidden px-2 py-1.5 font-mono text-[9px] font-medium tracking-[0.12em] uppercase transition hover:text-violet-200 sm:block" href="/beta">
              Beta
            </Link>
            <TableMenu />
          </nav>
        </header>

        <section className="relative min-h-0 flex-1" aria-label="Scene workspace">
          <GpuViewport profile="editor" />
        </section>
    </main>
  );
}
