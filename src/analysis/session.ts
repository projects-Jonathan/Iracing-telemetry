import type { Lap, Session, TrackMap } from '../types';
import type { RawRecording } from '../parsers/ibt';
import { normalise } from '../parsers/channels';
import { parseSessionInfo } from '../parsers/sessionInfo';

/** Linear interpolation of an array at a fractional index. */
export function at(a: ArrayLike<number>, fi: number): number {
  const i = Math.floor(fi);
  const f = fi - i;
  if (i < 0) return a[0];
  if (i >= a.length - 1) return a[a.length - 1];
  return f === 0 ? a[i] : a[i] + (a[i + 1] - a[i]) * f;
}

export function buildSession(rec: RawRecording, fileName: string, fileSize: number): Session {
  const { channels, info } = normalise(rec.channels, rec.units);
  const si = parseSessionInfo(rec.sessionYaml);
  const n = channels.time?.length ?? 0;
  if (!channels.time || !channels.lapPct || !channels.speed) {
    throw new Error('This file is missing the basic channels (time, lap distance, speed) needed to find laps.');
  }

  // iRacing reports neutral for a frame or two during every shift; hold the last gear while moving.
  const gear = channels.gear;
  if (gear) for (let i = 1; i < n; i++) if (gear[i] === 0 && channels.speed[i] > 10) gear[i] = gear[i - 1];

  let trackLength = si.trackLength;
  const laps = findLaps(channels, si.sectors);
  if (!trackLength) trackLength = estimateLength(channels, laps);

  const session: Session = {
    id: `${fileName}-${fileSize}`,
    fileName,
    source: fileName.toLowerCase().endsWith('.ibt') ? 'ibt' : 'simhub',
    game: rec.game,
    track: si.track || 'Unknown track',
    trackConfig: si.trackConfig,
    trackLength,
    car: si.car || 'Unknown car',
    driver: si.driver,
    date: rec.date ?? dateFromName(fileName),
    rate: rec.rate,
    sampleCount: n,
    sectors: si.sectors,
    channels,
    info,
    laps,
    map: null,
    addedAt: Date.now(),
    fileSize,
  };
  session.map = buildMap(session);
  return session;
}

