import { CloudRain, Flame } from "lucide-react";

import type { EffectTool } from "@/features/editor/editor-tool";

export function EffectIcon({ effect, ...props }: { readonly effect: EffectTool } & React.ComponentProps<"svg">) {
  switch (effect) {
    case "rain": return <CloudRain {...props} />;
    case "embers": return <Flame {...props} />;
    default: return assertNever(effect);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported effect '${value}'`);
}
