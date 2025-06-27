import { useState, useCallback, useRef, useEffect } from "react";

const MIN_WIDTH = 350;
const MAX_WIDTH_PERCENTAGE = 0.7;

export function useSidebarResizing(initialWidth: number) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const isResizingRef = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) {
      return;
    }
    const newWidth = window.innerWidth - e.clientX;
    const maxWidth = window.innerWidth * MAX_WIDTH_PERCENTAGE;

    if (newWidth > MIN_WIDTH && newWidth < maxWidth) {
      setSidebarWidth(newWidth);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [handleMouseMove, handleMouseUp],
  );

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return { sidebarWidth, handleMouseDown };
}
