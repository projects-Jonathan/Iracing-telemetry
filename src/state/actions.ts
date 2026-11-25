import type { Session } from '../types';
import type { WorkerOut } from '../worker/parse.worker';
import { app, setApp, cursor, playT } from './store';
import { distLap, distAtTime, type DistLap } from '../analysis/lap';
import { bestLap } from '../analysis/session';

/** Sessions are no longer kept in the browser; remove anything an older version stored. */
export function clearOldStorage() {
  try {
    for (const name of ['unison', 'lap-lens']) indexedDB.deleteDatabase(name);
  } catch { /* IndexedDB unavailable — nothing to clear */ }
}

function parseInWorker(file: File): Promise<Session> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../worker/parse.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'progress') setApp({ loading: { name: file.name, stage: m.stage, p: m.p } });
      else {
        w.terminate();
        if (m.type === 'done') resolve(m.session);
        else reject(new Error(m.message));
      }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Parser crashed')); };
    w.postMessage({ file });
  });
}

const ACCEPT = /\.(ibt|json)$/i;

export async function openFiles(files: File[]) {
  const usable = files.filter((f) => ACCEPT.test(f.name) && !f.name.endsWith('.metadata'));
  if (!usable.length) {
    setApp({ error: 'Choose an iRacing .ibt file or a SimHub .telemetry.json file.' });
    return;
  }
  setApp({ error: null, notice: null });
  let last: Session | null = null;
  const errors: string[] = [];
  for (const f of usable) {
    try {
      setApp({ loading: { name: f.name, stage: 'Reading file', p: 0 } });
      const s = await parseInWorker(f);
      if (!s.laps.some((l) => l.complete)) {
        errors.push(`${f.name}: no complete laps were driven in this recording.`);
        continue;
      }
      last = s;
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  setApp({ loading: null, error: errors.length ? errors.join('\n') : null });
  if (last) activate(last);
}

/** Load the bundled demo session (a few real laps). */
export async function openDemo() {
  setApp({ error: null, loading: { name: 'Demo session', stage: 'Downloading demo', p: 0.3 } });
  try {
    const res = await fetch(new URL('demo/session.bin', document.baseURI));
    if (!res.ok) throw new Error(`Demo download failed (${res.status})`);
    const [{ gunzipSync }, { decodeDemo }] = await Promise.all([import('fflate'), import('./demoFormat')]);
    const s = decodeDemo(gunzipSync(new Uint8Array(await res.arrayBuffer())));
    setApp({
      loading: null,
      notice: `You're viewing a demo: ${s.laps.length} real laps of ${s.track} in an ${s.car}. Press play, hover the charts, or drop your own .ibt / SimHub file to analyse it.`,
    });
    activate(s);
  } catch (e) {
    setApp({ loading: null, error: (e as Error).message });
  }
}

export function closeSession() {
  stop();
  setApp({ session: null, refLap: null, cmpLap: null, zoom: null, notice: null });
}

function activate(s: Session) {
  stop();
  const best = bestLap(s);
  const refLap = best ? s.laps.indexOf(best) : s.laps.findIndex((l) => l.complete);
  // Compare against the next-fastest complete lap.
  const ranked = s.laps
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => l.complete && i !== refLap)
    .sort((a, b) => (a.l.time as number) - (b.l.time as number));
  setApp({ session: s, refLap, cmpLap: ranked[0]?.i ?? null, zoom: null });
  playT.set(0);
  syncCursorToTime(0);
}

export function selectLaps(refLap: number | null, cmpLap: number | null) {
  setApp({ refLap, cmpLap });
  syncCursorToTime(playT.get());
}

/** Distance-grid laps for the current selection. */
export function currentLaps(): { s: Session | null; ref: DistLap | null; cmp: DistLap | null } {
  const { session: s, refLap, cmpLap } = app.get();
  if (!s || refLap === null || !s.laps[refLap]) return { s, ref: null, cmp: null };
  const ref = distLap(s, s.laps[refLap]);
  const cmp = cmpLap !== null && s.laps[cmpLap] ? distLap(s, s.laps[cmpLap]) : null;
  return { s, ref, cmp };
}

export function syncCursorToTime(t: number, hover = false) {
  const { ref, cmp } = currentLaps();
  if (!ref) return;
  cursor.set({ t, d: distAtTime(ref, t), cmpD: cmp ? distAtTime(cmp, t) : null, hover });
}

export function syncCursorToDist(d: number, hover: boolean) {
  const { ref, cmp } = currentLaps();
  if (!ref) return;
  const k = Math.max(0, Math.min(ref.n - 1, d / ref.step));
  const i = Math.floor(k), f = k - i;
  const t = i >= ref.n - 1 ? ref.tm[ref.n - 1] : ref.tm[i] + (ref.tm[i + 1] - ref.tm[i]) * f;
  cursor.set({ t, d, cmpD: cmp ? distAtTime(cmp, t) : null, hover });
}

export function endHover() {
  syncCursorToTime(playT.get());
}

/** Jump playback to a distance on the reference lap. */
export function seekDist(d: number) {
  syncCursorToDist(d, false);
  playT.set(cursor.get().t);
}

// ---- playback -----------------------------------------------------------

let raf = 0;
let lastTs = 0;

function lapDuration(): number {
  const { ref, cmp } = currentLaps();
  if (!ref) return 0;
  return Math.max(ref.tm[ref.n - 1], cmp ? cmp.tm[cmp.n - 1] : 0);
}

function tick(ts: number) {
  const dt = lastTs ? (ts - lastTs) / 1000 : 0;
  lastTs = ts;
  const dur = lapDuration();
  let t = playT.get() + dt * app.get().rate;
  if (t >= dur) {
    t = dur;
    playT.set(t);
    syncCursorToTime(t);
    stop();
    return;
  }
  playT.set(t);
  if (!cursor.get().hover) syncCursorToTime(t);
  raf = requestAnimationFrame(tick);
}

export function play() {
  if (app.get().playing) return;
  if (playT.get() >= lapDuration() - 0.01) playT.set(0);
  setApp({ playing: true });
  lastTs = 0;
  raf = requestAnimationFrame(tick);
}

export function stop() {
  cancelAnimationFrame(raf);
  if (app.get().playing) setApp({ playing: false });
}

export function togglePlay() {
  if (app.get().playing) stop(); else play();
}

export function seekTime(t: number) {
  playT.set(Math.max(0, Math.min(lapDuration(), t)));
  syncCursorToTime(playT.get());
}

export function getLapDuration() {
  return lapDuration();
}

export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  setApp({ theme });
}

export function setPanels(panels: string[]) {
  try { localStorage.setItem('panels', JSON.stringify(panels)); } catch { /* ignore */ }
  setApp({ panels });
}
