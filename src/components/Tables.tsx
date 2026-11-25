import { useMemo } from 'react';
import type { Session } from '../types';
import { cornerStats, cornersFor } from '../analysis/corners';
import type { DistLap } from '../analysis/lap';
import { setApp, useApp } from '../state/store';
import { seekDist, selectLaps } from '../state/actions';
import { fmtDelta, fmtLap, fmtNum } from './util';

export function LapTable({ s }: { s: Session }) {
  const refLap = useApp((a) => a.refLap);
  const cmpLap = useApp((a) => a.cmpLap);
  const nSec = s.sectors.length;
  const complete = s.laps.filter((l) => l.complete && l.time !== null);
  const best = complete.length ? Math.min(...complete.map((l) => l.time as number)) : null;

  const bestSec = useMemo(() => {
    const out: (number | null)[] = [];
    for (let j = 0; j < nSec; j++) {
      const v = complete.map((l) => l.sectorTimes[j]).filter((x): x is number => x !== null && x !== undefined);
      out.push(v.length ? Math.min(...v) : null);
    }
    return out;
  }, [s, nSec, complete]);
  const ideal = bestSec.every((x) => x !== null) && nSec > 1 ? bestSec.reduce<number>((a, b) => a + (b as number), 0) : null;

  return (
    <section className="card card-pad">
      <h2 className="section">Laps &amp; sectors</h2>
      <div className="tablewrap">
        <table className="data">
          <thead>
            <tr>
              <th>Lap</th><th>Time</th><th>Gap</th>
              {nSec > 1 && s.sectors.map((_, j) => <th key={j}>S{j + 1}</th>)}
              <th>Inc</th><th style={{ textAlign: 'center' }}>Use as</th>
            </tr>
          </thead>
          <tbody>
            {s.laps.map((l, i) => (
              <tr key={i} className={`${l.complete ? '' : 'dim'} ${i === refLap ? 'is-ref' : i === cmpLap ? 'is-cmp' : ''}`}>
                <td className="txt">{l.num}{l.time === best && best !== null ? <span className="chip" style={{ marginLeft: 6 }}>best</span> : null}</td>
                <td>{l.complete ? fmtLap(l.time) : <span className="txt" style={{ fontFamily: 'var(--font)' }}>{l.note}</span>}</td>
                <td>{l.complete && best !== null && l.time !== best ? fmtDelta((l.time as number) - best) : ''}</td>
                {nSec > 1 && s.sectors.map((_, j) => {
                  const v = l.sectorTimes[j];
                  return <td key={j} className={v != null && v === bestSec[j] ? 'best-sec' : ''}>{v != null ? v.toFixed(3) : ''}</td>;
                })}
                <td>{l.incidents ? `${l.incidents}x` : ''}</td>
                <td style={{ textAlign: 'center' }}>
                  {l.complete && (
                    <span className="pick">
                      <button className={`r ${i === refLap ? 'on' : ''}`} onClick={() => selectLaps(i, cmpLap === i ? null : cmpLap)} aria-pressed={i === refLap}>Ref</button>
                      <button className={`c ${i === cmpLap ? 'on' : ''}`} disabled={i === refLap} onClick={() => selectLaps(refLap, i === cmpLap ? null : i)} aria-pressed={i === cmpLap}>Compare</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {ideal !== null && (
              <tr className="ideal">
                <td className="txt">Theoretical best</td>
                <td>{fmtLap(ideal)}</td>
                <td>{best !== null ? fmtDelta(ideal - best) : ''}</td>
                {bestSec.map((v, j) => <td key={j}>{v?.toFixed(3)}</td>)}
                <td /><td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="note">
        Underlined sector times are the best of the session; the theoretical best adds them together. Laps with pit visits, resets or replay jumps are listed but can't be compared.
        {s.sectors.length > 1 ? ` Sectors use the sim's ${nSec} timing splits.` : ''}
      </p>
    </section>
  );
}

export function CornerTable({ s, ref_, cmp }: { s: Session; ref_: DistLap; cmp: DistLap | null }) {
  const corners = cornersFor(s, ref_);
  const rows = corners.map((c) => ({ c, a: cornerStats(s, ref_, c), b: cmp ? cornerStats(s, cmp, c) : null }));
  const total = rows.reduce((acc, r) => acc + (r.a && r.b ? r.b.time - r.a.time : 0), 0);

  return (
    <section className="card card-pad">
      <h2 className="section">Corners</h2>
      {!corners.length ? <p className="muted">No clear braking zones found on this lap.</p> : (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Corner</th><th>Apex</th>
                <th>Brake point</th>{cmp && <><th>Δ brake</th></>}
                <th>Entry km/h</th>{cmp && <th>Δ</th>}
                <th>Min km/h</th>{cmp && <th>Δ</th>}
                <th>Exit km/h</th>{cmp && <th>Δ</th>}
                <th>Time</th>{cmp && <th>Δ time</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, a, b }) => a && (
                <tr key={c.id} className="click" title="Click to zoom to this corner"
                  onClick={() => { setApp({ zoom: [Math.max(0, c.entry * ref_.step - 40), Math.min(s.trackLength, c.exit * ref_.step + 40)] }); seekDist(a.apexDist); }}>
                  <td className="txt">{c.name}</td>
                  <td>{fmtNum(a.apexDist, 0)} m</td>
                  <td>{a.brakeDist !== null ? `${fmtNum(a.brakeDist, 0)} m` : 'lift'}</td>
                  {cmp && <td>{a.brakeDist !== null && b?.brakeDist != null ? deltaCell(b.brakeDist - a.brakeDist, 0, ' m', true) : ''}</td>}
                  <td>{fmtNum(a.entrySpeed, 1)}</td>{cmp && <td>{b ? deltaCell(b.entrySpeed - a.entrySpeed, 1, '', true) : ''}</td>}
                  <td>{fmtNum(a.minSpeed, 1)}</td>{cmp && <td>{b ? deltaCell(b.minSpeed - a.minSpeed, 1, '', true) : ''}</td>}
                  <td>{fmtNum(a.exitSpeed, 1)}</td>{cmp && <td>{b ? deltaCell(b.exitSpeed - a.exitSpeed, 1, '', true) : ''}</td>}
                  <td>{a.time.toFixed(3)}</td>{cmp && <td>{b ? deltaCell(b.time - a.time, 3, '', false) : ''}</td>}
                </tr>
              ))}
              {cmp && (
                <tr className="ideal">
                  <td className="txt" colSpan={11}>Total through corners</td>
                  <td>{deltaCell(total, 3, '', false)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">
        Corners are found automatically from speed dips on the reference lap, so C-numbers may not match official turn names. Δ columns are compare minus reference: a later brake point or higher speed is shown as a gain, and a positive Δ time means the compare lap was slower. Click a row to zoom in.
      </p>
    </section>
  );
}

/** Coloured delta with sign; `higherIsBetter` decides which direction is a gain for the compare lap. */
function deltaCell(v: number, dp: number, unit: string, higherIsBetter: boolean) {
  const eps = Math.pow(10, -dp) / 2;
  const cls = Math.abs(v) < eps ? '' : (v > 0) === higherIsBetter ? 'gain' : 'loss';
  return <span className={cls}>{fmtDelta(v, dp)}{unit}</span>;
}
