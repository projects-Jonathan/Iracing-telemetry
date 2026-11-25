import type { ChannelInfo } from '../types';

/**
 * Canonical channels every view relies on. Each maps from one or more raw
 * channel names (first match wins) with a linear conversion into the
 * canonical unit. iRacing names come first; the rest are best-effort aliases
 * for other games recorded through SimHub.
 */
interface Source {
  name: string;
  scale?: number;
  offset?: number;
}

export interface CanonicalDef extends ChannelInfo {
  key: string;
  sources: Source[];
  /** decimals to show in readouts */
  dp: number;
}

const G = 1 / 9.80665;
const RAD = 180 / Math.PI;

export const CANONICAL: CanonicalDef[] = [
  { key: 'time', label: 'Session time', unit: 's', group: 'Timing', dp: 2, sources: [{ name: 'SessionTime' }, { name: 'Graphics.iCurrentTime', scale: 0.001 }] },
  { key: 'lap', label: 'Lap', unit: '', group: 'Timing', dp: 0, sources: [{ name: 'Lap' }, { name: 'Graphics.CompletedLaps', offset: 1 }] },
  { key: 'lapPct', label: 'Lap distance', unit: '%', group: 'Timing', dp: 3, sources: [{ name: 'LapDistPct' }, { name: 'Graphics.NormalizedCarPosition' }] },
  { key: 'lastLapTime', label: 'Last lap time', unit: 's', group: 'Timing', dp: 3, sources: [{ name: 'LapLastLapTime' }, { name: 'Graphics.iLastTime', scale: 0.001 }] },
  { key: 'speed', label: 'Speed', unit: 'km/h', group: 'Driver', dp: 1, sources: [{ name: 'Speed', scale: 3.6 }, { name: 'Physics.SpeedKmh' }, { name: 'SpeedKmh' }] },
  { key: 'throttle', label: 'Throttle', unit: '%', group: 'Driver', dp: 0, sources: [{ name: 'Throttle', scale: 100 }, { name: 'Physics.Gas', scale: 100 }] },
  { key: 'brake', label: 'Brake', unit: '%', group: 'Driver', dp: 0, sources: [{ name: 'Brake', scale: 100 }, { name: 'Physics.Brake', scale: 100 }] },
  { key: 'clutch', label: 'Clutch', unit: '%', group: 'Driver', dp: 0, sources: [{ name: 'Clutch', scale: -100, offset: 100 }, { name: 'Physics.Clutch', scale: -100, offset: 100 }] },
  { key: 'gear', label: 'Gear', unit: '', group: 'Driver', dp: 0, sources: [{ name: 'Gear' }, { name: 'Physics.Gear', offset: -1 }] },
  { key: 'rpm', label: 'RPM', unit: 'rpm', group: 'Engine', dp: 0, sources: [{ name: 'RPM' }, { name: 'Physics.Rpms' }] },
  { key: 'steer', label: 'Steering', unit: '°', group: 'Driver', dp: 0, sources: [{ name: 'SteeringWheelAngle', scale: RAD }, { name: 'Physics.SteerAngle', scale: 450 }] },
  { key: 'gLat', label: 'Lateral G', unit: 'g', group: 'Chassis', dp: 2, sources: [{ name: 'LatAccel', scale: G }, { name: 'Physics.AccG.0' }] },
  { key: 'gLong', label: 'Longitudinal G', unit: 'g', group: 'Chassis', dp: 2, sources: [{ name: 'LongAccel', scale: G }, { name: 'Physics.AccG.2' }] },
  { key: 'gVert', label: 'Vertical G', unit: 'g', group: 'Chassis', dp: 2, sources: [{ name: 'VertAccel', scale: G }, { name: 'Physics.AccG.1' }] },
  { key: 'yaw', label: 'Heading', unit: 'rad', group: 'Chassis', dp: 2, sources: [{ name: 'Yaw' }, { name: 'Physics.Heading' }] },
  { key: 'yawRate', label: 'Yaw rate', unit: '°/s', group: 'Chassis', dp: 1, sources: [{ name: 'YawRate', scale: RAD }] },
  { key: 'posE', label: 'Position east', unit: 'm', group: 'Position', dp: 1, sources: [{ name: 'PosEast' }] },
  { key: 'posN', label: 'Position north', unit: 'm', group: 'Position', dp: 1, sources: [{ name: 'PosNorth' }] },
  { key: 'onPit', label: 'On pit road', unit: '', group: 'Timing', dp: 0, sources: [{ name: 'OnPitRoad' }, { name: 'Graphics.IsInPitLane' }] },
  { key: 'incidents', label: 'Incidents', unit: 'x', group: 'Timing', dp: 0, sources: [{ name: 'PlayerCarMyIncidentCount' }] },
  { key: 'fuel', label: 'Fuel', unit: 'L', group: 'Engine', dp: 2, sources: [{ name: 'FuelLevel' }, { name: 'Physics.Fuel' }] },
  { key: 'abs', label: 'ABS active', unit: '', group: 'Driver', dp: 0, sources: [{ name: 'BrakeABSactive' }] },
  { key: 'tyreLF', label: 'Tyre temp LF', unit: '°C', group: 'Tyres', dp: 0, sources: [{ name: 'LFtempCM' }, { name: 'Physics.TyreCoreTemperature.0' }] },
  { key: 'tyreRF', label: 'Tyre temp RF', unit: '°C', group: 'Tyres', dp: 0, sources: [{ name: 'RFtempCM' }, { name: 'Physics.TyreCoreTemperature.1' }] },
  { key: 'tyreLR', label: 'Tyre temp LR', unit: '°C', group: 'Tyres', dp: 0, sources: [{ name: 'LRtempCM' }, { name: 'Physics.TyreCoreTemperature.2' }] },
  { key: 'tyreRR', label: 'Tyre temp RR', unit: '°C', group: 'Tyres', dp: 0, sources: [{ name: 'RRtempCM' }, { name: 'Physics.TyreCoreTemperature.3' }] },
  { key: 'rideLF', label: 'Ride height LF', unit: 'mm', group: 'Chassis', dp: 1, sources: [{ name: 'LFrideHeight', scale: 1000 }] },
  { key: 'rideRF', label: 'Ride height RF', unit: 'mm', group: 'Chassis', dp: 1, sources: [{ name: 'RFrideHeight', scale: 1000 }] },
  { key: 'rideLR', label: 'Ride height LR', unit: 'mm', group: 'Chassis', dp: 1, sources: [{ name: 'LRrideHeight', scale: 1000 }] },
  { key: 'rideRR', label: 'Ride height RR', unit: 'mm', group: 'Chassis', dp: 1, sources: [{ name: 'RRrideHeight', scale: 1000 }] },
];

