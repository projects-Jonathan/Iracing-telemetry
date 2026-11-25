// Build the bundled demo session from a real recording.
// Usage: npx tsx scripts/make-demo.ts <file.ibt> <firstLap> <lastLap> [out=public/demo/session.bin]
//
// Keeps only the chosen consecutive laps and the canonical channels, halves the
// sample rate, and gzips the result so the demo is a small download.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'fflate';
import { parseIbt } from '../src/parsers/ibt';
import { buildSession } from '../src/analysis/session';
import { CANON_BY_KEY } from '../src/parsers/channels';
import { encodeDemo } from '../src/state/demoFormat';

const [file, first, last, out = 'public/demo/session.bin'] = process.argv.slice(2);
const b = readFileSync(file);
const s = buildSession(parseIbt(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), 'demo.ibt', b.length);

const laps = s.laps.filter((l) => l.num >= Number(first) && l.num <= Number(last));
if (!laps.length || laps.some((l) => !l.complete)) throw new Error('Pick consecutive complete laps');
const DECIMATE = 2;
const pad = s.rate * 2; // keep 2 s either side
const i0 = Math.max(0, Math.floor(laps[0].start) - pad);
const i1 = Math.min(s.sampleCount - 1, Math.ceil(laps[laps.length - 1].end) + pad);

const channels: Record<string, Float32Array> = {};
for (const key of Object.keys(s.channels)) {
  if (!CANON_BY_KEY[key]) continue; // canonical channels only
  const src = s.channels[key];
  const n = Math.floor((i1 - i0) / DECIMATE) + 1;
  const a = new Float32Array(n);
  for (let k = 0; k < n; k++) a[k] = src[i0 + k * DECIMATE];
  channels[key] = a;
}
const sampleCount = channels.time.length;
const shift = (i: number) => (i - i0) / DECIMATE;

const demo = {
  ...s,
  id: 'demo',
  fileName: 'Demo session',
  driver: '', // keep the public demo anonymous
  rate: s.rate / DECIMATE,
  sampleCount,
  channels,
  info: Object.fromEntries(Object.keys(channels).map((k) => [k, s.info[k]])),
  laps: laps.map((l) => ({ ...l, start: shift(l.start), end: shift(l.end) })),
  fileSize: 0,
};

const bytes = gzipSync(encodeDemo(demo), { level: 9 });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`${demo.track} laps ${laps.map((l) => `${l.num} (${l.time?.toFixed(3)})`).join(', ')} | ${sampleCount} samples @ ${demo.rate} Hz | ${Object.keys(channels).length} channels | ${(bytes.length / 1024).toFixed(0)} KB -> ${out}`);
