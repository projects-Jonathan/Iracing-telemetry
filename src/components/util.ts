import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useApp } from '../state/store';

export interface Colors {
  bg: string; surface: string; ink: string; ink2: string; ink3: string; grid: string; rule: string;
  track: string; ref: string; cmp: string; seqLo: string; seqHi: string; gain: string; loss: string; note: string; noteInk: string;
}

/** Read the colour tokens in effect on `el` (defaults to the page root, i.e. the current theme). */
export function readColors(el: Element = document.documentElement): Colors {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--bg'), surface: v('--surface'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'),
    grid: v('--grid'), rule: v('--rule'), track: v('--track'), ref: v('--ref'), cmp: v('--cmp'),
    seqLo: v('--seq-lo'), seqHi: v('--seq-hi'), gain: v('--gain'), loss: v('--loss'), note: v('--note'), noteInk: v('--note-ink'),
  };
}

/** Theme colours, re-read whenever the theme toggles. */
export function useColors(): Colors {
  const theme = useApp((s) => s.theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readColors(), [theme]);
}

export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el);
    setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Size a canvas for crisp drawing at the device pixel ratio; returns a context in CSS pixels. */
export function prepCanvas(c: HTMLCanvasElement | null, w: number, h: number, ratio?: number): CanvasRenderingContext2D | null {
  if (!c || w <= 0 || h <= 0) return null;
  const dpr = ratio ?? (window.devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.height = `${h}px`;
  }
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

export function fmtLap(t: number | null | undefined): string {
  if (t === null || t === undefined || !isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}

export function fmtDelta(d: number | null | undefined, dp = 3): string {
  if (d === null || d === undefined || !isFinite(d)) return '—';
  const s = d.toFixed(dp);
  return d > 0 ? `+${s}` : d < 0 ? s.replace('-', '−') : s;
}

export function fmtNum(v: number, dp: number): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(dp).replace('-', '−');
}

export function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`;
}

/** "Nice" tick values covering [lo, hi]. */
export function ticks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Interpolate the sequential ramp (single hue, light→dark). */
export function seqColor(lo: string, hi: string, f: number): string {
  const a = hexToRgb(lo), b = hexToRgb(hi);
  const t = Math.max(0, Math.min(1, f));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

/** True while a CSS media query matches. */
export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/**
 * Height of an element via a callback ref: re-attaches whenever React mounts a new element,
 * so the value never goes stale if the element is removed and recreated.
 */
export function useMeasuredHeight<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [h, setH] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    observer.current = ro;
    setH(el.getBoundingClientRect().height);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [attach, h];
}
