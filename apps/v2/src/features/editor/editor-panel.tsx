"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function EditorPanel({
  children,
  className,
  contentClassName,
  detail,
  eyebrow,
  icon,
  onOpenChange,
  open,
  title,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly detail: string;
  readonly eyebrow: string;
  readonly icon: React.ReactNode;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly title: string;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        "group absolute z-10 overflow-hidden border border-violet-300/15 bg-[#100d20]/94 text-white shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl",
        className
      )}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-auto w-full justify-between gap-4 overflow-hidden rounded-none border-b border-violet-300/10 px-3 py-2.5 text-left hover:bg-violet-400/5 hover:text-white"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-400 via-violet-400 to-amber-300" />
          <span className="absolute -top-8 -right-5 size-24 rotate-12 bg-violet-500/10 blur-2xl" />
          <span className="relative min-w-0 flex-1">
            <span className="block font-mono text-[9px] font-medium tracking-[0.12em] text-amber-100/60 uppercase">{eyebrow}</span>
            <span className="mt-0.5 block truncate font-heading text-lg font-semibold tracking-wide text-amber-50" title={title}>{title}</span>
            <span className="mt-0.5 block truncate font-mono text-[9px] tracking-wide text-violet-200/55 uppercase" title={detail}>{detail}</span>
          </span>
          <span className="relative flex shrink-0 items-center gap-2 text-fuchsia-300/70 [&_svg]:size-4">
            {icon}
            <ChevronDown className={cn("size-3! text-violet-200/45 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ScrollArea className={contentClassName}>{children}</ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium tracking-[0.1em] text-violet-100/55 uppercase">{label}</p>
      <p className="mt-1 font-mono text-[10px] text-violet-100/85">{value}</p>
    </div>
  );
}
