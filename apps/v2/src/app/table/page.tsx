import { TableOutput } from "@/features/table/table-output";
import { TableSessionProvider } from "@/features/table/table-session-context";

export default function TablePage() {
  return (
    <main className="flex h-svh overflow-hidden bg-black">
      <TableSessionProvider>
        <TableOutput />
      </TableSessionProvider>
    </main>
  );
}
