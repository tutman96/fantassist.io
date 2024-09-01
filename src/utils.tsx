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
    const stage = node.getStage()!;

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
