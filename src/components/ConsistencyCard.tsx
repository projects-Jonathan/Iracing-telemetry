import { useMemo } from 'react';
import type { Session } from '../types';
import type { DistLap } from '../analysis/lap';
import { consistency } from '../analysis/consistency';
import { fmtDist, fmtNum } from './util';

function grade(score: number): string {
  if (score >= 80) return 'Very consistent';
  if (score >= 70) return 'Consistent';
  if (score >= 60) return 'Some differences';
  return 'Quite different';
}

/** How closely the compare lap follows the reference lap (whole lap, or the zoomed section). */
export function ConsistencyCard({ s, ref_, cmp, zoom }: { s: Session; ref_: DistLap; cmp: DistLap | null; zoom: [number, number] | null }) {
  const c = useMemo(() => (cmp ? consistency(s, ref_, cmp, zoom) : null), [s, ref_, cmp, zoom]);

  return (
    <div className="card cons">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="label">Consistency</span>
        <span className="faint" style={{ fontSize: 12 }}>
          {zoom ? `zoomed ${fmtDist(zoom[0])} – ${fmtDist(zoom[1])}` : `${cmp ? `lap ${cmp.lap.num}` : '—'} vs lap ${ref_.lap.num}`}
        </span>
      </div>
      {!c ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Pick a compare lap to see how closely two laps line up.</p>
      ) : (
        <>
          <div className="cons-score">
            <span className="num">{Math.round(c.score)}%</span>
            <span>{grade(c.score)}</span>
          </div>
          <div className="cons-bars">
            {c.parts.map((p) => (
              <div key={p.key} className="cons-row" title={`Share of ${zoom ? 'this section' : 'the lap'} where both laps are within ${p.tol}`}>
                <span>{p.label}</span>
                <div className="cons-bar"><div style={{ width: `${p.pct}%` }} /></div>
                <span className="num">{Math.round(p.pct)}%</span>
              </div>
            ))}
          </div>
          <div className="cons-stats">
            <div><span className="faint">Brake points</span><span className="num">{c.brakeSpread === null ? '—' : `±${fmtNum(c.brakeSpread, 1)} m`}</span></div>
            <div><span className="faint">Apex speed</span><span className="num">{c.apexSpread === null ? '—' : `±${fmtNum(c.apexSpread, 1)} km/h`}</span></div>
            <div><span className="faint">Gap swing</span><span className="num">{fmtNum(c.maxSwing, 3)} s</span></div>
          </div>
          <p className="note" style={{ margin: 0 }}>
            Bars show how much of the {zoom ? 'section' : 'lap'} the two laps agree within tolerance (speed ±3 km/h, pedals ±10%, line ±1 m; brake is scored only in braking zones). Corner figures are average differences.
          </p>
        </>
      )}
    </div>
  );
}
