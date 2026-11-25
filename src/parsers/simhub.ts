import { inflateSync } from 'fflate';
import type { RawRecording } from './ibt';

/**
 * SimHub ".telemetry.json" reader. Despite the name it is a binary container:
 *
 *   "FF01"            4-byte magic
 *   u8                (unused)
 *   u32 headerSize    padding that follows (normally 10000 bytes)
 *   then repeated:    u8 kind, u32 length, `length` bytes of raw DEFLATE
 *
 * Each record inflates to one JSON frame (~10 per second). For iRacing the
 * frame is { SessionDataInfoUpdate, SessionDataRaw: <yaml>, Telemetry: <json string> }.
 * Other games carry their own raw structures; those are flattened generically
 * into dotted channel names (e.g. "Physics.SpeedKmh").
 */

const MAX_ARRAY = 4; // keep small vectors (e.g. AccG xyz, 4 tyres); skip per-car arrays

function isRecordAt(b: Uint8Array, dv: DataView, off: number): boolean {
  if (off + 5 > b.length) return false;
  const len = dv.getUint32(off + 1, true);
  return b[off] > 0 && b[off] < 8 && len > 16 && off + 5 + len <= b.length;
}

export function parseSimHub(buf: ArrayBuffer, onProgress?: (p: number) => void): RawRecording {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (!(b[0] === 0x46 && b[1] === 0x46 && b[2] === 0x30 && b[3] === 0x31)) {
    throw new Error('Not a SimHub telemetry file (missing FF01 header)');
  }
  let off = 9 + dv.getUint32(5, true);
  if (!isRecordAt(b, dv, off)) {
    // Fall back to scanning for the first record.
    off = 9;
    while (off < Math.min(b.length, 200_000) && !(b[off] === 1 && isRecordAt(b, dv, off))) off++;
  }

  const td = new TextDecoder('utf-8');
  const cols = new Map<string, number[]>();
  let frames = 0;
  let sessionYaml = '';
  let yamlVersion = -1;
  let lastReport = 0;

  const push = (name: string, v: number) => {
    let col = cols.get(name);
    if (!col) {
      col = new Array(frames).fill(NaN);
      cols.set(name, col);
    }
    col[frames] = v;
  };

  const flatten = (obj: unknown, prefix: string, depth: number) => {
    if (obj === null || obj === undefined || depth > 4) return;
    if (typeof obj === 'number') return push(prefix, obj);
    if (typeof obj === 'boolean') return push(prefix, obj ? 1 : 0);
    if (Array.isArray(obj)) {
      if (obj.length <= MAX_ARRAY) obj.forEach((v, i) => flatten(v, `${prefix}.${i}`, depth + 1));
      return;
    }
    if (typeof obj === 'object') {
      const o = obj as Record<string, unknown>;
      if ('$values' in o) return flatten(o.$values, prefix, depth);
      for (const k in o) {
        if (k === '$type' || k.endsWith('_ST') || k.startsWith('CarIdx')) continue;
        flatten(o[k], prefix ? `${prefix}.${k}` : k, depth + 1);
      }
    }
  };

  while (off + 5 <= b.length) {
    const len = dv.getUint32(off + 1, true);
    if (len === 0 || off + 5 + len > b.length) break;
    let frame: Record<string, unknown>;
    try {
      const raw = inflateSync(b.subarray(off + 5, off + 5 + len));
      frame = JSON.parse(td.decode(raw));
    } catch {
      off += 5 + len;
      continue;
    }
    off += 5 + len;

    for (const k in frame) {
      const v = frame[k];
      if (k === 'SessionDataRaw' && typeof v === 'string') {
        const ver = Number(frame.SessionDataInfoUpdate ?? 0);
        if (ver > yamlVersion || !sessionYaml) { sessionYaml = v; yamlVersion = ver; }
        continue;
      }
      if (k === 'SessionDataInfoUpdate') continue;
      if (typeof v === 'string' && v.charCodeAt(0) === 123 /* { */) {
        try { flatten(JSON.parse(v), k === 'Telemetry' ? '' : k, 0); } catch { /* not JSON */ }
      } else {
        flatten(v, k, 0);
      }
    }
    frames++;
    for (const col of cols.values()) if (col.length < frames) col.push(NaN);

    if (onProgress && off - lastReport > 2_000_000) {
      lastReport = off;
      onProgress(off / b.length);
    }
  }

  if (frames === 0) throw new Error('No telemetry frames found in this SimHub file');

  const channels: Record<string, Float32Array> = {};
  for (const [name, col] of cols) channels[name] = Float32Array.from(col);

  // Estimate the sample rate from session time if available.
  let rate = 10;
  const t = channels.SessionTime;
  if (t && frames > 10) {
    const dt = (t[frames - 1] - t[0]) / (frames - 1);
    if (dt > 0) rate = Math.round(1 / dt);
  }

  return {
    channels,
    units: {},
    sessionYaml,
    rate,
    date: null,
    game: sessionYaml.includes('WeekendInfo:') ? 'iRacing (SimHub)' : 'SimHub',
  };
}
