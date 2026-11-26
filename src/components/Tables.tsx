import { Fragment, useMemo } from 'react';
import type { Session } from '../types';
import { cornerStats, cornersFor } from '../analysis/corners';
import { guessCorner } from '../analysis/notes';
import type { DistLap } from '../analysis/lap';
import { useApp } from '../state/store';
import { seekDist, selectLaps, setZoom } from '../state/actions';
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
                      <button className={`c ${i === cmpLap ? 'on' : ''}`} disabled={i === refLap} onClick={() => selectLaps(refLap, i === cmpLap ? null : i)} aria-pressed={i === cmpLap}>Compare</button>
                      <button className={`r ${i === refLap ? 'on' : ''}`} onClick={() => selectLaps(i, cmpLap === i ? null : cmpLap)} aria-pressed={i === refLap}>Ref</button>
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
    </section>
  );
}

export function CornerTable({ s, ref_, cmp, print = false }: { s: Session; ref_: DistLap; cmp: DistLap | null; print?: boolean }) {
  const corners = cornersFor(s, ref_);
  const rows = corners.map((c) => ({ c, a: cornerStats(s, ref_, c), b: cmp ? cornerStats(s, cmp, c) : null }));
  const total = rows.reduce((acc, r) => acc + (r.a && r.b ? r.b.time - r.a.time : 0), 0);
  const notes = useApp((a) => a.notes);
  // a note belongs to a corner row when its corner description is that corner (e.g. "C4")
  const cornerOf = (n: (typeof notes)[number]) => {
    const w = (n.where?.trim() || guessCorner(s, ref_, n.d).text).toLowerCase();
    return corners.find((c) => c.name.toLowerCase() === w) ?? null;
  };
  const notesIn = (c: (typeof corners)[number]) => notes.map((n, i) => ({ n, i })).filter(({ n }) => cornerOf(n) === c);
  // every other note sits in a gap row between the corners either side of it (by apex distance);
  // gap g is the stretch after corner g-1 and before corner g (g = 0: start, g = corners.length: finish)
  const apexM = corners.map((c) => c.apex * ref_.step);
  const gapNotes = (g: number) =>
    notes.map((n, i) => ({ n, i })).filter(({ n }) => {
      if (cornerOf(n)) return false;
      const after = g === 0 ? -Infinity : apexM[g - 1];
      const before = g === corners.length ? Infinity : apexM[g];
      return n.d >= after && n.d < before;
    });
  const dataCols = cmp ? 11 : 6; // columns between "Corner" and "Notes"
  const gapRow = (g: number) => {
    const items = gapNotes(g);
    if (!items.length) return null;
    const from = g === 0 ? 'Start' : corners[g - 1].name;
    const to = g === corners.length ? 'Finish' : corners[g].name;
    const z0 = g === 0 ? 0 : apexM[g - 1], z1 = g === corners.length ? s.trackLength : apexM[g];
    return (
      <tr key={`gap-${g}`} className="click gap-row" title="Click to zoom to this stretch"
        onClick={() => { setZoom([z0, z1]); seekDist(items[0].n.d); }}>
        <td className="txt">{from} – {to}</td>
        <td colSpan={dataCols} className="txt faint gap-span">{items.length === 1 ? `${Math.round(items[0].n.d).toLocaleString()} m` : `${items.length} notes`}</td>
        <td className="txt notes-col">
          {items.map(({ n, i }) => (
            <div key={n.id} className="corner-note"><span className="note-num sm">n{i + 1}</span>{n.text}</div>
          ))}
        </td>
      </tr>
    );
  };

  return (
    <section className="card card-pad">
      <h2 className="section">{print ? 'Corners & notes' : 'Corners'}</h2>
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
                {notes.length > 0 && <th className="notes-col">Notes</th>}
              </tr>
            </thead>
            <tbody>
              {gapRow(0)}
              {rows.map(({ c, a, b }, ci) => a && (<Fragment key={c.id}>
                <tr className="click" title="Click to zoom to this corner"
                  onClick={() => { setZoom([Math.max(0, c.entry * ref_.step - 40), Math.min(s.trackLength, c.exit * ref_.step + 40)]); seekDist(a.apexDist); }}>
                  <td className="txt">{c.name}</td>
                  <td>{fmtNum(a.apexDist, 0)} m</td>
                  <td>{a.brakeDist !== null ? `${fmtNum(a.brakeDist, 0)} m` : 'lift'}</td>
                  {cmp && <td>{a.brakeDist !== null && b?.brakeDist != null ? deltaCell(b.brakeDist - a.brakeDist, 0, ' m', true) : ''}</td>}
                  <td>{fmtNum(a.entrySpeed, 1)}</td>{cmp && <td>{b ? deltaCell(b.entrySpeed - a.entrySpeed, 1, '', true) : ''}</td>}
                  <td>{fmtNum(a.minSpeed, 1)}</td>{cmp && <td>{b ? deltaCell(b.minSpeed - a.minSpeed, 1, '', true) : ''}</td>}
                  <td>{fmtNum(a.exitSpeed, 1)}</td>{cmp && <td>{b ? deltaCell(b.exitSpeed - a.exitSpeed, 1, '', true) : ''}</td>}
                  <td>{a.time.toFixed(3)}</td>{cmp && <td>{b ? deltaCell(b.time - a.time, 3, '', false) : ''}</td>}
                  {notes.length > 0 && (
                    <td className="txt notes-col">
                      {notesIn(c).map(({ n, i }) => (
                        <div key={n.id} className="corner-note"><span className="note-num sm">n{i + 1}</span>{n.text}</div>
                      ))}
                    </td>
                  )}
                </tr>
                {gapRow(ci + 1)}
              </Fragment>))}
              {cmp && (
                <tr className="ideal">
                  <td className="txt" colSpan={11}>Total through corners</td>
                  <td>{deltaCell(total, 3, '', false)}</td>
                  {notes.length > 0 && <td />}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!print && <p className="note">
        Corners are found automatically from speed dips on the reference lap, so C-numbers may not match official turn names. Δ columns are compare minus reference: a later brake point or higher speed is shown as a gain, and a positive Δ time means the compare lap was slower. Click a row to zoom in.
      </p>}
      {print && <p className="note">Corners are detected from speed dips on the reference lap. Δ = compare − reference; green = compare lap better, red = worse. Shaded rows are notes between corners.</p>}
    </section>
  );
}

/** Coloured delta with sign; `higherIsBetter` decides which direction is a gain for the compare lap. */
function deltaCell(v: number, dp: number, unit: string, higherIsBetter: boolean) {
  const eps = Math.pow(10, -dp) / 2;
  const cls = Math.abs(v) < eps ? '' : (v > 0) === higherIsBetter ? 'gain' : 'loss';
  return <span className={cls}>{fmtDelta(v, dp)}{unit}</span>;
}
