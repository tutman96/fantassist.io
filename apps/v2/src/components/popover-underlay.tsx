"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PopoverUnderlay({
  label,
  onClick,
  className,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "fixed top-12 right-0 bottom-0 left-0 z-30 h-auto w-auto cursor-default rounded-none border-0 bg-[#02030a]/55 p-0 backdrop-blur-[2px] hover:bg-[#02030a]/55! focus-visible:border-0 focus-visible:ring-0 active:translate-y-0! dark:hover:bg-[#02030a]/55!",
        className
      )}
    />
  );
}
