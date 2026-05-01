import type { CSSProperties, RefObject } from "react";
import { useEffect, useMemo, useState } from "react";

export type CameraOrientation = "landscape" | "portrait" | "square";

export interface CameraFrame {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: CameraOrientation;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface AdaptiveVideoLayout {
  style: CSSProperties;
  viewport: ViewportSize;
}

export const DEFAULT_CAMERA_FRAME: CameraFrame = createCameraFrame(16, 9);

function getViewportSize(): ViewportSize {
  const visualViewport = window.visualViewport;

  return {
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight
  };
}

function getCameraOrientation(width: number, height: number): CameraOrientation {
  if (Math.abs(width - height) <= 2) return "square";
  return width > height ? "landscape" : "portrait";
}

export function createCameraFrame(width: number, height: number): CameraFrame {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  return {
    width: safeWidth,
    height: safeHeight,
    aspectRatio: safeWidth / safeHeight,
    orientation: getCameraOrientation(safeWidth, safeHeight)
  };
}

export function useAdaptiveVideoLayout(
  containerRef: RefObject<HTMLElement | null>,
  frame: CameraFrame
): AdaptiveVideoLayout {
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewport, setViewport] = useState<ViewportSize>(() => getViewportSize());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setContainerWidth(Math.round(entry.contentRect.width));
    });

    observer.observe(container);
    setContainerWidth(Math.round(container.getBoundingClientRect().width));

    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    function syncViewport() {
      setViewport(getViewportSize());
    }

    const visualViewport = window.visualViewport;

    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    visualViewport?.addEventListener("resize", syncViewport);

    syncViewport();

    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
      visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, []);

  const style = useMemo<CSSProperties>(() => {
    const aspectRatio = Number.isFinite(frame.aspectRatio)
      ? Math.max(0.1, frame.aspectRatio)
      : DEFAULT_CAMERA_FRAME.aspectRatio;

    const availableWidth = Math.max(
      280,
      containerWidth || Math.min(viewport.width - 32, 1180)
    );

    const compactLayout = viewport.width <= 920;
    const phonePortrait =
      viewport.width <= 560 && viewport.height > viewport.width;
    const landscapeViewport = viewport.width > viewport.height;
    const viewportHeightRatio = phonePortrait
      ? frame.orientation === "portrait"
        ? 0.62
        : 0.42
      : compactLayout
        ? landscapeViewport
          ? 0.72
          : 0.64
        : 0.78;

    const maxHeight = Math.max(
      phonePortrait
        ? frame.orientation === "portrait"
          ? 300
          : 220
        : compactLayout
          ? 280
          : 360,
      Math.min(viewport.height * viewportHeightRatio, 820)
    );

    let width = availableWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    if (width > availableWidth) {
      width = availableWidth;
      height = width / aspectRatio;
    }

    return {
      "--camera-aspect-ratio": `${frame.width} / ${frame.height}`,
      height: `${Math.round(height)}px`,
      maxWidth: "100%",
      width: `${Math.round(width)}px`
    } as CSSProperties;
  }, [containerWidth, frame, viewport]);

  return { style, viewport };
}
