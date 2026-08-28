import { EditorSceneProvider } from "@/features/scenes/editor-scene-context";
import { TableSessionProvider } from "@/features/table/table-session-context";

export default function CampaignsLayout({ children }: LayoutProps<"/campaigns">) {
  return (
    <TableSessionProvider>
      <EditorSceneProvider>{children}</EditorSceneProvider>
    </TableSessionProvider>
  );
}
