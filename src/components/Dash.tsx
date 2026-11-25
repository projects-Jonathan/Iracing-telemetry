import { useEffect, useMemo, useRef } from 'react';
import type { Lap, Session } from '../types';
import { at } from '../analysis/session';
import { sampleAtTime } from '../analysis/lap';
import { cursor } from '../state/store';
import { fmtLap, fmtNum, prepCanvas, useColors } from './util';

interface Props {
  s: Session;
  refLap: Lap;
  cmpLap: Lap | null;
}

const G_SIZE = 150;
const TRAIL_S = 1.2;

/** Live readouts at the cursor: G-force circle, pedals, steering, speed/gear/RPM. */
export function Dash({ s, refLap, cmpLap }: Props) {
  const gRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<SVGGElement>(null);
  const out = useRef<Record<string, HTMLElement | null>>({});
  const colors = useColors();
  const ch = s.channels;
  const hasG = !!(ch.gLat && ch.gLong);

  // Scale the G circle to this lap's envelope (rounded up to 0.5 g).
  const gMax = useMemo(() => {
    if (!hasG) return 2;
    // 99th percentile, so a kerb strike doesn't shrink everything else
    const g: number[] = [];
    for (let i = Math.ceil(refLap.start); i < refLap.end; i++) g.push(Math.hypot(ch.gLat[i], ch.gLong[i]));
    g.sort((a, b) => a - b);
    const m = g[Math.floor(g.length * 0.99)] ?? 1;
    return Math.max(1, Math.ceil(m * 2) / 2);
  }, [s, refLap, hasG, ch]);

  useEffect(() => {
    const set = (k: string, v: string) => { const el = out.current[k]; if (el && el.textContent !== v) el.textContent = v; };
    const bar = (k: string, pct: number) => { const el = out.current[k]; if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`; };

    const draw = () => {
      const c = cursor.get();
      const ri = sampleAtTime(s, refLap, c.t);
      const ci = cmpLap ? sampleAtTime(s, cmpLap, c.t) : null;
      const v = (k: string, i: number | null) => (i === null || !ch[k] ? NaN : k === 'gear' ? ch[k][Math.round(i)] : at(ch[k], i));
      const gear = (i: number | null) => { const g = v('gear', i); return !isFinite(g) ? '—' : g < 0 ? 'R' : g === 0 ? 'N' : String(g); };

      set('t', fmtLap(c.t));
      const refDone = c.t >= (refLap.time ?? Infinity);
      const cmpDone = cmpLap ? c.t >= (cmpLap.time ?? Infinity) : false;
      set('spdR', fmtNum(v('speed', ri), 0)); set('spdC', fmtNum(v('speed', ci), 0));
      set('gearR', gear(ri)); set('gearC', gear(ci));
      set('rpmR', fmtNum(v('rpm', ri), 0)); set('rpmC', fmtNum(v('rpm', ci), 0));
      bar('thrR', v('throttle', ri)); bar('brkR', v('brake', ri));
      bar('thrC', v('throttle', ci)); bar('brkC', v('brake', ci));
      // gap: positive = compare car behind on the road at this moment
      if (cmpLap && c.cmpD !== null && !refDone && !cmpDone) {
        const gap = Math.round(c.d - c.cmpD);
        set('gap', gap === 0 ? 'level' : `${Math.abs(gap)} m ${gap > 0 ? 'behind' : 'ahead'}`);
      } else set('gap', '—');
      const steer = v('steer', ri);
      if (wheelRef.current) wheelRef.current.setAttribute('transform', `rotate(${isFinite(steer) ? -steer : 0} 27 27)`);
      set('steer', isFinite(steer) ? `${fmtNum(Math.abs(steer), 0)}° ${steer > 1 ? 'L' : steer < -1 ? 'R' : ''}` : '—');

      if (!hasG) return;
      const ctx = prepCanvas(gRef.current, G_SIZE, G_SIZE);
      if (!ctx) return;
      const cx = G_SIZE / 2, cy = G_SIZE / 2, R = G_SIZE / 2 - 14;
      const k = R / gMax;
      // Felt force, like an in-car G meter: left turn pushes the dot right, braking pushes it up.
      // (iRacing LatAccel is positive in a left turn.)
      const px = (i: number) => cx + at(ch.gLat, i) * k;
      const py = (i: number) => cy + at(ch.gLong, i) * k;
      ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
      for (let g = 0.5; g <= gMax + 1e-6; g += 0.5) {
        ctx.beginPath(); ctx.arc(cx, cy, g * k, 0, Math.PI * 2);
        ctx.strokeStyle = Number.isInteger(g) ? colors.rule : colors.grid; ctx.stroke();
      }
      ctx.strokeStyle = colors.grid;
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      ctx.fillStyle = colors.ink3;
      ctx.font = `500 9px ${getComputedStyle(document.body).getPropertyValue('--font')}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BRAKE', cx, 6); ctx.fillText('ACCEL', cx, G_SIZE - 6);
      ctx.textAlign = 'left'; ctx.fillText('R TURN', 1, cy - 8);
      ctx.textAlign = 'right'; ctx.fillText('L TURN', G_SIZE - 1, cy - 8);
      ctx.textAlign = 'center';
      ctx.fillText(`${gMax}g`, cx + gMax * k * 0.72 + 8, cy - gMax * k * 0.72);
      // whole-lap envelope, faint
      ctx.fillStyle = colors.ink3;
      ctx.globalAlpha = 0.12;
      const stride = Math.max(1, Math.round(s.rate / 10));
      for (let i = Math.ceil(refLap.start); i < refLap.end; i += stride) ctx.fillRect(px(i) - 1, py(i) - 1, 2, 2);
      ctx.globalAlpha = 1;
      // trail
      const trail = (lap: Lap, idx: number, col: string) => {
        const back = Math.max(lap.start, idx - TRAIL_S * s.rate);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        const steps = Math.max(2, Math.round(idx - back));
        for (let j = 1; j <= steps; j++) {
          const a = back + ((idx - back) * (j - 1)) / steps, b = back + ((idx - back) * j) / steps;
          ctx.globalAlpha = (j / steps) * 0.8;
          ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(px(idx), py(idx), 5, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = colors.surface; ctx.stroke();
      };
      if (cmpLap && ci !== null) trail(cmpLap, ci, colors.cmp);
      trail(refLap, ri, colors.ref);
      set('gLat', fmtNum(Math.abs(at(ch.gLat, ri)), 2));
      set('gLong', fmtNum(at(ch.gLong, ri), 2));
    };
    draw();
    return cursor.subscribe(draw);
  }, [s, refLap, cmpLap, colors, gMax, hasG, ch]);

  const r = (k: string) => (el: HTMLElement | null) => { out.current[k] = el; };

  return (
    <div className="card dash">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="label">Live</span>
        <span className="faint" style={{ fontSize: 12 }}>at the cursor / playhead</span>
        <span className="num" style={{ marginLeft: 'auto', fontSize: 15 }} ref={r('t')} />
      </div>
      <div className="dash-grid">
        {hasG ? (
          <div>
            <canvas ref={gRef} width={G_SIZE} height={G_SIZE} style={{ width: G_SIZE, height: G_SIZE }} role="img" aria-label="G-force circle" />
            <div className="faint" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span>lat <span className="num" ref={r('gLat')} />g</span>
              <span>long <span className="num" ref={r('gLong')} />g</span>
            </div>
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 12 }}>No G-force channels in this file.</div>
        )}
        <div className="readouts">
          <div className="ro-row head"><span /><span>km/h</span><span>gear</span><span>rpm</span></div>
          {cmpLap && <div className="ro-row"><span className="sw cmp" /><span className="num" ref={r('spdC')} /><span className="num" ref={r('gearC')} /><span className="num" ref={r('rpmC')} /></div>}
          <div className="ro-row"><span className="sw ref" /><span className="num" ref={r('spdR')} /><span className="num" ref={r('gearR')} /><span className="num" ref={r('rpmR')} /></div>
          <div className="pedals" style={{ marginTop: 6 }}>
            <span>Throttle</span>
            <div style={{ display: 'grid', gap: 3 }}>
              {cmpLap && <div className="pbar cmp"><div ref={r('thrC')} /></div>}
              <div className="pbar ref"><div ref={r('thrR')} /></div>
            </div>
            <span>Brake</span>
            <div style={{ display: 'grid', gap: 3 }}>
              {cmpLap && <div className="pbar cmp"><div ref={r('brkC')} /></div>}
              <div className="pbar ref"><div ref={r('brkR')} /></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <svg className="wheel" viewBox="0 0 54 54" aria-hidden="true">
              <g ref={wheelRef}>
                <circle cx="27" cy="27" r="23" fill="none" stroke="var(--ink-2)" strokeWidth="4" />
                <path d="M4 27h14M36 27h14M27 31v19" stroke="var(--ink-2)" strokeWidth="4" strokeLinecap="round" />
                <circle cx="27" cy="27" r="6" fill="var(--ink-2)" />
                <rect x="25" y="2" width="4" height="7" rx="1" fill="var(--ref)" />
              </g>
            </svg>
            <div style={{ display: 'grid', fontSize: 12 }}>
              <span className="faint">Steering</span>
              <span className="num" ref={r('steer')} />
              {cmpLap && <><span className="faint" style={{ marginTop: 4 }}>Compare car is</span><span className="num" ref={r('gap')} /></>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
