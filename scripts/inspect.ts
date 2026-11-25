// Usage: npx tsx scripts/inspect.ts <file...>  — parse telemetry files and print a lap summary.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseIbt } from '../src/parsers/ibt';
import { parseSimHub } from '../src/parsers/simhub';
import { buildSession } from '../src/analysis/session';

for (const f of process.argv.slice(2)) {
  const t0 = performance.now();
  const b = readFileSync(f);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const rec = f.toLowerCase().endsWith('.ibt') ? parseIbt(ab) : parseSimHub(ab);
  const s = buildSession(rec, basename(f), b.byteLength);
  const ms = performance.now() - t0;
  console.log(`\n== ${s.fileName}  (${(ms / 1000).toFixed(1)}s)`);
  console.log(`${s.game} | ${s.track} ${s.trackConfig} | ${(s.trackLength / 1000).toFixed(3)} km | ${s.car} | ${s.driver} | ${s.date} | ${s.rate} Hz | ${s.sampleCount} samples | ${Object.keys(s.channels).length} channels | sectors ${s.sectors.join(',')}`);
  console.log('map:', s.map?.method, s.map ? `${s.map.x.length} pts` : '');
  for (const l of s.laps) console.log(`  lap ${l.num}: ${l.time?.toFixed(3) ?? '—'} ${l.complete ? '' : '(' + l.note + ')'} inc=${l.incidents} sectors=${l.sectorTimes.map((x) => x?.toFixed(2)).join('/')}`);
}
