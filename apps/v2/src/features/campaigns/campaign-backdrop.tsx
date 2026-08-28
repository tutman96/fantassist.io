"use client";

import { usePathname } from "next/navigation";

import { CosmicBackgroundCanvas } from "@/features/campaigns/cosmic-background-canvas";

export function CampaignBackdrop() {
  const pathname = usePathname();
  const visible = pathname === "/" || (pathname.startsWith("/campaigns") && !pathname.includes("/scenes/"));

  return (
    <div className={`pointer-events-none fixed inset-0 overflow-hidden ${visible ? "visible" : "invisible"}`} aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(91,33,182,0.2),transparent_35%),linear-gradient(145deg,#03040c_0%,#07091c_48%,#12091c_100%)]" />
      <CosmicBackgroundCanvas active={visible} />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(129,140,248,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.025)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
    </div>
  );
}
