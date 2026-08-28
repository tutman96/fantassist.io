import Link from "next/link";
import { ArrowLeft, FlaskConical, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StableVersionButton } from "@/features/versioning/version-switch";

export default function BetaPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-xl border border-border shadow-2xl shadow-black/30 [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(10)]">
        <CardHeader>
          <Badge variant="outline" className="border-primary/30 text-primary">
            <FlaskConical aria-hidden="true" />
            Beta active
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight">You are using Fantassist v2.</h1>
          <p className="mt-3 leading-7 text-muted-foreground">
            Your campaigns and scenes remain in the same browser storage. Return
            to the stable application whenever you need the current editor.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <StableVersionButton />
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
              Continue in beta
            </Link>
          </Button>
        </CardContent>
        <CardFooter className="border-t-0 bg-transparent pt-0">
          <Alert className="bg-muted/40 p-4 text-muted-foreground">
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <AlertDescription>
              Switching reloads other Fantassist tabs and closes the active table
              output to prevent mixed-version edits.
            </AlertDescription>
          </Alert>
        </CardFooter>
      </Card>
    </main>
  );
}
