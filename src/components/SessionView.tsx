import type { Session } from '../types';
import { useApp } from '../state/store';
import { currentLaps } from '../state/actions';
import { Toolbar } from './Toolbar';
import { Chart } from './Chart';
import { TrackMap } from './TrackMap';
import { Dash } from './Dash';
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
              <div className="chart-head">
                <span className="hint">Hover to read values · drag to zoom · double-click to reset · click to move the playhead. The orange dashed line marks where the compare car is at the same moment.</span>
                <ChannelPicker s={s} panels={panels} hasCmp={!!cmp} />
              </div>
              <Chart s={s} ref_={ref} cmp={cmp} panels={panels} zoom={zoom} />
            </section>
            <aside className="side">
              <TrackMap s={s} ref_={ref} cmp={cmp} channel={mapChannel === 'delta' && !cmp ? 'speed' : mapChannel} zoom={zoom} />
              <Dash s={s} refLap={ref.lap} cmpLap={cmp?.lap ?? null} />
            </aside>
          </div>
          <div className="tables">
            <LapTable s={s} />
            <CornerTable s={s} ref_={ref} cmp={cmp} />
          </div>
        </>
      )}
    </>
  );
}
