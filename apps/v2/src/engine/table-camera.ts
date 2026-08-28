export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface GridBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface DisplayConfiguration {
  readonly resolutionPx: Size;
  readonly diagonalInches: number;
}

export interface PhysicalDisplay {
  readonly widthInches: number;
  readonly heightInches: number;
  readonly ppi: number;
}

export interface TableCamera {
  readonly originGrid: GridPoint;
  readonly scale: number;
  readonly displayGrid: boolean;
}

export interface EditorCamera {
  readonly centerGrid: GridPoint;
  readonly cssPixelsPerGrid: number;
}

export const DEFAULT_DISPLAY: DisplayConfiguration = Object.freeze({
  resolutionPx: Object.freeze({ width: 3840, height: 2160 }),
  diagonalInches: 45,
});

export const DEFAULT_TABLE_CAMERA: TableCamera = Object.freeze({
  originGrid: Object.freeze({ x: 0, y: 0 }),
  scale: 1,
  displayGrid: false,
});

export const MIN_EDITOR_ZOOM = 2;
export const MAX_EDITOR_ZOOM = 512;

const positiveOr = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
const finiteOr = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function normalizeDisplayConfiguration(
  value: Partial<DisplayConfiguration> | undefined
): DisplayConfiguration {
  return {
    resolutionPx: {
      width: positiveOr(value?.resolutionPx?.width, DEFAULT_DISPLAY.resolutionPx.width),
      height: positiveOr(value?.resolutionPx?.height, DEFAULT_DISPLAY.resolutionPx.height),
    },
    diagonalInches: positiveOr(value?.diagonalInches, DEFAULT_DISPLAY.diagonalInches),
  };
}

export function normalizeTableCamera(value: Partial<TableCamera> | undefined): TableCamera {
  return {
    originGrid: {
      x: finiteOr(value?.originGrid?.x, DEFAULT_TABLE_CAMERA.originGrid.x),
      y: finiteOr(value?.originGrid?.y, DEFAULT_TABLE_CAMERA.originGrid.y),
    },
    scale: positiveOr(value?.scale, DEFAULT_TABLE_CAMERA.scale),
    displayGrid: value?.displayGrid ?? DEFAULT_TABLE_CAMERA.displayGrid,
  };
}

export function derivePhysicalDisplay(displayValue?: Partial<DisplayConfiguration>): PhysicalDisplay {
  const display = normalizeDisplayConfiguration(displayValue);
  const pixelDiagonal = Math.hypot(display.resolutionPx.width, display.resolutionPx.height);
  return {
    widthInches: (display.diagonalInches * display.resolutionPx.width) / pixelDiagonal,
    heightInches: (display.diagonalInches * display.resolutionPx.height) / pixelDiagonal,
    ppi: pixelDiagonal / display.diagonalInches,
  };
}

export function getTableBounds(
  tableValue?: Partial<TableCamera>,
  displayValue?: Partial<DisplayConfiguration>
): GridBounds {
  const table = normalizeTableCamera(tableValue);
  const physical = derivePhysicalDisplay(displayValue);
  const width = physical.widthInches / table.scale;
  const height = physical.heightInches / table.scale;
  return {
    left: table.originGrid.x,
    top: table.originGrid.y,
    right: table.originGrid.x + width,
    bottom: table.originGrid.y + height,
    width,
    height,
  };
}

export function clampEditorZoom(value: number): number {
  return Math.min(MAX_EDITOR_ZOOM, Math.max(MIN_EDITOR_ZOOM, positiveOr(value, MIN_EDITOR_ZOOM)));
}

export function gridToEditorCss(
  point: GridPoint,
  camera: EditorCamera,
  viewportCss: Size
): GridPoint {
  return {
    x: viewportCss.width / 2 + (point.x - camera.centerGrid.x) * camera.cssPixelsPerGrid,
    y: viewportCss.height / 2 + (point.y - camera.centerGrid.y) * camera.cssPixelsPerGrid,
  };
}

export function editorCssToGrid(
  point: GridPoint,
  camera: EditorCamera,
  viewportCss: Size
): GridPoint {
  return {
    x: camera.centerGrid.x + (point.x - viewportCss.width / 2) / camera.cssPixelsPerGrid,
    y: camera.centerGrid.y + (point.y - viewportCss.height / 2) / camera.cssPixelsPerGrid,
  };
}

export function panEditorCamera(camera: EditorCamera, deltaCss: GridPoint): EditorCamera {
  return {
    centerGrid: {
      x: camera.centerGrid.x - deltaCss.x / camera.cssPixelsPerGrid,
      y: camera.centerGrid.y - deltaCss.y / camera.cssPixelsPerGrid,
    },
    cssPixelsPerGrid: camera.cssPixelsPerGrid,
  };
}

export function panZoomEditorCamera(
  camera: EditorCamera,
  previousCenterCss: GridPoint,
  centerCss: GridPoint,
  viewportCss: Size,
  factor: number
): EditorCamera {
  const panned = panEditorCamera(camera, {
    x: centerCss.x - previousCenterCss.x,
    y: centerCss.y - previousCenterCss.y,
  });
  return zoomEditorCameraAt(
    panned,
    centerCss,
    viewportCss,
    panned.cssPixelsPerGrid * factor
  );
}

export function zoomEditorCameraAt(
  camera: EditorCamera,
  pointerCss: GridPoint,
  viewportCss: Size,
  requestedZoom: number
): EditorCamera {
  const anchor = editorCssToGrid(pointerCss, camera, viewportCss);
  const zoom = clampEditorZoom(requestedZoom);
  return {
    centerGrid: {
      x: anchor.x - (pointerCss.x - viewportCss.width / 2) / zoom,
      y: anchor.y - (pointerCss.y - viewportCss.height / 2) / zoom,
    },
    cssPixelsPerGrid: zoom,
  };
}

export function fitTableCamera(
  bounds: GridBounds,
  viewportCss: Size,
  paddingCss = 40
): EditorCamera {
  const availableWidth = Math.max(viewportCss.width - paddingCss * 2, 1);
  const availableHeight = Math.max(viewportCss.height - paddingCss * 2, 1);
  return {
    centerGrid: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
    cssPixelsPerGrid: clampEditorZoom(
      Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
    ),
  };
}
