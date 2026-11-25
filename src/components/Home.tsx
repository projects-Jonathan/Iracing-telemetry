import { useRef, useState } from 'react';
import { useApp } from '../state/store';
import { openFiles, openSaved, removeSaved } from '../state/actions';
import { fmtLap } from './util';

export function Home() {
  const library = useApp((s) => s.library);
  const loading = useApp((s) => s.loading);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <>
      <div className="hero">
        <h1>See every lap you drive.</h1>
        <p className="muted" style={{ margin: 0 }}>
          Drop in a telemetry file to compare laps, replay them with live G-forces, and find where the time is. Files are read in your browser and never uploaded.
        </p>
      </div>

      <div
        className={`drop ${over ? 'over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); openFiles([...e.dataTransfer.files]); }}
      >
        {loading ? (
          <>
            <div className="big">{loading.stage}…</div>
            <div className="muted">{loading.name}</div>
            <div className="progress"><div style={{ width: `${Math.round(loading.p * 100)}%` }} /></div>
          </>
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="big">Drop telemetry files here, or click to browse</div>
            <div className="muted">.ibt (iRacing) · .telemetry.json (SimHub)</div>
          </>
        )}
        <input ref={input} type="file" accept=".ibt,.json" multiple hidden onChange={(e) => { openFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>

      {library.length > 0 && (
        <section className="card card-pad">
          <h2 className="section">Saved sessions</h2>
          <div className="tablewrap">
            <table className="lib">
              <thead><tr><th>Track</th><th>Car</th><th>Date</th><th>Laps</th><th>Best</th><th>Source</th><th /></tr></thead>
              <tbody>
                {library.map((m) => (
                  <tr key={m.id} className="row" onClick={() => openSaved(m.id)}>
                    <td><strong>{m.track}</strong></td>
                    <td>{m.car}</td>
                    <td className="muted">{m.date ? new Date(m.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                    <td className="num">{m.laps}</td>
                    <td className="num">{fmtLap(m.best)}</td>
                    <td className="muted" title={m.fileName}>{m.game}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn ghost" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the saved session "${m.track}" from this browser?`)) removeSaved(m.id); }} aria-label="Delete saved session">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