export const CANON_BY_KEY: Record<string, CanonicalDef> = Object.fromEntries(CANONICAL.map((c) => [c.key, c]));

/** Raw channels that are never useful to plot. */
const SKIP = /^(CarIdx|Session(Tick|Num|State|UniqueID|Flags|TimeRemain|LapsRemain|LapsRemainEx|TimeTotal|LapsTotal|TimeOfDay)|FrameRate|CpuUsage|GpuUsage|Chan|MemPage|Radio|Cam|ReplayFrame|Replay|TickCount|IsDisk|Vid|Pace|DCDrivers|LoadNum|OkToReload|Display)/;

/**
 * Turn a dictionary of raw channels into canonical + raw channel sets.
 * Raw channels that never change are dropped to save memory.
 */
export function normalise(
  raw: Record<string, Float32Array>,
  rawUnits: Record<string, string>,
): { channels: Record<string, Float32Array>; info: Record<string, ChannelInfo> } {
  const channels: Record<string, Float32Array> = {};
  const info: Record<string, ChannelInfo> = {};
  const used = new Set<string>();

  for (const def of CANONICAL) {
    const src = def.sources.find((s) => raw[s.name]);
    if (!src) continue;
    const a = raw[src.name];
    const scale = src.scale ?? 1;
    const offset = src.offset ?? 0;
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] * scale + offset;
    channels[def.key] = out;
    info[def.key] = { label: def.label, unit: def.unit, group: def.group };
    used.add(src.name);
  }

  for (const [name, a] of Object.entries(raw)) {
    if (used.has(name) || SKIP.test(name) || channels[name]) continue;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!(hi > lo)) continue; // constant or empty
    channels[name] = a;
    info[name] = { label: name, unit: rawUnits[name] ?? '', group: 'Other' };
  }
  return { channels, info };
}
