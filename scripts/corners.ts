// Usage: npx tsx scripts/corners.ts <file>  — print detected corners for the best lap vs second best.
import { readFileSync } from 'node:fs';
import { parseIbt } from '../src/parsers/ibt';
import { parseSimHub } from '../src/parsers/simhub';
import { buildSession } from '../src/analysis/session';
import { distLap, deltaOn } from '../src/analysis/lap';
import { findCorners, cornerStats } from '../src/analysis/corners';
const f = process.argv[2]; const b = readFileSync(f); const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const s = buildSession(f.endsWith('.ibt') ? parseIbt(ab) : parseSimHub(ab), f, b.length);
const laps = s.laps.filter((l) => l.complete).sort((a, b) => a.time! - b.time!);
const ref = distLap(s, laps[0]), cmp = distLap(s, laps[1]);
console.log('ref', laps[0].num, laps[0].time, 'cmp', laps[1].num, laps[1].time, 'grid tm end', ref.tm[ref.n - 1].toFixed(3), cmp.tm[cmp.n - 1].toFixed(3), 'delta end', deltaOn(ref, cmp)[ref.n - 1].toFixed(3));
for (const c of findCorners(s, ref)) { const a = cornerStats(s, ref, c)!, z = cornerStats(s, cmp, c)!; console.log(c.name, `${(c.entry * ref.step).toFixed(0)}-${(c.exit * ref.step).toFixed(0)}m`, 'min', a.minSpeed.toFixed(1), z.minSpeed.toFixed(1), 'brake@', a.brakeDist?.toFixed(0), z.brakeDist?.toFixed(0), 'dt', (z.time - a.time).toFixed(3)); }
