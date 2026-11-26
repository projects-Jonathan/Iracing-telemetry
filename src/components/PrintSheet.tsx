import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setApp, useApp } from '../state/store';
import { currentLaps } from '../state/actions';
import { Chart } from './Chart';
import { fmtDelta, fmtDist, fmtLap, readColors, type Colors } from './util';

/**
 * Printable copy of the graph: one landscape page, light colours, high-resolution canvas.
 * Page content box is A4 landscape minus 10 mm margins: 277 × 190 mm ≈ 1047 × 718 CSS px.
 * The printout scales down to fit other paper sizes (see @media print in styles.css).
 */
const PAGE_W = 1047;
const PAGE_H = 718;
const KEY_H = 34; // title/key line above the chart

export function PrintSheet() {
  const printing = useApp((a) => a.printing);
  const panels = useApp((a) => a.panels);
  const zoom = useApp((a) => a.zoom);
  const sheet = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<Colors | null>(null);
  // true once the chart has actually painted its traces — the dialog must not open before this
  const [drawn, setDrawn] = useState(false);

  // Read the light colour tokens from the sheet itself (it carries .force-light).
  useLayoutEffect(() => {
    if (printing && sheet.current) setColors(readColors(sheet.current));
    if (!printing) { setColors(null); setDrawn(false); }
  }, [printing]);

  // Open the print dialog only after the chart reports it has drawn (the browser snapshots the page
  // the moment the dialog opens, so opening early prints an empty graph). Tidy up when it closes.
  useEffect(() => {
    if (!printing || !drawn) return;
    const finish = () => setApp({ printing: false });
    window.addEventListener('afterprint', finish);
    const id = requestAnimationFrame(() => window.print());
    return () => { cancelAnimationFrame(id); window.removeEventListener('afterprint', finish); };
  }, [printing, drawn]);

  if (!printing) return null;
  const { s, ref, cmp } = currentLaps();
  if (!s || !ref) return null;
  const gap = cmp && cmp.lap.time !== null && ref.lap.time !== null ? cmp.lap.time - ref.lap.time : null;

  return createPortal(
    <div className="print-sheet force-light" ref={sheet} style={{ width: PAGE_W }}>
      <div className="print-key">
        <strong>{s.track}{s.trackConfig ? ` · ${s.trackConfig}` : ''}</strong>
        <span>{s.car}</span>
        {cmp && <span><i className="sw cmp" /> Compare · lap {cmp.lap.num} · {fmtLap(cmp.lap.time)}</span>}
        <span><i className="sw ref" /> Reference · lap {ref.lap.num} · {fmtLap(ref.lap.time)}</span>
        {gap !== null && <span>Gap {fmtDelta(gap)} s</span>}
        <span className="print-range">{zoom ? `${fmtDist(zoom[0])} – ${fmtDist(zoom[1])}` : 'Full lap'}</span>
      </div>
      {colors && (
        <Chart
          s={s}
          ref_={ref}
          cmp={cmp}
          panels={panels}
          zoom={zoom}
          fitHeight={PAGE_H - KEY_H}
          minScale={0.25}
          colorsOverride={colors}
          pixelRatio={3}
          staticOnly
          fixedWidth={PAGE_W}
          onDrawn={() => setDrawn(true)}
        />
      )}
    </div>,
    document.body,
  );
}
