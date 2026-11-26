import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteKind, Session } from '../types';
import type { DistLap } from '../analysis/lap';
import { cornersFor } from '../analysis/corners';
import { NOTE_KINDS, guessCorner, kindLabel, noteWhere } from '../analysis/notes';
import { setApp, useApp } from '../state/store';
import { deleteNote, editNote, saveNote, seekDist, setNoteMode } from '../state/actions';

/**
 * Add / edit a note. The spot is always a distance (prefilled from the click), and the corner
 * box suggests which corner that is; pick another from the list or type any description.
 */
export function NoteEditor({ s, ref_ }: { s: Session; ref_: DistLap }) {
  const edit = useApp((a) => a.noteEdit);
  const [kind, setKind] = useState<NoteKind>('reference');
  const [text, setText] = useState('');
  const [dist, setDist] = useState(0);
  const [where, setWhere] = useState('');
  // true once the user has typed/picked a corner description, so moving the distance won't overwrite it
  const [whereTouched, setWhereTouched] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const corners = useMemo(() => cornersFor(s, ref_), [s, ref_]);

  useEffect(() => {
    if (!edit) return;
    setKind(edit.kind === 'reference' ? 'reference' : 'note');
    setText(edit.text);
    setDist(Math.round(edit.d));
    setWhere(edit.where ?? guessCorner(s, ref_, edit.d).text);
    setWhereTouched(!!edit.where);
    setListOpen(false);
    setTimeout(() => box.current?.focus(), 0);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setApp({ noteEdit: null }); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit]);

  if (!edit) return null;
  const close = () => setApp({ noteEdit: null });
  const guess = guessCorner(s, ref_, dist);
  const changeDist = (v: number) => {
    setDist(v);
    if (!whereTouched) setWhere(guessCorner(s, ref_, v).text);
  };
  // yellow until the user has described the spot themselves, when no detected corner is close
  const needsWhere = !guess.matched && !whereTouched;
  const canSave = text.trim().length > 0 && isFinite(dist) && where.trim().length > 0;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form
        className="modal card note-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-title"
        onSubmit={(e) => { e.preventDefault(); if (canSave) saveNote({ id: edit.id, d: dist, kind, text: text.trim(), where: where.trim() }); }}
      >
        <div className="modal-head">
          <h2 id="note-title">{edit.id ? 'Edit note' : 'Add note'}</h2>
          <button type="button" className="btn ghost icon" onClick={close} aria-label="Close">✕</button>
        </div>

        <div className="field">
          <span className="label">Type</span>
          <div className="seg" role="radiogroup" aria-label="Note type">
            {NOTE_KINDS.map((k) => (
              <button type="button" key={k.kind} role="radio" aria-checked={kind === k.kind} className={kind === k.kind ? 'on' : ''} onClick={() => setKind(k.kind)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="note-where-row">
          <div className="field">
            <label className="label" htmlFor="note-dist">Distance</label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input id="note-dist" type="number" min={0} max={Math.round(s.trackLength)} value={dist} onChange={(e) => changeDist(Number(e.target.value))} className="num-input" />
              <span className="muted">m</span>
            </span>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="note-corner">Corner</label>
            <div className={`combo ${needsWhere ? 'warn' : ''}`}>
              <input
                id="note-corner"
                value={where}
                onChange={(e) => { setWhere(e.target.value); setWhereTouched(true); }}
                placeholder="e.g. C4, or Between C4 & C5"
                autoComplete="off"
                aria-describedby="note-corner-help"
              />
              <button type="button" className="combo-btn" onClick={() => setListOpen((o) => !o)} aria-label="Choose a detected corner" aria-expanded={listOpen} disabled={!corners.length}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {listOpen && (
                <ul className="combo-list" role="listbox">
                  {corners.map((c) => (
                    <li key={c.id} role="option" aria-selected={where === c.name}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setWhere(c.name); setWhereTouched(true); setListOpen(false); }}>
                      <strong>{c.name}</strong><span className="faint">apex {Math.round(c.apex * ref_.step).toLocaleString()} m</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span id="note-corner-help" className={needsWhere ? 'warn-text' : 'faint'} style={{ fontSize: 12 }}>
              {!corners.length
                ? 'No corners were detected on this lap. Describe where this is.'
                : needsWhere
                  ? 'No corner here. Describe where this is (the nearest corners are suggested).'
                  : whereTouched ? 'Your description.' : `Detected automatically: nearest corner is ${guess.text}.`}
            </span>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="note-text">Note</label>
          <textarea id="note-text" ref={box} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'reference' ? 'e.g. Brake at the 100 m board' : 'Anything worth remembering here'} />
        </div>

        <div className="modal-foot">
          {edit.id && <button type="button" className="btn ghost danger" onClick={() => deleteNote(edit.id as string)} style={{ marginRight: 'auto' }}>Delete</button>}
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!canSave}>Save note</button>
        </div>
      </form>
    </div>
  );
}

/** All notes in track order. Click a note to move the playhead there. */
export function NotesCard({ s, ref_ }: { s: Session; ref_: DistLap }) {
  const notes = useApp((a) => a.notes);
  return (
    <section className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h2 className="section" style={{ margin: 0 }}>Notes</h2>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setNoteMode(true)}>Add notes</button>
      </div>
      {!notes.length ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>No notes yet. Use Add notes, then click the graph where you brake, get back on the throttle, or anything else worth remembering.</p>
      ) : (
        <ol className="notes-list">
          {notes.map((n, i) => (
            <li key={n.id}>
              <button className="note-num" onClick={() => seekDist(n.d)} title="Move the playhead here">n{i + 1}</button>
              <div className="note-body">
                <div className="note-meta"><span className={`kind kind-${n.kind}`}>{kindLabel(n.kind)}</span><span className="faint">{noteWhere(s, ref_, n)}</span></div>
                <div className="note-text">{n.text}</div>
              </div>
              <button className="btn ghost" onClick={() => editNote(n)}>Edit</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** "Notes ▾" menu in the graph header: add notes (graph-only mode) or show/hide them on the graph. */
export function NotesMenu() {
  const [open, setOpen] = useState(false);
  const hidden = useApp((a) => a.notesHidden);
  const count = useApp((a) => a.notes.length);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2.5h10v7.5L9.5 13.5H3z M9.5 13.5V10H13 M5.5 6h5M5.5 8.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" /></svg>
        Notes{count ? ` (${count})` : ''}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); setNoteMode(true); }}>
            <strong>{count ? 'Edit notes' : 'Add notes'}</strong>
            <span>Click anywhere to drop a note</span>
          </button>
          <button role="menuitem" disabled={!count} onClick={() => { setOpen(false); setApp({ notesHidden: !hidden }); }}>
            <strong>{hidden ? 'Show notes on graph' : 'Hide notes on graph'}</strong>
            <span>{count ? `${count} note${count === 1 ? '' : 's'}` : 'No notes yet'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
