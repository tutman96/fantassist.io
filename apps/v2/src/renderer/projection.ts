import {
  getTableBounds,
  normalizeDisplayConfiguration,
  normalizeTableCamera,
} from "@/engine/table-camera";
import type {
  DisplayConfiguration,
  EditorCamera,
  GridPoint,
  Size,
  TableCamera,
} from "@/engine/table-camera";

export type RenderView =
  | {
      readonly kind: "editor";
      readonly camera: EditorCamera;
      readonly viewportCss: Size;
      readonly table: TableCamera;
      readonly display: DisplayConfiguration;
    }
  | {
      readonly kind: "output";
      readonly table: TableCamera;
      readonly display: DisplayConfiguration;
    };

export interface CompiledProjection {
  readonly pixelsPerGrid: number;
  readonly gridToTargetOffset: GridPoint;
  readonly targetToGridOffset: GridPoint;
  readonly contentMinPx: GridPoint;
  readonly contentMaxPx: GridPoint;
  readonly tableMinGrid: GridPoint;
  readonly tableMaxGrid: GridPoint;
  readonly targetPx: Size;
}

export function compileProjection(view: RenderView, targetPx: Size): CompiledProjection {
  const display = normalizeDisplayConfiguration(view.display);
  const table = normalizeTableCamera(view.table);
  const bounds = getTableBounds(table, display);
  let pixelsPerGrid: number;
  let gridToTargetOffset: GridPoint;
  let contentMinPx = { x: 0, y: 0 };
  let contentMaxPx = { x: targetPx.width, y: targetPx.height };

  if (view.kind === "editor") {
    const cssToTarget = Math.min(
      targetPx.width / Math.max(view.viewportCss.width, 1),
      targetPx.height / Math.max(view.viewportCss.height, 1)
    );
    pixelsPerGrid = view.camera.cssPixelsPerGrid * cssToTarget;
    gridToTargetOffset = {
      x: targetPx.width / 2 - view.camera.centerGrid.x * pixelsPerGrid,
      y: targetPx.height / 2 - view.camera.centerGrid.y * pixelsPerGrid,
    };
  } else {
    pixelsPerGrid = Math.min(targetPx.width / bounds.width, targetPx.height / bounds.height);
    const contentWidth = bounds.width * pixelsPerGrid;
    const contentHeight = bounds.height * pixelsPerGrid;
    contentMinPx = { x: (targetPx.width - contentWidth) / 2, y: (targetPx.height - contentHeight) / 2 };
    contentMaxPx = { x: contentMinPx.x + contentWidth, y: contentMinPx.y + contentHeight };
    gridToTargetOffset = {
      x: contentMinPx.x - bounds.left * pixelsPerGrid,
      y: contentMinPx.y - bounds.top * pixelsPerGrid,
    };
  }

  return {
    pixelsPerGrid,
    gridToTargetOffset,
    targetToGridOffset: {
      x: -gridToTargetOffset.x / pixelsPerGrid,
      y: -gridToTargetOffset.y / pixelsPerGrid,
    },
    contentMinPx,
    contentMaxPx,
    tableMinGrid: { x: bounds.left, y: bounds.top },
    tableMaxGrid: { x: bounds.right, y: bounds.bottom },
    targetPx,
  };
}

export function gridToTargetPx(point: GridPoint, projection: CompiledProjection): GridPoint {
  return {
    x: point.x * projection.pixelsPerGrid + projection.gridToTargetOffset.x,
    y: point.y * projection.pixelsPerGrid + projection.gridToTargetOffset.y,
  };
}

export function targetPxToGrid(point: GridPoint, projection: CompiledProjection): GridPoint {
  return {
    x: point.x / projection.pixelsPerGrid + projection.targetToGridOffset.x,
    y: point.y / projection.pixelsPerGrid + projection.targetToGridOffset.y,
  };
}

export function projectionUniforms(projection: CompiledProjection) {
  return {
    target_size: [projection.targetPx.width, projection.targetPx.height] as const,
    grid_to_target_offset: [
      projection.gridToTargetOffset.x,
      projection.gridToTargetOffset.y,
    ] as const,
    target_to_grid_offset: [
      projection.targetToGridOffset.x,
      projection.targetToGridOffset.y,
    ] as const,
    content_min: [projection.contentMinPx.x, projection.contentMinPx.y] as const,
    content_max: [projection.contentMaxPx.x, projection.contentMaxPx.y] as const,
    table_min: [projection.tableMinGrid.x, projection.tableMinGrid.y] as const,
    table_max: [projection.tableMaxGrid.x, projection.tableMaxGrid.y] as const,
    pixels_per_grid: projection.pixelsPerGrid,
  };
}
