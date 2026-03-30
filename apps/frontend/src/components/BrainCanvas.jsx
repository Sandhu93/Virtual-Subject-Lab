import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Thin React wrapper around the imperative BrainViewer WebGL API (viewer.js).
 * The parent receives an imperative handle via ref:
 *   ref.current.setRunConfig / setThreshold / setHemisphere / setParcelOverlay
 *   ref.current.setTimeIndex / play / pause / snapshot
 */
const BrainCanvas = forwardRef(function BrainCanvas({ onTimeChange }, ref) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);

  // Expose imperative API to parent (runs during layout phase, before passive effects)
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

  // Initialize the WebGL viewer once (runs before parent passive effects — children first)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.BrainViewer) return;
    viewerRef.current = window.BrainViewer.init(canvas);

    const handler = (e) => onTimeChange?.(e.detail.timeIndex);
    canvas.addEventListener("viewer-timechange", handler);

    return () => {
      canvas.removeEventListener("viewer-timechange", handler);
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      width={720}
      height={400}
      style={{ width: "100%", borderRadius: 8, cursor: "grab", display: "block" }}
      aria-label="WebGL cortical surface viewer"
    />
  );
});

export default BrainCanvas;
