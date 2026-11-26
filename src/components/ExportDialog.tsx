import { useEffect, useRef, useState } from 'react';
import type { Session } from '../types';
import { setApp, useApp } from '../state/store';
import { exportLaps } from '../state/actions';
import { fmtDelta, fmtLap } from './util';

/** Pick laps to save into a .unison file. Starts with the current compare + reference laps ticked. */
export function ExportDialog({ s }: { s: Session }) {
  const open = useApp((a) => a.exportOpen);
  const refLap = useApp((a) => a.refLap);
  const cmpLap = useApp((a) => a.cmpLap);
  const busy = useApp((a) => a.loading?.name === 'Export');
  const notes = useApp((a) => a.notes);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const dialog = useRef<HTMLDivElement>(null);

  const laps = s.laps.map((l, i) => ({ l, i })).filter(({ l }) => l.complete && l.time !== null);
  const best = laps.length ? Math.min(...laps.map(({ l }) => l.time as number)) : null;

  useEffect(() => {
    if (!open) return;
    setPicked(new Set([refLap, cmpLap].filter((x): x is number => x !== null)));
    dialog.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setApp({ exportOpen: false }); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const toggle = (i: number) => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const close = () => setApp({ exportOpen: false });
  const count = picked.size;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="export-title" tabIndex={-1} ref={dialog}>
        <div className="modal-head">
          <h2 id="export-title">Export laps</h2>
          <button className="btn ghost icon" onClick={close} aria-label="Close">✕</button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Tick the laps to keep. They're saved as a <strong>.unison</strong> file with all their data. Open it here later to see just those laps.
        </p>
        {notes.length > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Your {notes.length} note{notes.length === 1 ? '' : 's'} {notes.length === 1 ? 'is' : 'are'} saved in the file too.
          </p>
        )}
        <div className="row-actions">
          <button className="btn" onClick={() => setPicked(new Set(laps.map(({ i }) => i)))}>Select all</button>
          <button className="btn" onClick={() => setPicked(new Set())}>Select none</button>
          <span className="faint" style={{ marginLeft: 'auto', fontSize: 12 }}>{count} of {laps.length} selected</span>
        </div>
        <div className="tablewrap export-list">
          <table className="data">
            <thead><tr><th style={{ width: 32 }} /><th>Lap</th><th>Time</th><th>Gap</th><th>Inc</th><th /></tr></thead>
            <tbody>
              {laps.map(({ l, i }) => (
                <tr key={i} className="click" onClick={() => toggle(i)}>
                  <td><input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} onClick={(e) => e.stopPropagation()} aria-label={`Lap ${l.num}`} /></td>
                  <td className="txt">{l.num}</td>
                  <td className={l.time === best ? 'best-sec' : ''}>{fmtLap(l.time)}</td>
                  <td>{best !== null && l.time !== best ? fmtDelta((l.time as number) - best) : ''}</td>
                  <td>{l.incidents ? `${l.incidents}x` : ''}</td>
                  <td className="txt faint" style={{ fontSize: 12 }}>{i === cmpLap ? 'compare' : i === refLap ? 'reference' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={!count || busy} onClick={() => exportLaps([...picked])}>
            {busy ? 'Exporting…' : `Export ${count} lap${count === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
