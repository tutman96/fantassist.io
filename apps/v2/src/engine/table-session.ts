import {
  DEFAULT_DISPLAY,
  DEFAULT_TABLE_CAMERA,
  fitTableCamera,
  getTableBounds,
  normalizeDisplayConfiguration,
  normalizeTableCamera,
  panEditorCamera,
  zoomEditorCameraAt,
} from "./table-camera";
import type {
  DisplayConfiguration,
  EditorCamera,
  GridPoint,
  Size,
  TableCamera,
} from "./table-camera";

export interface TableSessionSnapshot {
  readonly display: DisplayConfiguration;
  readonly table: TableCamera;
  readonly editorCamera: EditorCamera;
  readonly editorGridVisible: boolean;
  readonly viewportCss: Size;
}

export interface TableSession {
  getSnapshot(): TableSessionSnapshot;
  subscribe(listener: () => void): () => void;
  setViewport(viewportCss: Size): void;
  pan(deltaCss: GridPoint): void;
  zoomAt(pointerCss: GridPoint, factor: number): void;
  fitTable(): void;
  resetTable(): void;
  setEditorGridVisible(visible: boolean): void;
  updateConfiguration(value: {
    readonly display?: Partial<DisplayConfiguration>;
    readonly table?: Partial<TableCamera>;
  }): void;
}

export function createTableSession(): TableSession {
  const listeners = new Set<() => void>();
  let initialized = false;
  let snapshot: TableSessionSnapshot = {
    display: DEFAULT_DISPLAY,
    table: DEFAULT_TABLE_CAMERA,
    editorCamera: { centerGrid: { x: 0, y: 0 }, cssPixelsPerGrid: 32 },
    editorGridVisible: true,
    viewportCss: { width: 1, height: 1 },
  };
  const update = (next: TableSessionSnapshot) => {
    snapshot = Object.freeze(next);
    listeners.forEach((listener) => listener());
  };
  const fittedCamera = () =>
    fitTableCamera(getTableBounds(snapshot.table, snapshot.display), snapshot.viewportCss);
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setViewport(viewportCss) {
      if (viewportCss.width <= 0 || viewportCss.height <= 0) return;
      const next = { ...snapshot, viewportCss };
      snapshot = next;
      if (!initialized) {
        initialized = true;
        update({ ...next, editorCamera: fittedCamera() });
      } else {
        update(next);
      }
    },
    pan(deltaCss) {
      update({ ...snapshot, editorCamera: panEditorCamera(snapshot.editorCamera, deltaCss) });
    },
    zoomAt(pointerCss, factor) {
      update({
        ...snapshot,
        editorCamera: zoomEditorCameraAt(
          snapshot.editorCamera,
          pointerCss,
          snapshot.viewportCss,
          snapshot.editorCamera.cssPixelsPerGrid * factor
        ),
      });
    },
    fitTable() {
      update({ ...snapshot, editorCamera: fittedCamera() });
    },
    resetTable() {
      const table = DEFAULT_TABLE_CAMERA;
      const next = { ...snapshot, table };
      snapshot = next;
      update({ ...next, editorCamera: fittedCamera() });
    },
    setEditorGridVisible(editorGridVisible) {
      update({ ...snapshot, editorGridVisible });
    },
    updateConfiguration(value) {
      update({
        ...snapshot,
        display: value.display
          ? normalizeDisplayConfiguration({ ...snapshot.display, ...value.display })
          : snapshot.display,
        table: value.table
          ? normalizeTableCamera({ ...snapshot.table, ...value.table })
          : snapshot.table,
      });
    },
  };
}
