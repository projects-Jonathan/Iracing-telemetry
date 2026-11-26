import type { Note, NoteKind, Session } from '../types';
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

const ACCEPT = /\.(ibt|json|unison)$/i;

export async function openFiles(files: File[]) {
  const usable = files.filter((f) => ACCEPT.test(f.name) && !f.name.endsWith('.metadata'));
  if (!usable.length) {
    setApp({ error: 'Choose an iRacing .ibt file, a SimHub .telemetry.json file or a Unison .unison export.' });
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
  setApp({ session: null, refLap: null, cmpLap: null, zoom: null, notice: null, notes: [], notesDirty: false, noteEdit: null, noteMode: false });
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
  setApp({ session: s, refLap, cmpLap: ranked[0]?.i ?? null, zoom: null, notes: normaliseNotes(s.notes), notesDirty: false, noteEdit: null, noteMode: false });
  playT.set(0);
  syncCursorToTime(0);
}

export function selectLaps(refLap: number | null, cmpLap: number | null) {
  setApp({ refLap, cmpLap });
  seekTime(playT.get()); // re-clamps to the play range, which depends on the reference lap
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
  // while the lap is playing, hovering the graph or map doesn't move the cursor off the playhead
  if (hover && app.get().playing) return;
  const { ref, cmp } = currentLaps();
  if (!ref) return;
  const k = Math.max(0, Math.min(ref.n - 1, d / ref.step));
  const i = Math.floor(k), f = k - i;
  const t = i >= ref.n - 1 ? ref.tm[ref.n - 1] : ref.tm[i] + (ref.tm[i + 1] - ref.tm[i]) * f;
  cursor.set({ t, d, cmpD: cmp ? distAtTime(cmp, t) : null, hover });
}

export function endHover() {
  // In note (edit) mode the line stays where the mouse left the graph, and that becomes the playhead.
  if (app.get().noteMode && cursor.get().hover) {
    playT.set(cursor.get().t);
    cursor.set({ ...cursor.get(), hover: false });
    return;
  }
  syncCursorToTime(playT.get());
}

/** Jump playback to a distance on the reference lap (kept inside the zoomed section, if any). */
export function seekDist(d: number) {
  const z = app.get().zoom;
  syncCursorToDist(z ? Math.max(z[0], Math.min(z[1], d)) : d, false);
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

/** Reference-lap elapsed time at a distance. */
function refTimeAt(ref: DistLap, d: number): number {
  const k = Math.max(0, Math.min(ref.n - 1, d / ref.step));
  const i = Math.floor(k), f = k - i;
  return i >= ref.n - 1 ? ref.tm[ref.n - 1] : ref.tm[i] + (ref.tm[i + 1] - ref.tm[i]) * f;
}

/**
 * The stretch of time playback covers: the whole lap, or — when the graph is
 * zoomed — the time the reference car takes to drive the zoomed section.
 */
export function playRange(): [number, number] {
  const { ref } = currentLaps();
  const zoom = app.get().zoom;
  if (!ref) return [0, 0];
  if (!zoom) return [0, lapDuration()];
  return [refTimeAt(ref, zoom[0]), refTimeAt(ref, zoom[1])];
}

/** Zoom the graph (null = whole lap). Pauses playback and keeps the playhead inside the new range. */
export function setZoom(zoom: [number, number] | null, opts: { toStart?: boolean } = {}) {
  stop();
  setApp({ zoom });
  const [t0, t1] = playRange();
  const t = playT.get();
  // toStart: a drag-selected section always starts playback from its beginning.
  // Otherwise (e.g. back to the whole lap) the playhead stays put unless it falls outside the view.
  if (opts.toStart || t < t0 || t > t1) seekTime(t0);
}

function tick(ts: number) {
  const dt = lastTs ? (ts - lastTs) / 1000 : 0;
  lastTs = ts;
  const [, end] = playRange();
  let t = playT.get() + dt * app.get().rate;
  if (t >= end) {
    t = end;
    playT.set(t);
    syncCursorToTime(t);
    stop();
    return;
  }
  playT.set(t);
  syncCursorToTime(t);
  raf = requestAnimationFrame(tick);
}

export function play() {
  if (app.get().playing) return;
  const [start, end] = playRange();
  // restart from the beginning of the range if at (or outside) its end
  if (playT.get() >= end - 0.01 || playT.get() < start) playT.set(start);
  setApp({ playing: true });
  syncCursorToTime(playT.get()); // drop any hover position so the cursor follows playback
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
  const [start, end] = playRange();
  playT.set(Math.max(start, Math.min(end, t)));
  syncCursorToTime(playT.get());
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

// ---- export --------------------------------------------------------------

/** Save the chosen laps (indices into session.laps) as a .unison file the site can open again. */
export async function exportLaps(indices: number[]) {
  const s = app.get().session;
  if (!s || !indices.length) return;
  setApp({ loading: { name: 'Export', stage: 'Packing laps', p: 0.5 } });
  // let the "packing" state paint before the (synchronous) compression work
  await new Promise((r) => setTimeout(r, 30));
  try {
    const { sliceLaps, encodeUnison, exportFileName } = await import('./exportFormat');
    // notes travel with the exported laps
    const sub = { ...sliceLaps(s, indices), notes: app.get().notes };
    const bytes = encodeUnison(sub);
    const name = exportFileName(s, sub.laps.map((l) => l.num));
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const kb = bytes.length / 1024;
    setApp({ loading: null, exportOpen: false, notesDirty: false, notice: `Exported ${sub.laps.length} lap${sub.laps.length > 1 ? 's' : ''} to "${name}" (${kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`}). Open it here any time to see just those laps.` });
  } catch (e) {
    setApp({ loading: null, error: `Export failed: ${(e as Error).message}` });
  }
}

// ---- notes ----------------------------------------------------------------

/** Open the note editor: a new note at distance `d`, or an existing note. */
export function editNote(target: { d: number } | Note) {
  if ('id' in target) setApp({ noteEdit: { id: target.id, d: target.d, kind: target.kind, text: target.text, where: target.where } });
  else setApp({ noteEdit: { d: target.d, kind: 'reference', text: '' } });
}

/** Graph-only mode for adding notes by clicking: playback stops and other panels are hidden. */
export function setNoteMode(on: boolean) {
  stop();
  setApp({ noteMode: on, zoom: on ? null : app.get().zoom, notesHidden: on ? false : app.get().notesHidden, noteEdit: null });
  if (on) window.scrollTo({ top: 0 });
}

export function saveNote(n: { id?: string; d: number; kind: NoteKind; text: string; where: string }) {
  const notes = app.get().notes;
  const d = Math.max(0, Math.min(app.get().session?.trackLength ?? n.d, n.d));
  const next = n.id
    ? notes.map((x) => (x.id === n.id ? { ...x, d, kind: n.kind, text: n.text, where: n.where } : x))
    : [...notes, { id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, d, kind: n.kind, text: n.text, where: n.where }];
  setApp({ notes: next.sort((a, b) => a.d - b.d), notesDirty: true, noteEdit: null });
}

export function deleteNote(id: string) {
  setApp({ notes: app.get().notes.filter((x) => x.id !== id), notesDirty: true, noteEdit: null });
}

/** Older files used Brake/Acceleration/Other types; those all become plain notes now. */
function normaliseNotes(notes: Note[] | undefined): Note[] {
  return (notes ?? []).map((n) => (n.kind === 'reference' || n.kind === 'note' ? n : { ...n, kind: 'note' as NoteKind }));
}
