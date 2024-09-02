import Konva from "konva";
import { useState, useEffect, DependencyList, useRef } from "react";

export function useKeyPress(targetKey: string) {
  // State for keeping track of whether key is pressed
  const [keyPressed, setKeyPressed] = useState(false);

  // Add event listeners
  useEffect(() => {
    // If pressed key is our target key then set to true
    function downHandler({ key }: KeyboardEvent) {
      if (key === targetKey) {
        setKeyPressed(true);
      }
    }

    // If released key is our target key then set to false
    const upHandler = ({ key }: KeyboardEvent) => {
      if (key === targetKey) {
        setKeyPressed(false);
      }
    };

    window.addEventListener("keydown", downHandler);
    window.addEventListener("keyup", upHandler);
    // Remove event listeners on cleanup
    return () => {
      window.removeEventListener("keydown", downHandler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [setKeyPressed, targetKey]); // Empty array ensures that effect is only run on mount and unmount

  return keyPressed;
}

export function useThrottledMemo<T>(
  factory: () => T,
  deps: DependencyList,
  delayMs: number
) {
  const [value, setValue] = useState(factory);
  const lastUpdatedRef = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | number>();

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdatedRef.current;

    if (timeSinceLastUpdate >= delayMs) {
      setValue(factory);
      lastUpdatedRef.current = now;
    } else {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setValue(factory);
        lastUpdatedRef.current = Date.now();
      }, delayMs - timeSinceLastUpdate);
    }

    return () => clearTimeout(timeoutRef.current);
  }, [...deps, delayMs]);

  return value;
}

export function useStageClick(
  node: Konva.Node | undefined,
  onClick: () => void,
  refs: Array<unknown> = []
) {
  useEffect(() => {
    if (!node) return;
    const stage = node.getStage();
    if (!stage) return;

    let isClick = false;

    function onParentMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
      if (e.target === stage) {
        isClick = true;
      }
    }

    function onParentMouseUp() {
      if (isClick) {
        onClick();
      }
      isClick = false;
    }
    stage.on("click.konva", onParentMouseUp);
    stage.on("mousedown.konva", onParentMouseDown);
    return () => {
      stage.off("click.konva", onParentMouseUp);
      stage.off("mousedown.konva", onParentMouseDown);
    };
  }, [node, onClick, ...refs]);
}

export function generateArucoMarker(id: number, border?: string) {
  if (id < 0 || id > 1023) {
    throw new RangeError("Marker ID must be in the range [0..1023]");
  }

  const ids = [16, 23, 9, 14];
  let index = 0,
    val = 0,
    x = 0,
    y = 0;
  const marker = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];

  for (y = 0; y < 5; y++) {
    index = (id >> (2 * (4 - y))) & 3;
    val = ids[index];
    for (x = 0; x < 5; x++) {
      marker[x][y] = (val >> (4 - x)) & 1;
    }
  }

  x = 0;
  y = 0;
  let image = "";

  image =
    '<svg viewBox="0 0 7 7" version="1.1" xmlns="http://www.w3.org/2000/svg">\n' +
    `  <rect x="0" y="0" width="7" height="7" fill="white"${border ? ` stroke="${border}" stroke-width="0.5"` : ''}/>\n`;

  for (y = 0; y < 5; y++) {
    for (x = 0; x < 5; x++) {
      if (marker[x][y] === 1) {
        image +=
          '  <rect x="' +
          (x + 1) +
          '" y="' +
          (y + 1) +
          '" width="1" height="1" fill="black" ' +
          // Slight stroke to get around aliasing issues with adjacent rectangles
          'stroke="black" stroke-width="0.01" />\n';
      }
    }
  }

  image += "</svg>";

  return image;
}
