import { useEffect } from 'react';
import type { Session } from '../types';
import { playT, setApp, useApp, useSignal } from '../state/store';
import { getLapDuration, seekTime, selectLaps, togglePlay } from '../state/actions';
import { fmtDelta, fmtLap } from './util';

const RATES = [0.25, 0.5, 1, 2, 4];

export function Toolbar({ s }: { s: Session }) {
  const refLap = useApp((a) => a.refLap);
  const cmpLap = useApp((a) => a.cmpLap);
  const playing = useApp((a) => a.playing);
  const rate = useApp((a) => a.rate);
  const zoom = useApp((a) => a.zoom);
  const t = useSignal(playT);
  const dur = getLapDuration();

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

  const label = (l: (typeof options)[number]['l']) => `Lap ${l.num} · ${fmtLap(l.time)}${l.incidents ? ` · ${l.incidents}x` : ''}`;

  return (
    <section className="card toolbar" aria-label="Lap selection and playback">
      <div className="ctl">
        <label className="label" htmlFor="refSel">Reference</label>
        <div className="row"><span className="sw ref" />
          <select id="refSel" value={refLap ?? ''} onChange={(e) => selectLaps(Number(e.target.value), cmpLap === Number(e.target.value) ? null : cmpLap)}>
            {options.map(({ i, l }) => <option key={i} value={i}>{label(l)}</option>)}
          </select>
        </div>
      </div>
      <div className="ctl">
        <label className="label" htmlFor="cmpSel">Compare</label>
        <div className="row"><span className="sw cmp" />
          <select id="cmpSel" value={cmpLap ?? ''} onChange={(e) => selectLaps(refLap, e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">None</option>
            {options.filter(({ i }) => i !== refLap).map(({ i, l }) => <option key={i} value={i}>{label(l)}</option>)}
          </select>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><span className="label">Reference</span><span className="v">{fmtLap(ref?.time)}</span></div>
        <div className="stat"><span className="label">Compare</span><span className="v">{fmtLap(cmp?.time)}</span></div>
        <div className="stat"><span className="label">Gap</span><span className={`v ${gap === null ? '' : gap > 0 ? 'loss' : 'gain'}`}>{fmtDelta(gap)}</span></div>
      </div>
      <div className="play">
        <button className="btn primary playbtn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play lap'} title="Play / pause (Space)">
          {playing
            ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11a.6.6 0 0 0 .9.5l9-5.5a.6.6 0 0 0 0-1L3.9 1a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>}
        </button>
        <input type="range" min={0} max={dur || 1} step={0.01} value={Math.min(t, dur)} onChange={(e) => seekTime(Number(e.target.value))} aria-label="Playback position" />
        <span className="time">{fmtLap(t)} / {fmtLap(dur)}</span>
        <select aria-label="Playback speed" value={rate} onChange={(e) => setApp({ rate: Number(e.target.value) })}>
          {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
        {zoom && <button className="btn" onClick={() => setApp({ zoom: null })}>Show full lap</button>}
      </div>
    </section>
  );
}
