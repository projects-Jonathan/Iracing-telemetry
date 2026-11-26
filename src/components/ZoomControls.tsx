import { useRef } from 'react';
import { setZoom } from '../state/actions';

const MIN_SPAN = 100; // metres visible at most zoom

/** Clamp a [start, end] window inside the lap; a window covering the whole lap means "no zoom". */
function clampView(a: number, b: number, length: number): [number, number] | null {
  const span = Math.min(length, Math.max(MIN_SPAN, b - a));
  if (span >= length - 1) return null;
  const start = Math.max(0, Math.min(length - span, a));
  return [start, start + span];
}

/** − / + / Fit buttons: zoom 2× around the middle of the current view. */
export function ZoomButtons({ length, zoom }: { length: number; zoom: [number, number] | null }) {
  const [d0, d1] = zoom ?? [0, length];
  const mid = (d0 + d1) / 2, span = d1 - d0;
  const zoomBy = (f: number) => setZoom(clampView(mid - (span * f) / 2, mid + (span * f) / 2, length));
  return (
    <div className="zoom-btns" role="group" aria-label="Graph zoom">
      <button className="btn icon" onClick={() => zoomBy(2)} disabled={!zoom} aria-label="Zoom out" title="Zoom out">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <button className="btn icon" onClick={() => zoomBy(0.5)} disabled={span <= MIN_SPAN + 1} aria-label="Zoom in" title="Zoom in">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <button className="btn" onClick={() => setZoom(null)} disabled={!zoom} title="Show the whole lap">Fit</button>
    </div>
  );
}

/** Horizontal scroll bar for panning a zoomed graph: drag the thumb, or click the track to page. */
export function PanBar({ length, zoom }: { length: number; zoom: [number, number] | null }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; d0: number } | null>(null);
  const [d0, d1] = zoom ?? [0, length];
  const span = d1 - d0;
  const panTo = (start: number) => { if (zoom) setZoom(clampView(start, start + span, length)); };
  const pxToM = (px: number) => (px / (track.current?.clientWidth || 1)) * length;

  return (
    <div
      className={`panbar ${zoom ? '' : 'idle'}`}
      ref={track}
      role="scrollbar"
      aria-orientation="horizontal"
      aria-label="Pan along the lap"
      aria-valuemin={0}
      aria-valuemax={Math.round(length - span)}
      aria-valuenow={Math.round(d0)}
      tabIndex={zoom ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); panTo(d0 - span * 0.1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); panTo(d0 + span * 0.1); }
      }}
      onPointerDown={(e) => {
        // click on the track (not the thumb): page one screen towards the click
        if (!zoom || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        const at = pxToM(e.clientX - r.left);
        panTo(at < d0 ? d0 - span : d0 + span);
      }}
    >
      <div
        className="panbar-thumb"
        style={{ left: `${(d0 / length) * 100}%`, width: `${(span / length) * 100}%` }}
        onPointerDown={(e) => {
          if (!zoom) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, d0 };
        }}
        onPointerMove={(e) => { if (drag.current) panTo(drag.current.d0 + pxToM(e.clientX - drag.current.x)); }}
        onPointerUp={() => { drag.current = null; }}
      />
    </div>
  );
}

/** Shift + wheel (or a sideways trackpad swipe) over the graph pans a zoomed view. */
export function wheelPan(e: WheelEvent, length: number, zoom: [number, number] | null) {
  if (!zoom) return;
  const dx = e.shiftKey ? e.deltaY : e.deltaX;
  if (!dx) return;
  e.preventDefault();
  const span = zoom[1] - zoom[0];
  setZoom(clampView(zoom[0] + (dx / 600) * span, zoom[0] + (dx / 600) * span + span, length));
}
