import { useEffect, useRef, useState } from 'react';
import type { Session } from '../types';
import { CANONICAL } from '../parsers/channels';
import { DEFAULT_PANELS } from '../state/store';
import { setPanels } from '../state/actions';

/** Popover to choose which channels are plotted, grouped by subsystem. */
export function ChannelPicker({ s, panels, hasCmp }: { s: Session; panels: string[]; hasCmp: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const skip = new Set(['time', 'lap', 'lapPct', 'lastLapTime', 'posE', 'posN', 'onPit', 'incidents', 'yaw']);
  const items: { key: string; label: string; group: string }[] = [];
  if (hasCmp) items.push({ key: 'delta', label: 'Delta (time gained/lost)', group: 'Timing' });
  for (const c of CANONICAL) if (s.channels[c.key] && !skip.has(c.key)) items.push({ key: c.key, label: `${c.label}${c.unit ? ` (${c.unit})` : ''}`, group: c.group });
  for (const [k, info] of Object.entries(s.info)) if (info.group === 'Other') items.push({ key: k, label: `${k}${info.unit ? ` (${info.unit})` : ''}`, group: 'All other channels' });

  const ql = q.trim().toLowerCase();
  const shown = ql ? items.filter((i) => i.label.toLowerCase().includes(ql)) : items;
  const groups = [...new Set(shown.map((i) => i.group))];

  const toggle = (k: string) => {
    if (panels.includes(k)) setPanels(panels.filter((p) => p !== k));
    else {
      // keep canonical ordering for known channels; append raw ones
      const order = items.map((i) => i.key);
      setPanels([...panels, k].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
  };

  return (
    <div className="pop-anchor" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        Channels ({panels.filter((p) => items.some((i) => i.key === p)).length})
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Choose channels">
          <input type="search" placeholder="Search channels…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {groups.map((g) => (
            <div key={g}>
              <h4>{g}</h4>
              {shown.filter((i) => i.group === g).map((i) => (
                <label key={i.key}>
                  <input type="checkbox" checked={panels.includes(i.key)} onChange={() => toggle(i.key)} />
                  {i.label}
                </label>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn" onClick={() => setPanels(DEFAULT_PANELS)}>Reset to default</button>
          </div>
        </div>
      )}
    </div>
  );
}
