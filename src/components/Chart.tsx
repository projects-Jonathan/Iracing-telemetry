import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note, Session } from '../types';
import { channelOn, deltaOn, valueAtDist, type DistLap } from '../analysis/lap';
import { cornersFor } from '../analysis/corners';
import { CANON_BY_KEY } from '../parsers/channels';
import { NOTE_KINDS } from '../analysis/notes';

const KIND_LABEL = Object.fromEntries(NOTE_KINDS.map((k) => [k.kind, k.label])) as Record<Note['kind'], string>;
import { cursor } from '../state/store';
import { endHover, seekDist, setZoom, syncCursorToDist } from '../state/actions';
import { fmtDist, fmtNum, prepCanvas, ticks, useColors, useWidth, type Colors } from './util';

interface Props {
  s: Session;
  ref_: DistLap;
  cmp: DistLap | null;
  panels: string[];
  zoom: [number, number] | null;
  /** total chart height to fill (CSS px), or null for natural panel heights */
  fitHeight?: number | null;
  /** Print mode: fixed colours (light), higher canvas resolution, panels may shrink further, no cursor layer. */
  colorsOverride?: Colors;
  pixelRatio?: number;
  minScale?: number;
  staticOnly?: boolean;
  /** use this width instead of measuring the container (print: no waiting on layout) */
  fixedWidth?: number;
  /** called after the traces have been drawn */
  onDrawn?: () => void;
  /** user notes to mark along the top of the graph (numbered in track order) */
  notes?: Note[];
  /** note mode: a click picks a spot (or the note under the pointer) instead of moving the playhead; no drag-zoom */
  onPick?: (d: number, existing: Note | null) => void;
  /** leave out the dotted sector lines (note mode) */
  hideSectors?: boolean;
}

interface PanelGeo {
  key: string;
  label: string;
  unit: string;
  dp: number;
  top: number; // plot top (css px)
  h: number; // plot height
  lo: number;
  hi: number;
  a: Float32Array | null; // reference series (or delta)
  b: Float32Array | null; // compare series
  delta: boolean;
  stepped: boolean;
}

const ML = 48, MR = 12, TITLE = 20, GAP = 8, AXIS = 24, CORNER_ROW = 16, NOTE_ROW = 20;
const FIXED_PCT = new Set(['throttle', 'brake', 'clutch']);

function panelHeight(key: string): number {
  if (key === 'delta') return 80;
  if (key === 'gear') return 64;
  if (FIXED_PCT.has(key)) return 76;
  return 104;
}

