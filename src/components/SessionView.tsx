import { useEffect, useState } from 'react';
import type { Session } from '../types';
import { useMeasuredHeight, useMedia } from './util';
import { app, useApp } from '../state/store';
import { currentLaps, editNote, setNoteMode, setZoom } from '../state/actions';
import { Toolbar } from './Toolbar';
import { Chart } from './Chart';
import { TrackMap } from './TrackMap';
import { Dash } from './Dash';
import { ConsistencyCard } from './ConsistencyCard';
import { ChannelPicker } from './ChannelPicker';
import { CornerTable, LapTable } from './Tables';
import { NoteEditor, NotesCard, NotesMenu } from './Notes';
import { PanBar, ZoomButtons, wheelPan } from './ZoomControls';

const PANBAR_H = 22; // pan scroll bar under the graph in note mode (height + gap)

export function SessionView({ s }: { s: Session }) {
  const refLap = useApp((a) => a.refLap);
  const cmpLap = useApp((a) => a.cmpLap);
  const panels = useApp((a) => a.panels);
  const zoom = useApp((a) => a.zoom);
  const mapChannel = useApp((a) => a.mapChannel);
  const notes = useApp((a) => a.notes);
  const noteMode = useApp((a) => a.noteMode);
  const notesHidden = useApp((a) => a.notesHidden);
  const winH = useWindowHeight();
  // note mode drops the Delta and Steering rows to leave room for the traces you place notes on
  const notePanels = panels.filter((p) => p !== 'delta' && p !== 'steer');

  // Note mode: shift+wheel / sideways swipe over the graph pans a zoomed view
  useEffect(() => {
    if (!noteMode) return;
    const el = document.querySelector<HTMLElement>('.chart-card .chart-wrap');
    if (!el) return;
    const on = (e: WheelEvent) => wheelPan(e, s.trackLength, app.get().zoom);
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [noteMode, s.trackLength]);

  // Esc leaves note mode (unless the note window is open; it handles Esc itself)
  useEffect(() => {
    if (!noteMode) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !app.get().noteEdit) setNoteMode(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [noteMode]);
  // refLap/cmpLap are read so this re-renders on selection change
  void refLap; void cmpLap;
  const { ref, cmp } = currentLaps();

  // Size the chart so the chart card ends level with the three side cards.
  // callback refs: measurements re-attach if React ever recreates these elements
  const [sideRef, sideH] = useMeasuredHeight<HTMLElement>();
  const [headRef, headH] = useMeasuredHeight<HTMLDivElement>();
  const stacked = useMedia('(max-width: 1100px)');
  const CARD_CHROME = 14; // chart-card padding (8 + 4) + borders (2)
  // Note mode: the graph fills the window under the top bar (53px) with the page padding (16 + 20).
  const fitHeight = noteMode
    ? Math.max(360, Math.round(winH - 53 - 16 - 20 - headH - CARD_CHROME - PANBAR_H))
    : !stacked && sideH > 0 ? Math.ceil(sideH - headH - CARD_CHROME) : null;

  const date = s.date ? new Date(s.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <>
      {!noteMode && <header className="session-head">
        <h1>{s.track}{s.trackConfig ? ` · ${s.trackConfig}` : ''}</h1>
        <div className="chips">
          <span className="chip">{s.car}</span>
          {date && <span className="chip">{date}</span>}
          {s.driver && <span className="chip">{s.driver}</span>}
          <span className="chip">{s.game} · {s.rate} Hz</span>
          <span className="chip">{(s.trackLength / 1000).toFixed(3)} km</span>
          <span className="chip">{s.laps.filter((l) => l.complete).length} timed laps</span>
        </div>
      </header>}

      {!ref ? (
        <div className="card card-pad">No complete laps in this session.</div>
      ) : (
        <>
          {!noteMode && <Toolbar s={s} />}
          <div className="workspace">
            <section className="card chart-card" aria-label="Telemetry chart">
              <div className="chart-head" ref={headRef}>
                {noteMode
                  ? <span className="hint note-hint"><strong>Adding notes.</strong> Click anywhere on the graph to add a note at that spot · click a note's dotted line to edit it.</span>
                  : <span className="hint">Hover to read values · drag to zoom · double-click to reset · click to move the playhead.</span>}
                <ChannelPicker s={s} panels={panels} hasCmp={!!cmp} />
                <div className="head-right">
                  {noteMode
                    ? <><ZoomButtons length={s.trackLength} zoom={zoom} /><button className="btn primary" onClick={() => setNoteMode(false)}>Done</button></>
                    : zoom
                      ? <button className="btn" onClick={() => setZoom(null)}>Show full graph</button>
                      : <NotesMenu />}
                </div>
              </div>
              <Chart
                s={s} ref_={ref} cmp={cmp} panels={noteMode ? notePanels : panels} zoom={zoom} fitHeight={fitHeight}
                notes={notesHidden && !noteMode ? [] : notes}
                onPick={noteMode ? (d, hit) => (hit ? editNote(hit) : editNote({ d })) : undefined}
                hideSectors={noteMode}
              />
              {noteMode && <PanBar length={s.trackLength} zoom={zoom} />}
            </section>
            <aside className="side" ref={sideRef}>
              <TrackMap s={s} ref_={ref} cmp={cmp} channel={mapChannel === 'delta' && !cmp ? 'speed' : mapChannel} zoom={zoom} notes={notes} />
              {/* note mode keeps just the map beside the graph */}
              {!noteMode && <Dash s={s} refLap={ref.lap} cmpLap={cmp?.lap ?? null} />}
              {!noteMode && <ConsistencyCard s={s} ref_={ref} cmp={cmp} zoom={zoom} />}
            </aside>
          </div>
          {!noteMode && (
            <div className="tables">
              <CornerTable s={s} ref_={ref} cmp={cmp} />
              <NotesCard s={s} ref_={ref} />
              <LapTable s={s} />
            </div>
          )}
          <NoteEditor s={s} ref_={ref} />
        </>
      )}
    </>
  );
}

function useWindowHeight(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}
