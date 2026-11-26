import { useRef, useState } from 'react';
import { useApp } from '../state/store';
import { openDemo, openFiles } from '../state/actions';

export function Home() {
  const loading = useApp((s) => s.loading);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="home">
      {/* blurred preview of the analysis screen behind the upload page */}
      <div className="home-bg" aria-hidden="true" />
      <div className="hero">
        <h1>See every lap you drive.</h1>
        <p className="muted" style={{ margin: 0 }}>
          Drop in a telemetry file to compare laps, replay them with live G-forces, and find where the time is.
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
            <div className="muted">.ibt (iRacing) · .telemetry.json (SimHub) · .unison (exported laps)</div>
            <div className="try">
              <span className="faint">No file handy?</span>
              <button
                className="btn primary"
                onClick={(e) => { e.stopPropagation(); openDemo(); }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11a.6.6 0 0 0 .9.5l9-5.5a.6.6 0 0 0 0-1L3.9 1a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
                Try it out
              </button>
            </div>
          </>
        )}
        <input ref={input} type="file" accept=".ibt,.json,.unison" multiple hidden onChange={(e) => { openFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
    </div>
  );
}
