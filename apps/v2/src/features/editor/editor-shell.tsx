import Image from "next/image";
import Link from "next/link";

import { GpuViewport } from "@/features/editor/gpu-viewport";
import { SceneSelector } from "@/features/scenes/scene-selector";
import { EditorSceneProvider } from "@/features/scenes/editor-scene-context";
import { TableMenu } from "@/features/table/table-menu";
import { TableSessionProvider } from "@/features/table/table-session-context";

export function EditorShell() {
  return (
    <TableSessionProvider>
      <EditorSceneProvider>
        <main className="flex h-svh flex-col overflow-hidden bg-[#050713] text-white">
        <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-violet-300/12 bg-[#090817] px-3 shadow-[0_10px_30px_rgba(2,4,14,0.32)] sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
            <div className="relative grid size-8 shrink-0 place-items-center">
              <div className="absolute inset-0 rotate-12 bg-violet-500/20 blur-lg" />
              <Image
                src="/fantassist-mark.png"
                width={32}
                height={32}
                priority
                alt=""
                className="relative size-8 object-contain drop-shadow-[0_0_8px_rgba(129,92,246,0.45)]"
              />
            </div>
            <h1 className="sr-only text-[10px] font-semibold tracking-[0.2em] text-violet-100/75 uppercase sm:not-sr-only">
              Fantassist
            </h1>
            <span className="hidden h-4 w-px bg-violet-300/15 sm:block" />
            <SceneSelector />
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
      </EditorSceneProvider>
    </TableSessionProvider>
  );
}
