import type { Session } from '../types';

/**
 * Compact container for the bundled demo session:
 *   u32 headerLength | JSON header (padded to 4 bytes) | Float32 channel data | Float32 map x,y
 * The whole thing is gzipped on disk.
 */
interface Header {
  meta: Omit<Session, 'channels' | 'map'>;
  channels: { key: string; n: number }[];
  map: { n: number; step: number; method: 'gps' | 'dead-reckoning' } | null;
}

export function encodeDemo(s: Session): Uint8Array {
  const { channels, map, ...meta } = s;
  const header: Header = {
    meta,
    channels: Object.entries(channels).map(([key, a]) => ({ key, n: a.length })),
    map: map ? { n: map.x.length, step: map.step, method: map.method } : null,
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const hlen = Math.ceil(json.length / 4) * 4;
  const arrays: Float32Array[] = [...Object.values(channels), ...(map ? [map.x, map.y] : [])];
  const total = 4 + hlen + arrays.reduce((t, a) => t + a.byteLength, 0);
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, hlen, true);
  out.set(json, 4);
  out.fill(0x20, 4 + json.length, 4 + hlen); // pad with spaces (valid JSON whitespace)
  let off = 4 + hlen;
  for (const a of arrays) {
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off);
    off += a.byteLength;
  }
  return out;
}

export function decodeDemo(bytes: Uint8Array): Session {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const hlen = new DataView(buf).getUint32(0, true);
  const header: Header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  let off = 4 + hlen;
  const take = (n: number) => {
    const a = new Float32Array(buf, off, n);
    off += n * 4;
    return a;
  };
  const channels: Record<string, Float32Array> = {};
  for (const c of header.channels) channels[c.key] = take(c.n);
  const map = header.map ? { x: take(header.map.n), y: take(header.map.n), step: header.map.step, method: header.map.method } : null;
  return { ...header.meta, channels, map, addedAt: Date.now() };
}
