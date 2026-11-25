/**
 * Minimal reader for iRacing's session-info YAML (also embedded in SimHub
 * iRacing recordings). Only pulls out the handful of fields we need, so no
 * full YAML parser is required.
 */
export interface SessionInfo {
  track: string;
  trackConfig: string;
  trackLength: number; // metres
  car: string;
  driver: string;
  sectors: number[];
}

function field(yaml: string, key: string): string {
  const m = yaml.match(new RegExp(`^\\s*${key}:[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^"(.*)"$/, '$1') : '';
}

export function parseSessionInfo(yaml: string): SessionInfo {
  const track = field(yaml, 'TrackDisplayName') || field(yaml, 'TrackName');
  const trackConfig = field(yaml, 'TrackConfigName');
  const lenStr = field(yaml, 'TrackLength');
  let trackLength = parseFloat(lenStr);
  if (/km/.test(lenStr)) trackLength *= 1000;
  else if (/mi/.test(lenStr)) trackLength *= 1609.344;

  const sectors: number[] = [];
  const split = yaml.indexOf('SplitTimeInfo:');
  if (split >= 0) {
    const block = yaml.slice(split, yaml.indexOf('\n\n', split) > 0 ? yaml.indexOf('\n\n', split) : split + 4000);
    for (const m of block.matchAll(/SectorStartPct:\s*([\d.]+)/g)) sectors.push(parseFloat(m[1]));
  }

  // Player car: DriverInfo.DriverCarIdx, then find that CarIdx in Drivers list.
  let car = '';
  let driver = '';
  const idx = field(yaml, 'DriverCarIdx');
  const drivers = yaml.search(/^ Drivers:[ \t]*\r?$/m);
  if (drivers >= 0 && idx !== '') {
    const re = new RegExp(`- CarIdx: ${idx}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\s*- CarIdx:|\\r?\\n\\S)`);
    const m = yaml.slice(drivers).match(re);
    if (m) {
      car = field(m[1], 'CarScreenName');
      driver = field(m[1], 'UserName');
    }
  }
  return { track, trackConfig, trackLength: isFinite(trackLength) ? trackLength : 0, car, driver, sectors: sectors.length ? sectors : [0] };
}
