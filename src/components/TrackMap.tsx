import { useEffect, useMemo, useRef } from 'react';
import type { Session } from '../types';
import { channelOn, incidentsOnLap, type DistLap } from '../analysis/lap';
import { cornersFor } from '../analysis/corners';
import { cursor, setApp } from '../state/store';
import { endHover, seekDist, syncCursorToDist } from '../state/actions';
import { fmtNum, prepCanvas, seqColor, useColors, useWidth } from './util';

interface Props {
  s: Session;
  ref_: DistLap;
  cmp: DistLap | null;
  channel: string;
  zoom: [number, number] | null;
}

interface View { z: number; cx: number; cy: number }
const MAX_Z = 16;

const MAP_CHANNELS: [string, string][] = [
  ['speed', 'Speed'], ['throttle', 'Throttle'], ['brake', 'Brake'], ['gear', 'Gear'], ['gLat', 'Lateral G'], ['steer', 'Steering'], ['delta', 'Time gained/lost'],
];

export function TrackMap({ s, ref_, cmp, channel, zoom }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const width = useWidth(wrapRef);
  const colors = useColors();
  const map = s.map;

  // Rotate the outline to its principal axis so it fills a landscape box.
  const proj = useMemo(() => {
    if (!map) return null;
    const n = map.x.length;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += map.x[i]; my += map.y[i]; }
    mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = map.x[i] - mx, dy = map.y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const cos = Math.cos(-th), sin = Math.sin(-th);
    const px = new Float32Array(n), py = new Float32Array(n);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const dx = map.x[i] - mx, dy = map.y[i] - my;
      px[i] = dx * cos - dy * sin;
      py[i] = -(dx * sin + dy * cos); // screen y grows downward
      x0 = Math.min(x0, px[i]); x1 = Math.max(x1, px[i]); y0 = Math.min(y0, py[i]); y1 = Math.max(y1, py[i]);
    }
    return { px, py, x0, x1, y0, y1 };
  }, [map]);

  const PAD = 56; // room for corner labels around the outline
  const height = proj ? Math.max(160, Math.min(420, Math.round((width - PAD) * ((proj.y1 - proj.y0) / (proj.x1 - proj.x0 || 1))) + PAD)) : 160;
  const scale = proj ? Math.min((width - PAD) / (proj.x1 - proj.x0 || 1), (height - PAD) / (proj.y1 - proj.y0 || 1)) : 1;

  // ---- view: follows the graph. Zooming the graph frames that stretch of track on the map;
  // the full graph shows the whole track. There is no manual map zoom. ----
  const view = useMemo((): View | null => {
    if (!proj || !map || !zoom || width <= 0) return null;
    const k0 = Math.max(0, Math.floor(zoom[0] / map.step)), k1 = Math.min(proj.px.length - 1, Math.ceil(zoom[1] / map.step));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = k0; k <= k1; k++) {
      x0 = Math.min(x0, proj.px[k]); x1 = Math.max(x1, proj.px[k]); y0 = Math.min(y0, proj.py[k]); y1 = Math.max(y1, proj.py[k]);
    }
    const z = Math.min((width - PAD) / ((x1 - x0 || 1) * scale), (height - PAD) / ((y1 - y0 || 1) * scale));
    if (z <= 1.001) return null;
    return { z: Math.min(MAX_Z, z), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }, [zoom, proj, map, width, height, scale]);
  const v: View = view ?? (proj ? { z: 1, cx: (proj.x0 + proj.x1) / 2, cy: (proj.y0 + proj.y1) / 2 } : { z: 1, cx: 0, cy: 0 });
  const pt = (k: number): [number, number] => {
    const p = proj as NonNullable<typeof proj>;
    const i = Math.max(0, Math.min(p.px.length - 1, Math.round(k)));
    return [width / 2 + (p.px[i] - v.cx) * scale * v.z, height / 2 + (p.py[i] - v.cy) * scale * v.z];
  };

  // The compare lap is the one being analysed, so the map is coloured from it (reference only if there is no compare).
  const lapForColor = cmp ?? ref_;
  const values = useMemo(() => {
    if (channel === 'delta') {
      if (!cmp) return null;
      // rate of time loss per metre: positive = compare losing time here
      const out = new Float32Array(ref_.n);
      const w = Math.max(1, Math.round(15 / ref_.step));
      for (let k = 0; k < ref_.n; k++) {
        const a = Math.max(0, k - w), b = Math.min(ref_.n - 1, k + w);
        out[k] = ((cmp.tm[b] - cmp.tm[a]) - (ref_.tm[b] - ref_.tm[a])) / ((b - a) * ref_.step) * 100;
      }
      return out;
    }
    return channelOn(s, lapForColor, channel);
  }, [s, ref_, cmp, lapForColor, channel]);

  const range = useMemo(() => {
    if (!values) return [0, 1];
    if (channel === 'throttle' || channel === 'brake') return [0, 100];
    let lo = Infinity, hi = -Infinity;
    for (const v of values) if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (channel === 'delta' || channel === 'gLat' || channel === 'steer') { const m = Math.max(Math.abs(lo), Math.abs(hi)); return [-m, m]; }
    return [lo, hi];
  }, [values, channel]);

  // ---- base ----
  useEffect(() => {
    const ctx = prepCanvas(baseRef.current, width, height);
    if (!ctx || !proj || !map) return;
    const n = proj.px.length;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // track outline
    ctx.strokeStyle = colors.track;
    ctx.lineWidth = 12;
    ctx.beginPath();
    for (let k = 0; k < n; k++) { const [x, y] = pt(k); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
    ctx.stroke();
    // coloured line
    const [lo, hi] = range;
    const diverging = channel === 'delta' || channel === 'gLat' || channel === 'steer';
    const zd0 = zoom ? zoom[0] / map.step : 0, zd1 = zoom ? zoom[1] / map.step : n;
    ctx.lineWidth = 5;
    for (let k = 0; k < n - 1; k++) {
      const v = values ? values[Math.min(values.length - 1, k)] : 0;
      const f = (v - lo) / (hi - lo || 1);
      if (diverging) {
        // two-hue diverging: compare colour for positive, reference colour for negative, neutral at zero
        const t = Math.abs(f - 0.5) * 2;
        ctx.strokeStyle = colors.track;
        ctx.globalAlpha = 1;
        const col = f >= 0.5 ? colors.cmp : colors.ref;
        ctx.strokeStyle = col;
        ctx.globalAlpha = (0.12 + 0.88 * t) * (k < zd0 || k > zd1 ? 0.25 : 1);
      } else {
        ctx.strokeStyle = seqColor(colors.seqLo, colors.seqHi, f);
        ctx.globalAlpha = k < zd0 || k > zd1 ? 0.2 : 1;
      }
      const [x0, y0] = pt(k), [x1, y1] = pt(k + 1);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // start/finish + sectors
    const tick = (k: number, len: number, col: string, w: number) => {
      const [xa, ya] = pt(k), [xb, yb] = pt(k + 2);
      const dx = xb - xa, dy = yb - ya, m = Math.hypot(dx, dy) || 1;
      const nx = -dy / m, ny = dx / m;
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(xa - nx * len, ya - ny * len); ctx.lineTo(xa + nx * len, ya + ny * len); ctx.stroke();
      ctx.lineCap = 'round';
    };
    tick(0, 11, colors.ink, 3);
    s.sectors.slice(1).forEach((p) => tick((p * s.trackLength) / map.step, 8, colors.ink3, 1.5));
    // Corner labels sit on the outside of the circuit loop: the driver's left on a clockwise
    // track, right on an anticlockwise one. Direction comes from the outline's signed area
    // (screen coords, y down: positive = clockwise as seen on screen).
    let area = 0;
    for (let k = 0; k < n; k++) {
      const [x0, y0] = pt(k), [x1, y1] = pt((k + 1) % n);
      area += x0 * y1 - x1 * y0;
    }
    const clockwise = area > 0;
    ctx.font = `500 10px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
    ctx.fillStyle = colors.ink2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const span = Math.max(2, Math.round(20 / map.step)); // tangent measured over ±20 m
    for (const c of cornersFor(s, ref_)) {
      const k = (c.apex * ref_.step) / map.step;
      const [x, y] = pt(k);
      const [xa, ya] = pt((k - span + n) % n), [xb, yb] = pt((k + span) % n);
      const tx = xb - xa, ty = yb - ya, m = Math.hypot(tx, ty) || 1;
      // left of travel on screen is (ty, -tx); right is (-ty, tx)
      const nx = (clockwise ? ty : -ty) / m, ny = (clockwise ? -tx : tx) / m;
      ctx.fillText(c.name, x + nx * 17, y + ny * 17);
    }
    const cx = width / 2, cy = height / 2;
    // incident markers: warning triangle in the lap's colour, with the count beside it
    const mark = (d: number, count: number, col: string, side: number) => {
      const [x, y] = pt(d / map.step);
      const dx = x - cx, dy = y - cy, m = Math.hypot(dx, dy) || 1;
      // nudge compare-lap markers inward and reference outward so overlapping ones stay visible
      const tx = x + (dx / m) * 4 * side, ty = y + (dy / m) * 4 * side;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 10); ctx.lineTo(tx + 9, ty + 6); ctx.lineTo(tx - 9, ty + 6); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = colors.surface; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `700 10px ${getComputedStyle(document.body).getPropertyValue('--font')}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', tx, ty + 1);
      ctx.fillStyle = colors.ink;
      ctx.font = `600 11px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
      ctx.textAlign = side > 0 ? 'left' : 'right';
      ctx.fillText(`${count}x`, tx + 12 * side, ty);
    };
    if (cmp) for (const i of incidentsOnLap(s, cmp.lap)) mark(i.d, i.count, colors.cmp, -1);
    for (const i of incidentsOnLap(s, ref_.lap)) mark(i.d, i.count, colors.ref, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proj, width, height, colors, values, range, zoom, s, ref_, cmp, view]);

  // ---- overlay: car positions ----
  useEffect(() => {
    const draw = () => {
      const ctx = prepCanvas(overRef.current, width, height);
      if (!ctx || !proj || !map) return;
      const c = cursor.get();
      // Reference: blue ring underneath. Compare: solid orange dot on top.
      // Different shapes keep both visible even when the cars are side by side.
      const ring = (d: number) => {
        const [x, y] = pt(d / map.step);
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.lineWidth = 6; ctx.strokeStyle = colors.surface; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = colors.ref; ctx.stroke();
      };
      const dot = (d: number) => {
        const [x, y] = pt(d / map.step);
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = colors.cmp; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = colors.surface; ctx.stroke();
      };
      if (c.cmpD === null) {
        // no compare lap: the reference car is the only car, drawn as a solid dot
        const [x, y] = pt(c.d / map.step);
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = colors.ref; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = colors.surface; ctx.stroke();
        return;
      }
      ring(c.d);
      dot(c.cmpD);
    };
    draw();
    return cursor.subscribe(draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proj, width, height, colors, view]);

  const nearest = (e: React.MouseEvent): number | null => {
    if (!proj || !map) return null;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = Infinity;
    for (let k = 0; k < proj.px.length; k++) {
      const [px, py] = pt(k);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return bd < 400 ? Math.min(s.trackLength, best * map.step) : null;
  };

  const lo = range[0], hi = range[1];
  const unit = channel === 'delta' ? 's/100m' : s.info[channel]?.unit ?? '';
  return (
    <div className="card map-card">
      <div className="map-bar">
        <label htmlFor="mapCh" className="muted">Colour by</label>
        <select id="mapCh" value={channel} onChange={(e) => setApp({ mapChannel: e.target.value })}>
          {MAP_CHANNELS.filter(([k]) => (k === 'delta' ? !!cmp : !!s.channels[k])).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="legend" title={channel === 'delta' ? 'Blue: compare lap gains time · Orange: compare lap loses time' : ''}>
          {channel === 'delta' ? <>gain<span className="bar" style={{ background: 'linear-gradient(90deg,var(--ref),var(--track),var(--cmp))' }} />loss</> : <>{fmtNum(lo, channel === 'gLat' ? 1 : 0)}<span className="bar" />{fmtNum(hi, channel === 'gLat' ? 1 : 0)} {unit}</>}
        </span>
      </div>
      {map ? (
        <div className="map-wrap" ref={wrapRef} style={{ height }}>
          <canvas ref={baseRef} role="img" aria-label={`Track map coloured by ${channel}`} />
          <canvas
            ref={overRef}
            className="overlay"
            onPointerMove={(e) => { const d = nearest(e); if (d !== null) syncCursorToDist(d, true); else endHover(); }}
            onPointerLeave={() => endHover()}
            onClick={(e) => { const d = nearest(e); if (d !== null) seekDist(d); }}
          />
        </div>
      ) : (
        <p className="note" ref={wrapRef as React.RefObject<HTMLParagraphElement>}>No position data to draw a map.</p>
      )}
      {map && (
        <div className="map-key">
          {cmp && <span><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--cmp)" /></svg>Compare · lap {cmp.lap.num}</span>}
          <span>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">{cmp ? <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--ref)" strokeWidth="2.5" /> : <circle cx="7" cy="7" r="5.5" fill="var(--ref)" />}</svg>
            Reference · lap {ref_.lap.num}
          </span>
          {channel !== 'delta' && <span className="faint">colour from {cmp ? 'compare' : 'reference'} lap</span>}
        </div>
      )}
      {map && (() => {
        const items = [
          ...incidentsOnLap(s, ref_.lap).map((i) => ({ ...i, lap: ref_.lap.num, cls: 'ref' })),
          ...(cmp ? incidentsOnLap(s, cmp.lap).map((i) => ({ ...i, lap: cmp.lap.num, cls: 'cmp' })) : []),
        ];
        if (!items.length) return null;
        return (
          <div className="incidents">
            {items.map((i, k) => (
              <button key={k} className="inc" onClick={() => seekDist(i.d)} title="Jump the playhead here">
                <svg width="13" height="12" viewBox="0 0 18 16" aria-hidden="true"><path d="M9 0.8 17.2 15H0.8z" fill={`var(--${i.cls})`} /><text x="9" y="13" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">!</text></svg>
                Lap {i.lap}: {i.count}x incident at {Math.round(i.d)} m
              </button>
            ))}
          </div>
        );
      })()}
      <p className="note">
        {map?.method === 'gps'
          ? 'Drawn from GPS on the fastest lap.'
          : 'Rebuilt from heading and speed on the fastest lap (no GPS in this file) — shape is close, not survey-exact.'}
      </p>
    </div>
  );
}
