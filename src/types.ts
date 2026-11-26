/** Units and display label for a channel. */
export interface ChannelInfo {
  label: string;
  unit: string;
  /** Group used by the channel picker. */
  group: string;
}

/**
 * A recording after parsing, normalised so every source looks the same.
 * Canonical channels (see CANONICAL in parsers/channels.ts) are always in
 * consistent units; raw channels keep the game's own names and units.
 */
export interface Session {
  id: string;
  fileName: string;
  source: 'ibt' | 'simhub';
  game: string;
  track: string;
  trackConfig: string;
  /** metres */
  trackLength: number;
  car: string;
  driver: string;
  /** ISO date string of the recording start, if known */
  date: string | null;
  /** nominal sample rate, Hz */
  rate: number;
  sampleCount: number;
  /** sector start points as lap fraction (0..1), first is always 0 */
  sectors: number[];
  channels: Record<string, Float32Array>;
  info: Record<string, ChannelInfo>;
  laps: Lap[];
  /** Track outline in metres, indexed along lap distance (same grid for every lap). */
  map: TrackMap | null;
  addedAt: number;
  fileSize: number;
  /** user notes pinned to track positions (only kept inside .unison exports) */
  notes?: Note[];
}

export type NoteKind = 'reference' | 'note';

/** A user note at a point on the track, independent of any lap. */
export interface Note {
  id: string;
  /** lap distance, metres */
  d: number;
  kind: NoteKind;
  text: string;
  /** where on track, e.g. "C4" or "Between C4 & C5" (auto-suggested, editable) */
  where?: string;
}

export interface TrackMap {
  x: Float32Array;
  y: Float32Array;
  /** distance step of x/y arrays, metres */
  step: number;
  /** 'gps' when built from Lat/Lon, 'dead-reckoning' when integrated from heading+speed */
  method: 'gps' | 'dead-reckoning';
}

export interface Lap {
  /** lap number as reported by the sim */
  num: number;
  /** fractional sample index where the lap starts / ends (interpolated line crossings) */
  start: number;
  end: number;
  /** lap time in seconds; null if the lap was not completed */
  time: number | null;
  /** completed from line to line without pits or resets */
  complete: boolean;
  /** human-readable reason the lap is excluded, if any */
  note: string | null;
  sectorTimes: (number | null)[];
  incidents: number;
  /** session time at lap start, s */
  startTime: number;
}
