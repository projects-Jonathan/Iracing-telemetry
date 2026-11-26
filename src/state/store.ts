import { useSyncExternalStore } from 'react';
import type { Note, NoteKind, Session } from '../types';

/** Minimal observable value. */
export class Signal<T> {
  private subs = new Set<() => void>();
  constructor(private value: T) {}
  get = () => this.value;
  set = (v: T) => {
    if (Object.is(v, this.value)) return;
    this.value = v;
    this.subs.forEach((f) => f());
  };
  update = (fn: (v: T) => T) => this.set(fn(this.value));
  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => { this.subs.delete(f); };
  };
}

export function useSignal<T>(s: Signal<T>): T {
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}

export const DEFAULT_PANELS = ['delta', 'speed', 'throttle', 'brake', 'gear', 'steer'];

export interface AppState {
  session: Session | null;
  loading: { name: string; stage: string; p: number } | null;
  error: string | null;
  notice: string | null;
  /** indices into session.laps */
  refLap: number | null;
  cmpLap: number | null;
  panels: string[];
  /** visible distance range in metres, null = whole lap */
  zoom: [number, number] | null;
  mapChannel: string;
  theme: 'light' | 'dark';
  playing: boolean;
  /** true while the print sheet is rendered and the print dialog is open */
  printing: boolean;
  /** lap-export dialog open */
  exportOpen: boolean;
  /** notes for the open session */
  notes: Note[];
  /** notes changed since the file was opened or last exported */
  notesDirty: boolean;
  /** note being added/edited (id undefined = new) */
  noteEdit: { id?: string; d: number; kind: NoteKind; text: string; where?: string } | null;
  /** graph-only "click to add notes" mode (playback and other panels hidden) */
  noteMode: boolean;
  /** note markers hidden on the graph */
  notesHidden: boolean;
  rate: number;
}

function initialTheme(): 'light' | 'dark' {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function initialPanels(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('panels') ?? 'null');
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
  } catch { /* ignore */ }
  return DEFAULT_PANELS;
}

export const app = new Signal<AppState>({
  session: null,
  loading: null,
  error: null,
  notice: null,
  refLap: null,
  cmpLap: null,
  panels: initialPanels(),
  zoom: null,
  mapChannel: 'speed',
  theme: initialTheme(),
  playing: false,
  printing: false,
  exportOpen: false,
  notes: [],
  notesDirty: false,
  noteEdit: null,
  noteMode: false,
  notesHidden: false,
  rate: 1,
});

export const setApp = (patch: Partial<AppState>) => app.update((s) => ({ ...s, ...patch }));

export function useApp<K>(sel: (s: AppState) => K): K {
  return useSyncExternalStore(app.subscribe, () => sel(app.get()), () => sel(app.get()));
}

/**
 * Cursor shared by the chart, map and dash. `t` is elapsed time on the
 * reference lap; `d` the reference distance; `cmpD` where the compare lap is
 * at that same elapsed time (the "ghost").
 */
export interface Cursor { d: number; t: number; cmpD: number | null; hover: boolean }
export const cursor = new Signal<Cursor>({ d: 0, t: 0, cmpD: null, hover: false });

/** Playback position, elapsed seconds into the reference lap. */
export const playT = new Signal<number>(0);
