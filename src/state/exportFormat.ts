import { gzipSync, gunzipSync } from 'fflate';
import type { Lap, Session } from '../types';
import { encodeDemo, decodeDemo } from './demoFormat';

/**
 * ".unison" export file: the chosen laps of a session, with every channel at full rate.
 *
 *   "UNSN"  4-byte magic
 *   u8      format version (1)
 *   ...     gzip of the session container from demoFormat.ts
 */
const MAGIC = [0x55, 0x4e, 0x53, 0x4e]; // "UNSN"
const VERSION = 1;

export function isUnisonFile(head: Uint8Array): boolean {
  return MAGIC.every((b, i) => head[i] === b);
}

export function encodeUnison(s: Session): Uint8Array {
  const body = gzipSync(encodeDemo(s), { level: 6 });
  const out = new Uint8Array(5 + body.length);
  out.set(MAGIC, 0);
  out[4] = VERSION;
  out.set(body, 5);
  return out;
}

export function decodeUnison(bytes: Uint8Array): Session {
  if (!isUnisonFile(bytes)) throw new Error('Not a Unison export file');
  if (bytes[4] !== VERSION) throw new Error(`This file was made by a newer version of Unison (format ${bytes[4]}).`);
  return decodeDemo(gunzipSync(bytes.subarray(5)));
}

/**
 * A copy of the session holding only the given laps (indices into s.laps).
 * Keeps one second either side of each lap; consecutive laps share one block of samples.
 */
export function sliceLaps(s: Session, indices: number[]): Session {
  const chosen = indices.map((i) => s.laps[i]).filter((l): l is Lap => !!l).sort((a, b) => a.start - b.start);
  if (!chosen.length) throw new Error('Pick at least one lap to export');
  const n = s.sampleCount;
  const pad = Math.max(1, Math.round(s.rate));

  // Sample ranges to keep, merged where laps touch.
  const segs: { a: number; b: number; laps: Lap[] }[] = [];
  for (const l of chosen) {
    const a = Math.max(0, Math.floor(l.start) - pad), b = Math.min(n - 1, Math.ceil(l.end) + pad);
    const last = segs[segs.length - 1];
    if (last && a <= last.b + 1) { last.b = Math.max(last.b, b); last.laps.push(l); }
    else segs.push({ a, b, laps: [l] });
  }
  const total = segs.reduce((t, g) => t + (g.b - g.a + 1), 0);

  const channels: Record<string, Float32Array> = {};
  for (const [key, src] of Object.entries(s.channels)) {
    const out = new Float32Array(total);
    let o = 0;
    for (const g of segs) { out.set(src.subarray(g.a, g.b + 1), o); o += g.b - g.a + 1; }
    channels[key] = out;
  }

  const laps: Lap[] = [];
  let o = 0;
  for (const g of segs) {
    for (const l of g.laps) laps.push({ ...l, start: l.start - g.a + o, end: l.end - g.a + o });
    o += g.b - g.a + 1;
  }

  const nums = chosen.map((l) => l.num).join(', ');
  return {
    ...s,
    id: `${s.id}-laps-${nums}`,
    fileName: `${s.track} - laps ${nums}.unison`,
    sampleCount: total,
    channels,
    laps,
    fileSize: 0,
    addedAt: Date.now(),
  };
}

/** Safe file name for downloads. */
export function exportFileName(s: Session, lapNums: number[]): string {
  const base = `${s.track}${s.trackConfig ? ` ${s.trackConfig}` : ''} - laps ${lapNums.join(', ')}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, '-').trim()}.unison`;
}
