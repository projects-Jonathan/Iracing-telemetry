import type { Session } from '../types';
import { channelOn, type DistLap } from './lap';
import { cornerStats, cornersFor } from './corners';

/** Tolerances for "these two laps agree here". */
export const TOL = { speed: 3, throttle: 10, brake: 10, line: 1 } as const; // km/h, %, %, m

export interface Consistency {
  /** 0..100, average of the available component scores */
  score: number;
  /** each: share (0..100) of the distance where the laps agree within tolerance */
  parts: { key: 'speed' | 'throttle' | 'brake' | 'line'; label: string; pct: number; tol: string }[];
  /** mean |difference| in brake point across corners inside the range, m */
  brakeSpread: number | null;
  /** mean |difference| in minimum corner speed, km/h */
  apexSpread: number | null;
  /** largest time gap opening up inside the range, s */
  maxSwing: number;
}

export function consistency(s: Session, ref: DistLap, cmp: DistLap, range: [number, number] | null): Consistency {
  const step = ref.step;
  const n = Math.min(ref.n, cmp.n);
  const k0 = range ? Math.max(0, Math.floor(range[0] / step)) : 0;
  const k1 = range ? Math.min(n - 1, Math.ceil(range[1] / step)) : n - 1;

  /** `active`: only count points where either lap is above this value (e.g. braking zones). */
  const share = (a: Float32Array | null, b: Float32Array | null, tol: number, active = -Infinity): number | null => {
    if (!a || !b) return null;
    let ok = 0, tot = 0;
    for (let k = k0; k <= k1; k++) {
      if (!isFinite(a[k]) || !isFinite(b[k])) continue;
      if (a[k] <= active && b[k] <= active) continue;
      tot++;
      if (Math.abs(a[k] - b[k]) <= tol) ok++;
    }
    return tot ? (ok / tot) * 100 : null;
  };

  const parts: Consistency['parts'] = [];
  const push = (key: Consistency['parts'][number]['key'], label: string, pct: number | null, tol: string) => {
    if (pct !== null) parts.push({ key, label, pct, tol });
  };
  push('speed', 'Speed', share(channelOn(s, ref, 'speed'), channelOn(s, cmp, 'speed'), TOL.speed), `±${TOL.speed} km/h`);
  push('throttle', 'Throttle', share(channelOn(s, ref, 'throttle'), channelOn(s, cmp, 'throttle'), TOL.throttle), `±${TOL.throttle}%`);
  // brake is only scored inside braking zones, otherwise "both off the brake" dominates
  push('brake', 'Brake', share(channelOn(s, ref, 'brake'), channelOn(s, cmp, 'brake'), TOL.brake, 2), `±${TOL.brake}% in braking zones`);

  // Racing line: distance between the two cars' positions at the same lap distance (GPS files only).
  const ex = channelOn(s, ref, 'posE'), ny = channelOn(s, ref, 'posN');
  const cx = channelOn(s, cmp, 'posE'), cy = channelOn(s, cmp, 'posN');
  if (ex && ny && cx && cy) {
    const sep = new Float32Array(n);
    for (let k = 0; k < n; k++) sep[k] = Math.hypot(ex[k] - cx[k], ny[k] - cy[k]);
    push('line', 'Racing line', share(sep, new Float32Array(n), TOL.line), `±${TOL.line} m`);
  }

  // Corner-level spreads for corners whose apex is inside the range.
  let bSum = 0, bN = 0, aSum = 0, aN = 0;
  for (const c of cornersFor(s, ref)) {
    if (c.apex < k0 || c.apex > k1) continue;
    const a = cornerStats(s, ref, c), b = cornerStats(s, cmp, c);
    if (!a || !b) continue;
    aSum += Math.abs(a.minSpeed - b.minSpeed); aN++;
    if (a.brakeDist !== null && b.brakeDist !== null) { bSum += Math.abs(a.brakeDist - b.brakeDist); bN++; }
  }

  // Biggest swing in the time delta inside the range.
  let lo = Infinity, hi = -Infinity;
  for (let k = k0; k <= k1; k++) {
    const d = cmp.tm[k] - ref.tm[k];
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }

  const score = parts.length ? parts.reduce((t, p) => t + p.pct, 0) / parts.length : 0;
  return {
    score,
    parts,
    brakeSpread: bN ? bSum / bN : null,
    apexSpread: aN ? aSum / aN : null,
    maxSwing: isFinite(hi - lo) ? hi - lo : 0,
  };
}
