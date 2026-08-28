"use client";

import { createContext, useContext, useState } from "react";

import { createTableSession } from "@/engine/table-session";
import type { TableSession } from "@/engine/table-session";

const TableSessionContext = createContext<TableSession | null>(null);

export function TableSessionProvider({ children }: { readonly children: React.ReactNode }) {
  const [session] = useState(createTableSession);
  return <TableSessionContext value={session}>{children}</TableSessionContext>;
}

export function useSharedTableSession(): TableSession | null {
  return useContext(TableSessionContext);
}
