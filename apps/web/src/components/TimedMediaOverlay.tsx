import { useEffect, useRef, type CSSProperties } from "react";
import type { AnimationAsset } from "../lib/animationRegistry";

interface Props {
  asset: AnimationAsset;
  onDone: () => void;
}

const OVERLAY_FAILSAFE_BUFFER_MS = 1000;

export function TimedMediaOverlay({ asset, onDone }: Props) {
  const doneRef = useRef(onDone);
  const frameStyle = {
    "--media-duration": `${asset.durationMs}ms`
  } as CSSProperties;

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      doneRef.current();
    }, asset.durationMs + OVERLAY_FAILSAFE_BUFFER_MS);

    return () => window.clearTimeout(timeoutId);
  }, [asset]);

  function finishOverlay() {
    doneRef.current();
  }

  return (
    <div className="timed-media-overlay" aria-hidden="true">
      <div
        className="timed-media-frame"
        style={frameStyle}
        onAnimationEnd={finishOverlay}
      >
        {asset.mediaType === "video" ? (
          <video
            className="timed-media-content"
            src={asset.src}
            autoPlay
            muted
            playsInline
            preload="auto"
            controls={false}
            onError={finishOverlay}
            onStalled={finishOverlay}
          />
        ) : (
          <img
            className="timed-media-content"
            src={asset.src}
            alt=""
            draggable={false}
            onError={finishOverlay}
          />
        )}
      </div>
    </div>
  );
}
