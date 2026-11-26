import { useRef } from 'react';
import type { Session } from '../types';
import { useHeight, useMedia } from './util';
import { useApp } from '../state/store';
import { currentLaps, setZoom } from '../state/actions';
import { Toolbar } from './Toolbar';
import { Chart } from './Chart';
import { TrackMap } from './TrackMap';
import { Dash } from './Dash';
import { ConsistencyCard } from './ConsistencyCard';
import { ChannelPicker } from './ChannelPicker';
import { CornerTable, LapTable } from './Tables';

export function SessionView({ s }: { s: Session }) {
  const refLap = useApp((a) => a.refLap);
  const cmpLap = useApp((a) => a.cmpLap);
  const panels = useApp((a) => a.panels);
  const zoom = useApp((a) => a.zoom);
  const mapChannel = useApp((a) => a.mapChannel);
  // refLap/cmpLap are read so this re-renders on selection change
  void refLap; void cmpLap;
  const { ref, cmp } = currentLaps();

  // Size the chart so the chart card ends level with the three side cards.
  const sideRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const sideH = useHeight(sideRef);
  const headH = useHeight(headRef);
  const stacked = useMedia('(max-width: 1100px)');
  const CARD_CHROME = 14; // chart-card padding (8 + 4) + borders (2)
  const fitHeight = !stacked && sideH > 0 ? Math.round(sideH - headH - CARD_CHROME) : null;

  const date = s.date ? new Date(s.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <>
      <header className="session-head">
        <h1>{s.track}{s.trackConfig ? ` · ${s.trackConfig}` : ''}</h1>
        <div className="chips">
          <span className="chip">{s.car}</span>
          {date && <span className="chip">{date}</span>}
          {s.driver && <span className="chip">{s.driver}</span>}
          <span className="chip">{s.game} · {s.rate} Hz</span>
          <span className="chip">{(s.trackLength / 1000).toFixed(3)} km</span>
          <span className="chip">{s.laps.filter((l) => l.complete).length} timed laps</span>
        </div>
      </header>

      {!ref ? (
        <div className="card card-pad">No complete laps in this session.</div>
      ) : (
        <>
          <Toolbar s={s} />
          <div className="workspace">
            <section className="card chart-card" aria-label="Telemetry chart">
              <div className="chart-head" ref={headRef}>
                <span className="hint">Hover to read values · drag to zoom · double-click to reset · click to move the playhead.</span>
                <ChannelPicker s={s} panels={panels} hasCmp={!!cmp} />
                {zoom && <button className="btn full-graph" onClick={() => setZoom(null)}>Show full graph</button>}
              </div>
              <Chart s={s} ref_={ref} cmp={cmp} panels={panels} zoom={zoom} fitHeight={fitHeight} />
            </section>
            <aside className="side" ref={sideRef}>
              <TrackMap s={s} ref_={ref} cmp={cmp} channel={mapChannel === 'delta' && !cmp ? 'speed' : mapChannel} zoom={zoom} />
              <Dash s={s} refLap={ref.lap} cmpLap={cmp?.lap ?? null} />
              <ConsistencyCard s={s} ref_={ref} cmp={cmp} zoom={zoom} />
            </aside>
          </div>
          <div className="tables">
            <CornerTable s={s} ref_={ref} cmp={cmp} />
            <LapTable s={s} />
          </div>
        </>
      )}
    </>
  );
}
