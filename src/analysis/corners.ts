import type { Session } from '../types';
import { channelOn, type DistLap } from './lap';

export interface Corner {
  id: number;
  name: string;
  /** grid indices */
  entry: number;
  apex: number;
  exit: number;
}

export interface CornerStats {
  minSpeed: number;
  apexDist: number;
  /** distance where braking starts, null if no braking */
  brakeDist: number | null;
  entrySpeed: number;
  exitSpeed: number;
  /** time taken from entry to exit */
  time: number;
}

function smooth(a: Float32Array, w: number): Float32Array {
  const n = a.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + a[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - w), hi = Math.min(n, i + w + 1);
    out[i] = (pre[hi] - pre[lo]) / (hi - lo);
  }
  return out;
}

const cornerCache = new WeakMap<DistLap, Corner[]>();

/** Cached corner list for a reference lap. */
export function cornersFor(s: Session, ref: DistLap): Corner[] {
  let c = cornerCache.get(ref);
  if (!c) cornerCache.set(ref, (c = findCorners(s, ref)));
  return c;
}

/** Find corners on a reference lap as significant speed minima. */
export function findCorners(s: Session, ref: DistLap): Corner[] {
  const raw = channelOn(s, ref, 'speed');
  if (!raw) return [];
  const step = ref.step;
  const v = smooth(raw, Math.max(1, Math.round(10 / step)));
  const n = v.length;
  const w = Math.max(2, Math.round(50 / step));
  const look = Math.round(300 / step);
  const minDrop = 8; // km/h

  const apexes: number[] = [];
  for (let k = 1; k < n - 1; k++) {
    let isMin = true;
    for (let j = Math.max(0, k - w); j <= Math.min(n - 1, k + w); j++) if (v[j] < v[k]) { isMin = false; break; }
    if (!isMin) continue;
    let before = 0, after = 0;
    for (let j = Math.max(0, k - look); j < k; j++) before = Math.max(before, v[j]);
    for (let j = k + 1; j <= Math.min(n - 1, k + look); j++) after = Math.max(after, v[j]);
    if (before - v[k] < minDrop || after - v[k] < minDrop / 2) continue;
    if (apexes.length && k - apexes[apexes.length - 1] < w) continue;
    apexes.push(k);
  }

  const corners: Corner[] = [];
  for (let c = 0; c < apexes.length; c++) {
    const a = apexes[c];
    const prev = c > 0 ? apexes[c - 1] : Math.max(0, a - look);
    const next = c < apexes.length - 1 ? apexes[c + 1] : Math.min(n - 1, a + look);
    let entry = a, exit = a;
    for (let j = prev; j < a; j++) if (v[j] > v[entry]) entry = j;
    for (let j = a + 1; j <= next; j++) if (v[j] > v[exit]) exit = j;
    corners.push({ id: c + 1, name: `C${c + 1}`, entry, apex: a, exit });
  }
  // Share boundaries so consecutive corners don't overlap.
  for (let c = 1; c < corners.length; c++) {
    if (corners[c].entry < corners[c - 1].exit) corners[c].entry = corners[c - 1].exit;
  }
  return corners;
}

export function cornerStats(s: Session, dl: DistLap, c: Corner): CornerStats | null {
  const v = channelOn(s, dl, 'speed');
  if (!v) return null;
  const brk = channelOn(s, dl, 'brake');
  const hi = Math.min(c.exit, dl.n - 1);
  let mi = c.entry;
  for (let k = c.entry; k <= hi; k++) if (v[k] < v[mi]) mi = k;
  let brakeIdx: number | null = null;
  if (brk) {
    // Last braking zone before the apex: find the latest firm brake, then walk back to its onset.
    let k = mi;
    while (k >= c.entry && brk[k] <= 10) k--;
    if (k >= c.entry) {
      while (k > c.entry && brk[k - 1] > 5) k--;
      brakeIdx = k;
    }
  }
  return {
    minSpeed: v[mi],
    apexDist: mi * dl.step,
    brakeDist: brakeIdx === null ? null : brakeIdx * dl.step,
    entrySpeed: v[brakeIdx ?? c.entry],
    exitSpeed: v[hi],
    time: dl.tm[hi] - dl.tm[c.entry],
  };
}
