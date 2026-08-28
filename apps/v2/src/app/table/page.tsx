import { TableOutput } from "@/features/table/table-output";
import { TableSessionProvider } from "@/features/table/table-session-context";

export default async function TablePage({ searchParams }: {
  readonly searchParams: Promise<{ readonly fullscreen?: string }>;
}) {
  const fullscreenRequired = (await searchParams).fullscreen === "auto";
  return (
    <main className="flex h-svh overflow-hidden bg-black">
      <TableSessionProvider>
        <TableOutput fullscreenRequired={fullscreenRequired} />
      </TableSessionProvider>
    </main>
  );
}