export function Chart({ s, ref_, cmp, panels, zoom, fitHeight = null, colorsOverride, pixelRatio, minScale = 0.6, staticOnly = false, fixedWidth, onDrawn, notes = [], onPick, hideSectors = false }: Props) {
  const topRow = CORNER_ROW + (notes.length ? NOTE_ROW : 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const measured = useWidth(wrapRef);
  const width = fixedWidth ?? measured;
  const themeColors = useColors();
  const colors = colorsOverride ?? themeColors;
  const [sel, setSel] = useState<[number, number] | null>(null);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);

  const L = s.trackLength;
  const [d0, d1] = zoom ?? [0, L];
  const corners = useMemo(() => cornersFor(s, ref_), [s, ref_]);

  const geo = useMemo(() => {
    let y = topRow;
    const out: PanelGeo[] = [];
    const step = ref_.step;
    const k0 = Math.max(0, Math.floor(d0 / step)), k1 = Math.min(ref_.n - 1, Math.ceil(d1 / step));
    for (const key of panels) {
      const isDelta = key === 'delta';
      if (isDelta && !cmp) continue;
      const a = isDelta ? deltaOn(ref_, cmp as DistLap) : channelOn(s, ref_, key);
      if (!a) continue;
      const b = isDelta ? null : cmp ? channelOn(s, cmp, key) : null;
      const def = CANON_BY_KEY[key];
      const info = s.info[key];
      let lo = Infinity, hi = -Infinity;
      for (const arr of [a, b]) {
        if (!arr) continue;
        for (let k = k0; k <= k1 && k < arr.length; k++) {
          const v = arr[k];
          if (!isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (FIXED_PCT.has(key)) { lo = 0; hi = 100; }
      else if (key === 'gear') { lo = Math.min(lo, 1) - 0.5; hi = hi + 0.5; }
      else if (isDelta) { const m = Math.max(0.05, Math.abs(lo), Math.abs(hi)) * 1.1; lo = -m; hi = m; }
      else if (!(hi > lo)) { lo -= 1; hi += 1; }
      else { const pad = (hi - lo) * 0.08; lo -= pad; hi += pad; }
      const h = panelHeight(key);
      out.push({
        key,
        label: isDelta ? 'Delta (compare − reference)' : (def?.label ?? info?.label ?? key),
        unit: isDelta ? 's' : (info?.unit ?? def?.unit ?? ''),
        dp: isDelta ? 3 : (def?.dp ?? 2),
        top: y + TITLE, h, lo, hi, a, b, delta: isDelta, stepped: key === 'gear',
      });
      y += TITLE + h + GAP;
    }
    // Stretch (or shrink, to 60% at most) the panels so the chart fills the requested height.
    if (fitHeight && out.length) {
      const fixed = topRow + AXIS + out.length * (TITLE + GAP);
      const natural = out.reduce((t, p) => t + p.h, 0);
      const scale = Math.max(minScale, (fitHeight - fixed) / natural);
      let top = topRow;
      for (const p of out) {
        p.h = Math.floor(p.h * scale);
        p.top = top + TITLE;
        top += TITLE + p.h + GAP;
      }
      // give rounding leftovers to the last panel so the total is exact
      const spare = fitHeight - (top + AXIS);
      if (spare > 0) { out[out.length - 1].h += spare; top += spare; }
      y = top;
    }
    return { panels: out, height: y + AXIS };
  }, [s, ref_, cmp, panels, d0, d1, fitHeight, minScale, topRow]);

  const plotW = Math.max(10, width - ML - MR);
  const xOf = (d: number) => ML + ((d - d0) / (d1 - d0)) * plotW;
  const dOf = (x: number) => Math.max(0, Math.min(L, d0 + ((x - ML) / plotW) * (d1 - d0)));

  // ---- base layer: grid, traces, labels ----
  useEffect(() => {
    const ctx = prepCanvas(baseRef.current, width, geo.height, pixelRatio);
    if (!ctx) return;
    drawBase(ctx, geo.panels, colors, { width, height: geo.height, d0, d1, step: ref_.step, xOf, sectors: hideSectors ? [] : s.sectors.map((p) => p * L), corners: corners.map((c) => ({ name: c.name, d: c.apex * ref_.step })), notes });
    onDrawn?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, width, colors, d0, d1, notes, hideSectors]);

  // ---- overlay: cursor, ghost, values, selection ----
  useEffect(() => {
    const draw = () => {
      if (staticOnly) return;
      const ctx = prepCanvas(overRef.current, width, geo.height);
      if (!ctx) return;
      const c = cursor.get();
      if (sel) {
        const xa = xOf(Math.min(sel[0], sel[1])), xb = xOf(Math.max(sel[0], sel[1]));
        ctx.fillStyle = colors.ink;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(xa, topRow, xb - xa, geo.height - topRow - AXIS);
        ctx.globalAlpha = 1;
      }
      const last = geo.panels[geo.panels.length - 1];
      if (!last) return;
      const yTop = geo.panels[0].top, yBot = last.top + last.h;
      // ghost (compare car at the same elapsed time)
      if (c.cmpD !== null && Math.abs(c.cmpD - c.d) > ref_.step * 2 && c.cmpD >= d0 && c.cmpD <= d1) {
        const gx = xOf(c.cmpD);
        ctx.strokeStyle = colors.cmp;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(gx, yTop); ctx.lineTo(gx, yBot); ctx.stroke();
        ctx.setLineDash([]);
      }
      // note tooltip: hovering within a few pixels of a note marker shows its text
      if (c.hover && notes.length) {
        const hit = notes.map((n, i) => ({ n, i })).find(({ n }) => n.d >= d0 && n.d <= d1 && Math.abs(xOf(n.d) - xOf(c.d)) <= 7);
        if (hit) {
          ctx.font = '500 12px ' + getComputedStyle(document.body).getPropertyValue('--font');
          const full = `n${hit.i + 1} · ${KIND_LABEL[hit.n.kind] ?? 'Note'}${hit.n.where ? ` · ${hit.n.where}` : ''}: ${hit.n.text}`;
          const text = full.length > 90 ? full.slice(0, 88) + '…' : full;
          const tw = ctx.measureText(text).width + 16;
          const tx = Math.max(ML, Math.min(width - MR - tw, xOf(hit.n.d) - tw / 2));
          const ty = CORNER_ROW + NOTE_ROW + 2;
          ctx.fillStyle = colors.ink;
          roundRect(ctx, tx, ty, tw, 24, 5); ctx.fill();
          ctx.fillStyle = colors.surface;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(text, tx + 8, ty + 12.5);
          // note mode: the line is clickable to edit, so swap its "n2" label for a pen icon
          if (onPick) {
            const px = Math.round(xOf(hit.n.d)) + 0.5, py = CORNER_ROW + 8;
            ctx.fillStyle = colors.surface;
            ctx.fillRect(px - 13, CORNER_ROW, 26, 15);
            drawPen(ctx, px, py, colors.noteInk);
          }
        }
        // pointer cursor while over a note line in note mode
        if (onPick && overRef.current) overRef.current.style.cursor = hit ? 'pointer' : 'copy';
      } else if (onPick && overRef.current) {
        overRef.current.style.cursor = 'copy';
      }
      if (c.d < d0 || c.d > d1) return;
      const x = xOf(c.d);
      ctx.strokeStyle = colors.ink2;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yTop - TITLE + 4); ctx.lineTo(x, yBot); ctx.stroke();
      // distance label on the x axis
      ctx.font = '500 11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
      const lab = fmtDist(c.d);
      const tw = ctx.measureText(lab).width + 10;
      const lx = Math.max(ML, Math.min(width - MR - tw, x - tw / 2));
      ctx.fillStyle = colors.ink;
      roundRect(ctx, lx, yBot + 4, tw, 17, 4); ctx.fill();
      ctx.fillStyle = colors.surface;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(lab, lx + 5, yBot + 12.5);

      for (const p of geo.panels) {
        const yOf = (v: number) => p.top + p.h - ((v - p.lo) / (p.hi - p.lo)) * p.h;
        const va = p.a ? valueAtDist(p.a, ref_.step, c.d) : NaN;
        const vb = p.b ? valueAtDist(p.b, ref_.step, c.d) : NaN;
        const dot = (v: number, col: string) => {
          if (!isFinite(v)) return;
          ctx.beginPath(); ctx.arc(x, yOf(v), 4, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = colors.surface; ctx.stroke();
        };
        dot(vb, colors.cmp);
        dot(va, p.delta ? colors.cmp : colors.ref);
        // readout in the title row (text in ink, swatch carries identity)
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.font = '500 12px ' + getComputedStyle(document.body).getPropertyValue('--mono');
        let rx = width - MR;
        const ty = p.top - 6;
        const put = (text: string, col: string | null) => {
          ctx.fillStyle = colors.ink;
          ctx.fillText(text, rx, ty);
          rx -= ctx.measureText(text).width + 4;
          if (col) {
            ctx.fillStyle = col;
            // swatch matches the trace: reference dashed when a compare lap is shown
            if (col === colors.ref && p.b) { ctx.fillRect(rx - 10, ty - 5, 4, 3); ctx.fillRect(rx - 4, ty - 5, 4, 3); }
            else ctx.fillRect(rx - 10, ty - 5, 10, 3);
            rx -= 18;
          }
        };
        const unit = p.unit ? ` ${p.unit}` : '';
        if (p.delta) {
          put(`${va > 0 ? '+' : ''}${fmtNum(va, 3)}${unit}`, null);
        } else {
          const f = (v: number) => (p.stepped ? fmtNum(v, 0) : fmtNum(v, p.dp));
          // drawn right-to-left, so this reads "compare, reference" on screen
          put(`${f(va)}${unit}`, colors.ref);
          if (p.b) put(f(vb), colors.cmp);
        }
      }
    };
    draw();
    return cursor.subscribe(draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, width, colors, d0, d1, sel, notes]);

  // ---- interaction ----
  const localX = (e: React.PointerEvent) => e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: localX(e), moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const x = localX(e);
    if (drag.current && !onPick) {
      if (Math.abs(x - drag.current.x0) > 5) drag.current.moved = true;
      if (drag.current.moved) setSel([dOf(drag.current.x0), dOf(x)]);
    }
    syncCursorToDist(dOf(x), true);
  };
  const onUp = (e: React.PointerEvent) => {
    const x = localX(e);
    const dr = drag.current;
    drag.current = null;
    if (!dr) return;
    if (onPick) {
      // note mode: clicking on (or within a few px of) an existing note edits it; anywhere else adds one
      const d = dOf(x);
      const hit = notes.find((n) => n.d >= d0 && n.d <= d1 && Math.abs(xOf(n.d) - x) <= 7) ?? null;
      onPick(hit ? hit.d : d, hit);
      return;
    }
    if (dr.moved) {
      const a = dOf(dr.x0), b = dOf(x);
      if (Math.abs(b - a) > 20) setZoom([Math.min(a, b), Math.max(a, b)], { toStart: true });
      setSel(null);
    } else {
      seekDist(dOf(x));
    }
  };

  return (
    <div className="chart-wrap" ref={wrapRef} style={{ height: geo.height }}>
      <canvas ref={baseRef} aria-label="Telemetry traces by lap distance" role="img" />
      <canvas
        ref={overRef}
        className="overlay"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { if (!drag.current) endHover(); }}
        onDoubleClick={() => { if (!onPick) setZoom(null); }}
        style={onPick ? { cursor: 'copy' } : undefined}
      />
    </div>
  );
}

/** Small pencil icon centred on (x, y), drawn diagonally. */
function drawPen(ctx: CanvasRenderingContext2D, x: number, y: number, col: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((3 * Math.PI) / 4); // tip down-left, like ✎
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.rect(-6, -2.2, 9, 4.4); ctx.stroke();          // barrel
  ctx.beginPath(); ctx.moveTo(-6, -2.2); ctx.lineTo(-6, 2.2); ctx.lineWidth = 2.2; ctx.stroke(); // eraser end
  ctx.beginPath(); ctx.moveTo(3, -2.2); ctx.lineTo(6.5, 0); ctx.lineTo(3, 2.2); ctx.closePath(); // tip
  ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5.4, -0.7); ctx.lineTo(6.5, 0); ctx.lineTo(5.4, 0.7); ctx.closePath(); ctx.fill(); // lead
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface BaseOpts {
  width: number;
  height: number;
  d0: number;
  d1: number;
  step: number;
  xOf: (d: number) => number;
  sectors: number[];
  corners: { name: string; d: number }[];
  notes: Note[];
}

function drawBase(ctx: CanvasRenderingContext2D, panels: PanelGeo[], c: Colors, o: BaseOpts) {
  const mono = getComputedStyle(document.body).getPropertyValue('--mono');
  const sans = getComputedStyle(document.body).getPropertyValue('--font');
  const right = o.width - MR;
  if (!panels.length) return;
  const yTop = panels[0].top, last = panels[panels.length - 1], yBot = last.top + last.h;

  // corner labels
  ctx.font = `500 10px ${mono}`;
  ctx.fillStyle = c.ink3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const cn of o.corners) if (cn.d >= o.d0 && cn.d <= o.d1) ctx.fillText(cn.name, o.xOf(cn.d), 2);

  // note markers: a tiny "n1" label above a dotted line running down through every panel
  o.notes.forEach((n, i) => {
    if (n.d < o.d0 || n.d > o.d1) return;
    const x = Math.round(o.xOf(n.d)) + 0.5;
    ctx.strokeStyle = c.note;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, CORNER_ROW + 14); ctx.lineTo(x, yBot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `700 10px ${mono}`;
    ctx.fillStyle = c.noteInk;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`n${i + 1}`, x, CORNER_ROW + 2);
  });

  // sector lines
  ctx.strokeStyle = c.ink3;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  for (let i = 1; i < o.sectors.length; i++) {
    const d = o.sectors[i];
    if (d < o.d0 || d > o.d1) continue;
    const x = Math.round(o.xOf(d)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yBot); ctx.stroke();
  }
  ctx.setLineDash([]);

  // x axis ticks
  const xt = ticks(o.d0, o.d1, Math.max(2, Math.floor((right - ML) / 90)));
  ctx.fillStyle = c.ink3;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  for (const d of xt) ctx.fillText(fmtDist(d), o.xOf(d), yBot + 6);

  const k0 = Math.max(0, Math.floor(o.d0 / o.step) - 1);
  for (const p of panels) {
    const yOf = (v: number) => p.top + p.h - ((v - p.lo) / (p.hi - p.lo)) * p.h;
    // title
    ctx.font = `600 11px ${sans}`;
    ctx.fillStyle = c.ink2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${p.label.toUpperCase()}${p.unit ? `  ·  ${p.unit}` : ''}`, ML, p.top - 6);

    // grid + y ticks
    const yt = p.key === 'gear'
      ? ticks(Math.ceil(p.lo), Math.floor(p.hi), 3).filter((v) => Number.isInteger(v))
      : FIXED_PCT.has(p.key) ? [0, 50, 100] : ticks(p.lo, p.hi, p.h > 90 || p.delta ? 4 : 2);
    ctx.font = `400 10px ${mono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yt) {
      const y = Math.round(yOf(v)) + 0.5;
      if (y < p.top - 1 || y > p.top + p.h + 1) continue;
      ctx.strokeStyle = p.delta && v === 0 ? c.ink3 : c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.fillStyle = c.ink3;
      const dp = p.stepped ? 0 : Math.abs(p.hi - p.lo) < 2 ? 2 : Math.abs(p.hi - p.lo) < 20 ? 1 : 0;
      ctx.fillText(fmtNum(v, p.delta ? 2 : dp), ML - 6, y);
    }

    // traces (clip to plot)
    ctx.save();
    ctx.beginPath();
    ctx.rect(ML, p.top - 2, right - ML, p.h + 4);
    ctx.clip();
    const trace = (arr: Float32Array, col: string, dash: number[]) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      const k1 = Math.min(arr.length - 1, Math.ceil(o.d1 / o.step) + 1);
      let prevY = 0;
      for (let k = k0; k <= k1; k++) {
        const v = arr[k];
        if (!isFinite(v)) { started = false; continue; }
        const x = o.xOf(k * o.step), y = yOf(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else if (p.stepped) { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
        else ctx.lineTo(x, y);
        prevY = y;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (p.delta && p.a) trace(p.a, c.cmp, []);
    else {
      // reference dashed underneath, compare (the lap being analysed) solid on top
      if (p.a) trace(p.a, c.ref, p.b ? [5, 2] : []);
      if (p.b) trace(p.b, c.cmp, []);
    }
    ctx.restore();
  }
}
