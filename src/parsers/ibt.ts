/**
 * iRacing .ibt reader.
 *
 * Layout (little endian):
 *   irsdk_header (112 bytes)
 *     0 ver, 4 status, 8 tickRate, 12 sessionInfoUpdate, 16 sessionInfoLen,
 *     20 sessionInfoOffset, 24 numVars, 28 varHeaderOffset, 32 numBuf, 36 bufLen,
 *     48 varBuf[0] { tickCount, bufOffset, pad, pad }
 *   irsdk_diskSubHeader (at 112)
 *     startDate (int64 time_t), startTime (f64), endTime (f64), lapCount (i32), recordCount (i32)
 *   var headers: numVars x 144 bytes
 *     type i32, offset i32, count i32, countAsTime u8 + pad3, name[32], desc[64], unit[32]
 *   session info YAML at sessionInfoOffset
 *   samples: recordCount x bufLen bytes starting at varBuf[0].bufOffset
 */
export interface RawRecording {
  channels: Record<string, Float32Array>;
  units: Record<string, string>;
  sessionYaml: string;
  rate: number;
  date: string | null;
  game: string;
}

const enum VarType { Char = 0, Bool = 1, Int = 2, Bitfield = 3, Float = 4, Double = 5 }

const EARTH_R = 6378137;

function cstr(bytes: Uint8Array, start: number, len: number): string {
  let end = start;
  while (end < start + len && bytes[end] !== 0) end++;
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function parseIbt(buf: ArrayBuffer, onProgress?: (p: number) => void): RawRecording {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  if (buf.byteLength < 144) throw new Error('File is too small to be an iRacing .ibt');
  const ver = dv.getInt32(0, true);
  if (ver < 1 || ver > 3) throw new Error('Not an iRacing .ibt file (unexpected header)');

  const tickRate = dv.getInt32(8, true) || 60;
  const sessionInfoLen = dv.getInt32(16, true);
  const sessionInfoOffset = dv.getInt32(20, true);
  const numVars = dv.getInt32(24, true);
  const varHeaderOffset = dv.getInt32(28, true);
  const bufLen = dv.getInt32(36, true);
  const bufOffset = dv.getInt32(52, true);

  const startDate = Number(dv.getBigInt64(112, true));
  const headerRecords = dv.getInt32(140, true);
  const fitRecords = Math.floor((buf.byteLength - bufOffset) / bufLen);
  const n = Math.max(0, headerRecords > 0 ? Math.min(headerRecords, fitRecords) : fitRecords);

  const sessionYaml = new TextDecoder('latin1').decode(bytes.subarray(sessionInfoOffset, sessionInfoOffset + sessionInfoLen));

  interface V { name: string; type: VarType; offset: number; unit: string }
  const vars: V[] = [];
  for (let i = 0; i < numVars; i++) {
    const o = varHeaderOffset + i * 144;
    const type = dv.getInt32(o, true) as VarType;
    const offset = dv.getInt32(o + 4, true);
    const count = dv.getInt32(o + 8, true);
    if (count !== 1) continue; // arrays (per-car / high-rate _ST) are not plotted
    vars.push({ name: cstr(bytes, o + 16, 32), type, offset, unit: cstr(bytes, o + 112, 32) });
  }

  const channels: Record<string, Float32Array> = {};
  const units: Record<string, string> = {};
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  let hasGps = false;

  for (const v of vars) {
    units[v.name] = v.unit;
    const out = new Float32Array(n);
    let base = bufOffset + v.offset;
    switch (v.type) {
      case VarType.Float:
        for (let i = 0; i < n; i++, base += bufLen) out[i] = dv.getFloat32(base, true);
        break;
      case VarType.Double:
        if (v.name === 'Lat' || v.name === 'Lon') {
          const dst = v.name === 'Lat' ? lat : lon;
          for (let i = 0; i < n; i++, base += bufLen) dst[i] = dv.getFloat64(base, true);
          hasGps = true;
          continue;
        }
        for (let i = 0; i < n; i++, base += bufLen) out[i] = dv.getFloat64(base, true);
        break;
      case VarType.Int:
      case VarType.Bitfield:
        for (let i = 0; i < n; i++, base += bufLen) out[i] = dv.getInt32(base, true);
        break;
      case VarType.Bool:
      case VarType.Char:
        for (let i = 0; i < n; i++, base += bufLen) out[i] = bytes[base];
        break;
    }
    channels[v.name] = out;
    onProgress?.(vars.indexOf(v) / vars.length);
  }

  if (hasGps) {
    // Convert to local east/north metres around the first fix, in double precision.
    let lat0 = 0, lon0 = 0;
    for (let i = 0; i < n; i++) if (lat[i] !== 0 || lon[i] !== 0) { lat0 = lat[i]; lon0 = lon[i]; break; }
    if (lat0 !== 0 || lon0 !== 0) {
      const k = Math.PI / 180;
      const cos0 = Math.cos(lat0 * k);
      const east = new Float32Array(n);
      const north = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (lat[i] === 0 && lon[i] === 0) { east[i] = NaN; north[i] = NaN; continue; }
        east[i] = (lon[i] - lon0) * k * cos0 * EARTH_R;
        north[i] = (lat[i] - lat0) * k * EARTH_R;
      }
      channels.PosEast = east;
      channels.PosNorth = north;
      units.PosEast = units.PosNorth = 'm';
    }
  }

  return {
    channels,
    units,
    sessionYaml,
    rate: tickRate,
    date: startDate > 0 ? new Date(startDate * 1000).toISOString() : null,
    game: 'iRacing',
  };
}
