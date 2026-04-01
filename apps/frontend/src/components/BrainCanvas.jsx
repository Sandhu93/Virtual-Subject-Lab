import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

function requestFullscreen(element) {
  if (!element) return Promise.resolve();
  if (element.requestFullscreen) return element.requestFullscreen();
  return Promise.resolve();
}

function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  return Promise.resolve();
}

/**
 * Thin React wrapper around the imperative BrainViewer WebGL API (viewer.js).
 * The parent receives an imperative handle via ref:
 *   ref.current.setRunConfig / setThreshold / setHemisphere / setParcelOverlay
 *   ref.current.setTimeIndex / play / pause / snapshot
 */
const BrainCanvas = forwardRef(function BrainCanvas({ onTimeChange, frameRois = [], threshold = 0, timeIndex = 0 }, ref) {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const onTimeChangeRef = useRef(onTimeChange);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState({
    state: "initializing",
    message: "Initializing brain viewer...",
  });

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  useImperativeHandle(
    ref,
    () => ({
      setRunConfig: (...args) => viewerRef.current?.setRunConfig(...args),
      setThreshold: (v) => viewerRef.current?.setThreshold(v),
      setHemisphere: (v) => viewerRef.current?.setHemisphere(v),
      setParcelOverlay: (v) => viewerRef.current?.setParcelOverlay(v),
      setTimeIndex: (v) => viewerRef.current?.setTimeIndex(v),
      play: () => viewerRef.current?.play(),
      pause: () => viewerRef.current?.pause(),
      snapshot: () => viewerRef.current?.snapshot(),
    }),
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    let initTimer = null;

    const handleTimeChange = (e) => onTimeChangeRef.current?.(e.detail.timeIndex);
    const handleStatus = (e) => {
      if (cancelled) return;
      setStatus(e.detail);
      if (e.detail.state === "ready") {
        setHasRenderedFrame(true);
      }
    };

    canvas.addEventListener("viewer-timechange", handleTimeChange);
    canvas.addEventListener("viewer-status", handleStatus);

    const initViewer = () => {
      if (cancelled) return;
      if (!window.BrainViewer) {
        initTimer = window.setTimeout(initViewer, 50);
        return;
      }

      try {
        viewerRef.current = window.BrainViewer.init(canvas);
        if (!viewerRef.current && !cancelled) {
          setStatus({ state: "error", message: "Brain viewer failed to initialize." });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            state: "error",
            message: error instanceof Error ? error.message : "Brain viewer crashed during setup.",
          });
        }
      }
    };

    initViewer();

    return () => {
      cancelled = true;
      if (initTimer) window.clearTimeout(initTimer);
      canvas.removeEventListener("viewer-timechange", handleTimeChange);
      canvas.removeEventListener("viewer-status", handleStatus);
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = document.fullscreenElement === shellRef.current;
      setIsFullscreen(fullscreen);
      window.setTimeout(() => viewerRef.current?.resize?.(), 0);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function handleCanvasClick() {
    if (isFullscreen || status.state === "error") return;
    try {
      await requestFullscreen(shellRef.current);
    } catch {
      // Ignore browser fullscreen permission failures.
    }
  }

  async function handleExitFullscreen(e) {
    e.stopPropagation();
    await exitFullscreen();
  }

  const showOverlay =
    status.state === "error" ||
    !hasRenderedFrame ||
    status.state === "initializing" ||
    status.state === "mesh-loading";
  const isError = status.state === "error";
  const activatingNow = [...frameRois]
    .filter((item) => item.value >= threshold)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const suppressingNow = [...frameRois]
    .filter((item) => item.value <= -threshold)
    .sort((a, b) => a.value - b.value)
    .slice(0, 6);

  return (
    <div
      ref={shellRef}
      className={`brain-canvas-shell ${isFullscreen ? "brain-canvas-shell--fullscreen" : ""}`}
    >
      <canvas
        ref={canvasRef}
        width={720}
        height={400}
        style={{ width: "100%", borderRadius: 8, cursor: "grab", display: "block" }}
        id="brain-viewer"
        aria-label="WebGL cortical surface viewer"
        onClick={handleCanvasClick}
        title={isFullscreen ? "Drag to rotate. Press Escape to exit fullscreen." : "Click to enter fullscreen viewer."}
      />
      {!showOverlay && !isFullscreen && (
        <button
          type="button"
          className="brain-canvas-fullscreen-hint"
          onClick={handleCanvasClick}
        >
          Fullscreen
        </button>
      )}
      {isFullscreen && (
        <button
          type="button"
          className="brain-canvas-exit"
          onClick={handleExitFullscreen}
        >
          Exit fullscreen
        </button>
      )}
      {isFullscreen && !showOverlay && (
        <div className="brain-canvas-hud">
          <div className="brain-canvas-hud__card">
            <p className="brain-canvas-hud__eyebrow">Frame</p>
            <p className="brain-canvas-hud__value">{timeIndex}</p>
            <p className="brain-canvas-hud__meta">Threshold {threshold.toFixed(2)}</p>
          </div>
          <div className="brain-canvas-hud__card">
            <p className="brain-canvas-hud__eyebrow">Activating</p>
            {activatingNow.length === 0 ? (
              <p className="brain-canvas-hud__empty">No regions above threshold.</p>
            ) : (
              <ol className="brain-canvas-hud__list">
                {activatingNow.map((item) => (
                  <li key={item.roi_id} className="brain-canvas-hud__item">
                    <span className="brain-canvas-hud__label">{item.label}</span>
                    <span className="brain-canvas-hud__score">{item.value.toFixed(3)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="brain-canvas-hud__card">
            <p className="brain-canvas-hud__eyebrow">Suppressing</p>
            {suppressingNow.length === 0 ? (
              <p className="brain-canvas-hud__empty">No regions below threshold.</p>
            ) : (
              <ol className="brain-canvas-hud__list">
                {suppressingNow.map((item) => (
                  <li key={item.roi_id} className="brain-canvas-hud__item">
                    <span className="brain-canvas-hud__label">{item.label}</span>
                    <span className="brain-canvas-hud__score">{item.value.toFixed(3)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      {showOverlay && (
        <div className={`brain-canvas-overlay ${isError ? "brain-canvas-overlay--error" : ""}`}>
          {!isError && <span className="spinner" />}
          <div>
            <p className="brain-canvas-overlay__title">
              {isError ? "Viewer error" : "Preparing cortical viewer"}
            </p>
            <p className="brain-canvas-overlay__message">{status.message}</p>
          </div>
        </div>
      )}
    </div>
  );
});

export default BrainCanvas;
