import { useEffect } from 'react';
import type { Session } from '../types';
import { playT, setApp, useApp, useSignal } from '../state/store';
import { playRange, seekTime, selectLaps, togglePlay } from '../state/actions';
import { fmtDelta, fmtLap } from './util';
import { LapSelect } from './LapSelect';

const RATES = [0.25, 0.5, 1, 2, 4];

export function Toolbar({ s }: { s: Session }) {
  const refLap = useApp((a) => a.refLap);
  const cmpLap = useApp((a) => a.cmpLap);
  const playing = useApp((a) => a.playing);
  const rate = useApp((a) => a.rate);
  const t = useSignal(playT);
  useApp((a) => a.zoom); // re-render when the zoomed section (and so the play range) changes
  const [start, end] = playRange();

  const options = s.laps.map((l, i) => ({ i, l })).filter(({ l }) => l.complete);
  const ref = refLap !== null ? s.laps[refLap] : null;
  const cmp = cmpLap !== null ? s.laps[cmpLap] : null;
  const gap = ref?.time != null && cmp?.time != null ? cmp.time - ref.time : null;

  // Space toggles playback; arrows step 0.5 s (when not typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') seekTime(playT.get() + 0.5);
      else if (e.code === 'ArrowLeft') seekTime(playT.get() - 0.5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const times = options.map(({ l }) => l.time).filter((x): x is number => x !== null);
  const best = times.length ? Math.min(...times) : null;

  return (
    <section className="card toolbar" aria-label="Lap selection and playback">
      {/* Compare is the lap being analysed, so it leads; Reference is the benchmark beside it. */}
      <LapSelect
        label="Compare"
        kind="cmp"
        value={cmpLap}
        best={best}
        options={[{ value: null, lap: null }, ...options.filter(({ i }) => i !== refLap).map(({ i, l }) => ({ value: i, lap: l }))]}
        onChange={(v) => selectLaps(refLap, v)}
      />
      <LapSelect
        label="Reference"
        kind="ref"
        value={refLap}
        best={best}
        options={options.map(({ i, l }) => ({ value: i, lap: l }))}
        onChange={(v) => { if (v !== null) selectLaps(v, cmpLap === v ? null : cmpLap); }}
      />
      <div className="stats">
        <div className="stat"><span className="label">Compare</span><span className="v">{fmtLap(cmp?.time)}</span></div>
        <div className="stat"><span className="label">Reference</span><span className="v">{fmtLap(ref?.time)}</span></div>
        <div className="stat"><span className="label">Gap</span><span className={`v ${gap === null ? '' : gap > 0 ? 'loss' : 'gain'}`}>{fmtDelta(gap)}</span></div>
      </div>
      <div className="play">
        <button className="btn primary playbtn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play lap'} title="Play / pause (Space)">
          {playing
            ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11a.6.6 0 0 0 .9.5l9-5.5a.6.6 0 0 0 0-1L3.9 1a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>}
        </button>
        <input type="range" min={start} max={end || 1} step={0.01} value={Math.max(start, Math.min(t, end))} onChange={(e) => seekTime(Number(e.target.value))} aria-label="Playback position" />
        <span className="time">{fmtLap(t)} / {fmtLap(end)}</span>
        <select aria-label="Playback speed" value={rate} onChange={(e) => setApp({ rate: Number(e.target.value) })}>
          {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
      </div>
    </section>
  );
}
