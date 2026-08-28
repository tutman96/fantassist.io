import Link from "next/link";
import { ArrowLeft, FlaskConical, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StableVersionButton } from "@/features/versioning/version-switch";

export default function BetaPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/30 sm:p-10">
        <Badge variant="outline" className="border-primary/30 text-primary">
          <FlaskConical aria-hidden="true" />
          Beta active
        </Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">
          You are using Fantassist v2.
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          Your campaigns and scenes remain in the same browser storage. Return
          to the stable application whenever you need the current editor.
        </p>

        <div className="mt-8 grid gap-3">
          <StableVersionButton />
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
              Continue in beta
            </Link>
          </Button>
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          Switching reloads other Fantassist tabs and closes the active table
          output to prevent mixed-version edits.
        </div>
      </section>
    </main>
  );
}