/** SimHub names recordings YYYYMMDD_HHMMSS (local time). */
function dateFromName(name: string): string | null {
  const m = name.match(/(20\d\d)(\d\d)(\d\d)_(\d\d)(\d\d)(\d\d)/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function findLaps(ch: Record<string, Float32Array>, sectors: number[]): Lap[] {
  const t = ch.time;
  const p = ch.lapPct;
  const n = t.length;
  const onPit = ch.onPit;
  const lapNo = ch.lap;
  const inc = ch.incidents;
  const last = ch.lastLapTime;

  // Line crossings (fractional index) and breaks (teleports, resets, rewinds).
  const crossings: number[] = [];
  const breaks: number[] = [];
  for (let i = 1; i < n; i++) {
    const p0 = p[i - 1], p1 = p[i];
    const dt = t[i] - t[i - 1];
    if (!(dt > 0) || dt > 1.5 || p0 < 0 || p1 < 0 || !isFinite(p0) || !isFinite(p1)) { breaks.push(i); continue; }
    if (p0 > 0.9 && p1 < 0.1) {
      crossings.push(i - 1 + (1 - p0) / (1 - p0 + p1));
    } else if (Math.abs(p1 - p0) > 0.03) {
      breaks.push(i);
    }
  }

  const laps: Lap[] = [];
  let bi = 0;
  for (let k = 0; k + 1 < crossings.length; k++) {
    const s = crossings[k], e = crossings[k + 1];
    while (bi < breaks.length && breaks[bi] <= s) bi++;
    const broken = bi < breaks.length && breaks[bi] < e;
    let pit = false;
    if (onPit) for (let i = Math.ceil(s); i <= Math.floor(e); i++) if (onPit[i] > 0) { pit = true; break; }

    const ts = at(t, s), te = at(t, e);
    let time = te - ts;
    // Prefer the sim's official lap time, published a moment after the crossing.
    if (last && !broken) {
      const prev = last[Math.floor(e)];
      for (let i = Math.ceil(e); i < n && t[i] - te < 4; i++) {
        const v = last[i];
        if (v !== prev) {
          if (v > 0 && Math.abs(v - time) < 0.25) time = v;
          break;
        }
      }
    }

    const num = lapNo ? Math.round(lapNo[Math.min(n - 1, Math.ceil(s) + 1)]) : k + 1;
    const incidents = inc ? Math.max(0, at(inc, e) - at(inc, s)) : 0;
    const tooShort = time < 15;
    const complete = !broken && !pit && !tooShort;
    const note = broken ? 'Reset or replay jump during lap' : pit ? 'Pit lane' : tooShort ? 'Too short' : null;

    const sectorTimes: (number | null)[] = [];
    if (complete && sectors.length > 1) {
      const marks: number[] = [ts];
      let si = 1;
      for (let i = Math.ceil(s); i <= Math.floor(e) && si < sectors.length; i++) {
        const target = sectors[si];
        if (i > 0 && p[i - 1] < target && p[i] >= target && p[i - 1] < 0.999) {
          marks.push(at(t, i - 1 + (target - p[i - 1]) / (p[i] - p[i - 1])));
          si++;
        }
      }
      marks.push(te);
      if (marks.length === sectors.length + 1) {
        for (let j = 0; j < sectors.length; j++) sectorTimes.push(marks[j + 1] - marks[j]);
        // Scale so the sectors add up to the official lap time.
        const sum = sectorTimes.reduce<number>((a, b) => a + (b ?? 0), 0);
        if (sum > 0) for (let j = 0; j < sectorTimes.length; j++) sectorTimes[j] = (sectorTimes[j] as number) * (time / sum);
      } else for (let j = 0; j < sectors.length; j++) sectorTimes.push(null);
    }

    laps.push({ num, start: s, end: e, time: complete ? time : null, complete, note, sectorTimes, incidents: Math.round(incidents), startTime: ts });
  }
  return laps;
}

function estimateLength(ch: Record<string, Float32Array>, laps: Lap[]): number {
  const lap = laps.find((l) => l.complete);
  if (!lap) return 0;
  let d = 0;
  for (let i = Math.ceil(lap.start); i < Math.floor(lap.end); i++) d += (ch.speed[i] / 3.6) * (ch.time[i + 1] - ch.time[i]);
  return d;
}

export function bestLap(s: Session): Lap | null {
  let best: Lap | null = null;
  for (const l of s.laps) if (l.complete && l.time !== null && (!best || l.time < (best.time as number))) best = l;
  return best;
}

/** Sample positions for a lap onto a distance grid. */
function lapPathByDistance(s: Session, lap: Lap, xs: Float32Array, ys: Float32Array, step: number): { x: Float32Array; y: Float32Array } {
  const L = s.trackLength;
  const p = s.channels.lapPct;
  const m = Math.floor(L / step) + 1;
  const x = new Float32Array(m);
  const y = new Float32Array(m);
  // distance of each sample inside the lap
  const i0 = Math.ceil(lap.start), i1 = Math.floor(lap.end);
  const ds: number[] = [0], xv: number[] = [at(xs, lap.start)], yv: number[] = [at(ys, lap.start)];
  for (let i = i0; i <= i1; i++) {
    const d = p[i] * L;
    if (d <= ds[ds.length - 1]) continue;
    ds.push(d); xv.push(xs[i]); yv.push(ys[i]);
  }
  ds.push(L); xv.push(at(xs, lap.end)); yv.push(at(ys, lap.end));
  let j = 0;
  for (let k = 0; k < m; k++) {
    const d = k * step;
    while (j < ds.length - 2 && ds[j + 1] < d) j++;
    const f = Math.min(1, Math.max(0, (d - ds[j]) / (ds[j + 1] - ds[j] || 1)));
    x[k] = xv[j] + (xv[j + 1] - xv[j]) * f;
    y[k] = yv[j] + (yv[j + 1] - yv[j]) * f;
  }
  return { x, y };
}

function buildMap(s: Session): TrackMap | null {
  const lap = bestLap(s);
  if (!lap || !s.trackLength) return null;
  const step = Math.max(1, s.trackLength / 2000);
  const { posE, posN } = s.channels;
  if (posE && posN && isFinite(at(posE, lap.start + 1))) {
    const { x, y } = lapPathByDistance(s, lap, posE, posN, step);
    return { x, y, step, method: 'gps' };
  }
  const yaw = s.channels.yaw;
  if (!yaw) return null;
  // Dead reckoning: integrate speed along heading, then close the loop.
  const n = s.sampleCount;
  const t = s.channels.time, v = s.channels.speed;
  const ex = new Float32Array(n), ny = new Float32Array(n);
  const i0 = Math.max(0, Math.floor(lap.start)), i1 = Math.min(n - 1, Math.ceil(lap.end) + 1);
  let x = 0, y = 0;
  for (let i = i0 + 1; i <= i1; i++) {
    const dt = t[i] - t[i - 1];
    const vm = ((v[i] + v[i - 1]) / 2) / 3.6;
    // Verified against GPS on the same laps: integrating yaw directly gives the correct handedness.
    const h = angleMid(yaw[i - 1], yaw[i]);
    x += vm * Math.cos(h) * dt;
    y += vm * Math.sin(h) * dt;
    ex[i] = x; ny[i] = y;
  }
  const path = lapPathByDistance(s, lap, ex, ny, step);
  const m = path.x.length;
  const x0 = path.x[0], y0 = path.y[0];
  const dx = path.x[m - 1] - x0, dy = path.y[m - 1] - y0;
  for (let k = 0; k < m; k++) {
    const f = k / (m - 1);
    path.x[k] -= x0 + dx * f;
    path.y[k] -= y0 + dy * f;
  }
  return { x: path.x, y: path.y, step, method: 'dead-reckoning' };
}

function angleMid(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d / 2;
}
