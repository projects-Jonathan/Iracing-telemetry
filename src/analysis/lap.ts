import type { Lap, Session } from '../types';
import { at } from './session';

/** Channels that are stepwise and must not be linearly interpolated. */
const STEPPED = new Set(['gear', 'lap', 'abs', 'onPit', 'incidents']);

/**
 * A lap on the session's common distance grid. `fi[k]` is the fractional
 * sample index at grid distance k*step, so any channel can be resampled lazily.
 */
export interface DistLap {
  lap: Lap;
  step: number;
  n: number;
  fi: Float64Array;
  /** elapsed lap time at each grid point, s */
  tm: Float32Array;
  cache: Map<string, Float32Array>;
}

const caches = new WeakMap<Session, Map<number, DistLap>>();

export function gridStep(s: Session): number {
  return s.map?.step ?? Math.max(1, s.trackLength / 2000);
}

export function distLap(s: Session, lap: Lap): DistLap {
  let m = caches.get(s);
  if (!m) caches.set(s, (m = new Map()));
  const hit = m.get(lap.start);
  if (hit) return hit;

  const L = s.trackLength;
  const step = gridStep(s);
  const n = Math.floor(L / step) + 1;
  const p = s.channels.lapPct;

  // Monotonic (distance, sample index) pairs for this lap.
  const ds: number[] = [0];
  const ix: number[] = [lap.start];
  for (let i = Math.ceil(lap.start); i <= Math.floor(lap.end); i++) {
    const d = p[i] * L;
    if (!(d > ds[ds.length - 1]) || d >= L) continue;
    ds.push(d);
    ix.push(i);
  }
  ds.push(L);
  ix.push(lap.end);

  const fi = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = k * step;
    while (j < ds.length - 2 && ds[j + 1] < d) j++;
    const f = Math.min(1, Math.max(0, (d - ds[j]) / (ds[j + 1] - ds[j] || 1)));
    fi[k] = ix[j] + (ix[j + 1] - ix[j]) * f;
  }
  const t = s.channels.time;
  const t0 = at(t, lap.start);
  const tm = new Float32Array(n);
  for (let k = 0; k < n; k++) tm[k] = at(t, fi[k]) - t0;

  const dl: DistLap = { lap, step, n, fi, tm, cache: new Map() };
  m.set(lap.start, dl);
  return dl;
}

export function channelOn(s: Session, dl: DistLap, key: string): Float32Array | null {
  if (key === 'tm') return dl.tm;
  const hit = dl.cache.get(key);
  if (hit) return hit;
  const src = s.channels[key];
  if (!src) return null;
  const out = new Float32Array(dl.n);
  if (STEPPED.has(key)) for (let k = 0; k < dl.n; k++) out[k] = src[Math.round(dl.fi[k])];
  else for (let k = 0; k < dl.n; k++) out[k] = at(src, dl.fi[k]);
  dl.cache.set(key, out);
  return out;
}

/** Time delta of `cmp` against `ref` at equal distance (positive = cmp slower). */
export function deltaOn(ref: DistLap, cmp: DistLap): Float32Array {
  const key = `delta:${cmp.lap.start}`;
  const hit = ref.cache.get(key);
  if (hit) return hit;
  const n = Math.min(ref.n, cmp.n);
  const out = new Float32Array(ref.n);
  for (let k = 0; k < n; k++) out[k] = cmp.tm[k] - ref.tm[k];
  ref.cache.set(key, out);
  return out;
}

/** Grid distance reached at elapsed lap time `t` (binary search on tm). */
export function distAtTime(dl: DistLap, t: number): number {
  const tm = dl.tm;
  if (t <= 0) return 0;
  if (t >= tm[dl.n - 1]) return (dl.n - 1) * dl.step;
  let lo = 0, hi = dl.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tm[mid] <= t) lo = mid; else hi = mid;
  }
  const f = (t - tm[lo]) / (tm[hi] - tm[lo] || 1);
  return (lo + f) * dl.step;
}

/** Fractional sample index at elapsed lap time `t`. */
export function sampleAtTime(s: Session, lap: Lap, t: number): number {
  const time = s.channels.time;
  const target = at(time, lap.start) + t;
  let lo = Math.floor(lap.start), hi = Math.ceil(lap.end);
  if (target <= time[lo]) return lo;
  if (target >= time[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= target) lo = mid; else hi = mid;
  }
  return lo + (target - time[lo]) / (time[hi] - time[lo] || 1);
}

export interface IncidentMark {
  /** lap distance, m */
  d: number;
  /** incident points added at this spot (1x, 2x, 4x…) */
  count: number;
}

/** Where on the lap the incident counter went up. */
export function incidentsOnLap(s: Session, lap: Lap): IncidentMark[] {
  const inc = s.channels.incidents;
  const p = s.channels.lapPct;
  if (!inc || !lap.incidents) return [];
  const out: IncidentMark[] = [];
  const i0 = Math.max(1, Math.ceil(lap.start)), i1 = Math.min(inc.length - 1, Math.floor(lap.end));
  for (let i = i0; i <= i1; i++) {
    const add = inc[i] - inc[i - 1];
    if (add > 0) out.push({ d: Math.max(0, Math.min(1, p[i])) * s.trackLength, count: Math.round(add) });
  }
  return out;
}

/** Value of a grid array at a distance (linear). */
export function valueAtDist(a: Float32Array, step: number, d: number): number {
  return at(a, d / step);
}
