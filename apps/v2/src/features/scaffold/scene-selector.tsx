"use client";

import { useState } from "react";
import { Check, ChevronDown, FilePlus2, Search, Upload } from "lucide-react";

export function SceneSelector() {
  const [query, setQuery] = useState("");
  const matches = "astral clearing".includes(query.trim().toLowerCase());

  return (
    <details className="group relative min-w-0">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 px-1 marker:hidden focus-visible:outline-2 focus-visible:outline-blue-400">
        <span className="truncate font-heading text-[15px] font-medium tracking-wide text-amber-50/90">
          Astral Clearing
        </span>
        <ChevronDown className="size-3 shrink-0 text-violet-200/40 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <button
        type="button"
        aria-label="Close scene selector"
        onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
        className="fixed top-12 right-0 bottom-0 left-0 z-30 hidden cursor-default bg-[#02030a]/55 backdrop-blur-[2px] group-open:block"
      />
      <div className="absolute top-10 left-0 z-40 w-72 border border-violet-300/15 bg-[#100d20]/98 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl max-sm:fixed max-sm:top-14 max-sm:right-3 max-sm:left-3 max-sm:w-auto">
        <div className="flex items-center justify-between px-2 py-1.5">
          <div>
            <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-200/60 uppercase">Prototype campaign</p>
            <p className="mt-0.5 text-[10px] text-amber-50/65">Scenes are not persisted yet</p>
          </div>
          <span className="border border-amber-200/20 bg-amber-100/5 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-amber-100/60 uppercase">Local</span>
        </div>
        <label className="mt-1 flex h-9 items-center gap-2 border border-violet-300/12 bg-black/20 px-2.5 focus-within:border-blue-300/35">
          <Search className="size-3.5 text-violet-200/55" aria-hidden="true" />
          <span className="sr-only">Search scenes</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search scenes"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-violet-50 outline-none placeholder:text-violet-100/45"
          />
        </label>
        {matches ? (
          <button type="button" className="mt-1 flex w-full items-center gap-3 border border-blue-300/20 bg-blue-500/10 px-2.5 py-2.5 text-left">
            <span className="grid size-7 place-items-center border border-blue-300/20 bg-blue-400/10 text-blue-200">
              <Check className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-heading text-sm text-amber-50">Astral Clearing</span>
              <span className="block font-mono text-[9px] tracking-wide text-violet-200/55 uppercase">Prototype scene</span>
            </span>
          </button>
        ) : (
          <p className="mt-1 border border-dashed border-violet-300/15 px-3 py-4 text-center text-[10px] text-violet-100/55">
            No matching prototype scene
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-1 border-t border-violet-300/10 pt-2">
          <button disabled type="button" title="Scene persistence is not available yet" className="flex h-8 cursor-not-allowed items-center justify-center gap-1.5 border border-violet-300/12 text-[10px] text-violet-100/40">
            <FilePlus2 className="size-3" aria-hidden="true" /> New scene
          </button>
          <button disabled type="button" title="Scene import is not available yet" className="flex h-8 cursor-not-allowed items-center justify-center gap-1.5 border border-violet-300/12 text-[10px] text-violet-100/40">
            <Upload className="size-3" aria-hidden="true" /> Import
          </button>
        </div>
      </div>
    </details>
  );
}
