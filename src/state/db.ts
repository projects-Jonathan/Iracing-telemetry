import { createStore, get, set, del, keys } from 'idb-keyval';
import type { Session } from '../types';

/** Saved sessions live only in this browser's IndexedDB. */
const store = createStore('unison', 'sessions');

export interface SessionSummary {
  id: string;
  fileName: string;
  game: string;
  track: string;
  car: string;
  date: string | null;
  laps: number;
  best: number | null;
  addedAt: number;
}

export function summarise(s: Session): SessionSummary {
  const times = s.laps.filter((l) => l.complete && l.time !== null).map((l) => l.time as number);
  return {
    id: s.id,
    fileName: s.fileName,
    game: s.game,
    track: s.track,
    car: s.car,
    date: s.date,
    laps: times.length,
    best: times.length ? Math.min(...times) : null,
    addedAt: s.addedAt,
  };
}

export async function saveSession(s: Session): Promise<void> {
  await set(`s:${s.id}`, s, store);
  await set(`m:${s.id}`, summarise(s), store);
}

export async function loadSession(id: string): Promise<Session | undefined> {
  return get<Session>(`s:${id}`, store);
}

export async function deleteSession(id: string): Promise<void> {
  await del(`s:${id}`, store);
  await del(`m:${id}`, store);
}

export async function listSessions(): Promise<SessionSummary[]> {
  const all = (await keys(store)).filter((k) => String(k).startsWith('m:'));
  const items = await Promise.all(all.map((k) => get<SessionSummary>(k, store)));
  return items.filter((x): x is SessionSummary => !!x).sort((a, b) => b.addedAt - a.addedAt);
}
