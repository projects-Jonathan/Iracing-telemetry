import { useEffect, useRef, useState } from 'react';
import { setApp, useApp } from './state/store';
import { closeSession, openFiles, refreshLibrary, setTheme } from './state/actions';
import { Home } from './components/Home';
import { SessionView } from './components/SessionView';

export function App() {
  const session = useApp((s) => s.session);
  const loading = useApp((s) => s.loading);
  const error = useApp((s) => s.error);
  const notice = useApp((s) => s.notice);
  const theme = useApp((s) => s.theme);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { refreshLibrary(); }, []);

  return (
    <div
      onDragOver={(e) => { if (session) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (session) { e.preventDefault(); setDragging(false); openFiles([...e.dataTransfer.files]); } }}
      style={{ minHeight: '100vh', outline: dragging ? '3px dashed var(--accent)' : 'none', outlineOffset: -6 }}
    >
      <nav className="topbar">
        <button className="brand" onClick={closeSession} aria-label="Unison home">
          <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)" /><path d="M6 22c4-10 8-12 11-6s6 4 9-6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
          Unison
        </button>
        <span className="spacer" />
        {loading && session && <span className="muted" style={{ fontSize: 13 }}>{loading.stage} {Math.round(loading.p * 100)}%…</span>}
        {session && <button className="btn" onClick={closeSession}>All sessions</button>}
        <button className="btn" onClick={() => input.current?.click()}>Open file…</button>
        <input ref={input} type="file" accept=".ibt,.json" multiple hidden onChange={(e) => { openFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <button className="btn icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title="Toggle theme">
          {theme === 'light'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}
        </button>
      </nav>
      <main className="page">
        {error && <div className="banner error" role="alert"><span>{error}</span><button className="btn ghost close" onClick={() => setApp({ error: null })} aria-label="Dismiss">✕</button></div>}
        {notice && <div className="banner" role="status"><span>{notice}</span><button className="btn ghost close" onClick={() => setApp({ notice: null })} aria-label="Dismiss">✕</button></div>}
        {session ? <SessionView s={session} /> : <Home />}
      </main>
      <footer className="footer">Unison · telemetry is processed locally in your browser</footer>
    </div>
  );
}
