import type { Note, NoteKind, Session } from '../types';
import type { DistLap } from './lap';
import { cornersFor, type Corner } from './corners';

export const NOTE_KINDS: { kind: NoteKind; label: string }[] = [
  { kind: 'reference', label: 'Reference' },
  { kind: 'note', label: 'Note' },
];
export const kindLabel = (k: NoteKind) => NOTE_KINDS.find((x) => x.kind === k)?.label ?? 'Note';

/** A spot within this distance (m) of a corner's apex counts as "at" that corner. */
const NEAR_APEX_M = 150;

export interface CornerGuess {
  /** suggested description: "C4", or e.g. "Between C4 & C5" */
  text: string;
  /** true when the spot is at / close to a detected corner */
  matched: boolean;
}

/** Suggest which corner a lap distance belongs to (nearest apex within NEAR_APEX_M). */
export function guessCorner(s: Session, ref: DistLap, d: number): CornerGuess {
  const corners = cornersFor(s, ref);
  if (!corners.length) return { text: '', matched: false };
  let best: Corner | null = null, bestM = Infinity;
  for (const c of corners) {
    const m = Math.abs(c.apex * ref.step - d);
    if (m < bestM) { bestM = m; best = c; }
  }
  if (best && bestM <= NEAR_APEX_M) return { text: best.name, matched: true };
  // between two corners: name the neighbours
  const prev = [...corners].reverse().find((c) => c.apex * ref.step < d);
  const next = corners.find((c) => c.apex * ref.step > d);
  if (prev && next) return { text: `Between ${prev.name} & ${next.name}`, matched: false };
  if (next) return { text: `Before ${next.name}`, matched: false };
  return { text: `After ${(prev as Corner).name}`, matched: false };
}

/** Location label for a saved note: its description (or a fresh guess) plus the distance. */
export function noteWhere(s: Session, ref: DistLap, n: Pick<Note, 'd' | 'where'>): string {
  const where = n.where?.trim() || guessCorner(s, ref, n.d).text;
  const m = `${Math.round(n.d).toLocaleString()} m`;
  return where ? `${where} · ${m}` : m;
}
