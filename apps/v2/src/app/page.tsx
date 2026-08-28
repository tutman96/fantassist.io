import { ExternalLink, Radio, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { GpuViewport } from "@/features/scaffold/gpu-viewport";

export default function Home() {
  return (
    <main className="relative h-svh overflow-hidden bg-[#050713] text-white">
      <GpuViewport profile="editor" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-amber-100/10 bg-[#090817]/90 px-4 shadow-[0_16px_50px_rgba(2,4,14,0.4)] backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative grid size-10 shrink-0 place-items-center">
            <div className="absolute inset-0 rotate-12 bg-violet-500/20 blur-lg" />
            <FacetMark />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[11px] font-semibold tracking-[0.18em] text-violet-100 uppercase sm:text-xs">
                Fantassist
              </h1>
              <span className="hidden text-violet-300/30 sm:inline">/</span>
              <span className="hidden font-mono text-[9px] tracking-[0.15em] text-violet-200/45 uppercase sm:inline">
                Dungeon canvas
              </span>
            </div>
            <p className="mt-0.5 truncate font-heading text-[15px] font-medium tracking-wide text-amber-50/85">Astral Clearing</p>
          </div>
        </div>

        <div className="pointer-events-auto absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 lg:flex">
          <div className="flex h-8 items-center gap-2 border border-amber-100/10 bg-amber-50/5 px-3">
            <Sparkles className="size-3 text-fuchsia-300" aria-hidden="true" />
            <span className="font-mono text-[9px] tracking-[0.2em] text-violet-100/60 uppercase">
              Enchanted table
            </span>
          </div>
        </div>

        <nav className="pointer-events-auto flex items-center gap-2 text-[10px] text-white/60" aria-label="Application">
          <Link className="hidden px-2 py-1.5 tracking-[0.14em] uppercase hover:text-violet-200 sm:block" href="/beta">
            Beta
          </Link>
          <Link
            aria-label="Open table output"
            className="group flex h-9 items-center gap-2 border border-amber-100/15 bg-gradient-to-r from-blue-500/10 via-violet-500/15 to-fuchsia-500/10 px-3 font-medium text-amber-50 transition hover:border-amber-100/30 hover:from-blue-500/20 hover:to-fuchsia-500/20"
            href="/table"
            target="_blank"
          >
            <Radio className="size-3.5 text-fuchsia-300" aria-hidden="true" />
            <span className="hidden text-[10px] tracking-wide sm:inline">Open table</span>
            <ExternalLink className="size-3 opacity-50 transition group-hover:opacity-100" aria-hidden="true" />
          </Link>
        </nav>
      </header>
    </main>
  );
}

function FacetMark() {
  return (
    <Image
      src="/fantassist-mark.png"
      width={40}
      height={40}
      priority
      alt=""
      className="relative size-10 object-contain drop-shadow-[0_0_10px_rgba(129,92,246,0.45)]"
    />
  );
}
