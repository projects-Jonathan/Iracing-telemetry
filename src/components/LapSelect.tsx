import { useEffect, useId, useRef, useState } from 'react';
import type { Lap } from '../types';
import { fmtDelta, fmtLap } from './util';

export interface LapOption {
  /** index into session.laps, or null for "None" */
  value: number | null;
  lap: Lap | null;
}

interface Props {
  label: string;
  kind: 'ref' | 'cmp';
  value: number | null;
  options: LapOption[];
  best: number | null;
  onChange: (v: number | null) => void;
}

/**
 * Lap picker drawn by the app (instead of a native <select>) so the quickest
 * lap can be bold and underlined, matching the Laps & sectors table.
 * Keyboard: Enter/Space/↓ open, ↑/↓/Home/End move, Enter selects, Esc closes.
 */
export function LapSelect({ label, kind, value, options, best, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selIdx = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selIdx];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // keep the highlighted option in view
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openList = () => { setActive(selIdx); setOpen(true); };
  const choose = (i: number) => { onChange(options[i].value); setOpen(false); btn.current?.focus(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); openList(); }
      return;
    }
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); if (e.key === 'Escape') e.preventDefault(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
  };

  const isBest = (l: Lap | null) => !!l && l.time !== null && l.time === best;

  return (
    <div className="ctl lapsel" ref={root}>
      <span className="label" id={`${id}-label`}>{label}</span>
      <div className="row">
        <span className={`sw ${kind}`} />
        <button
          ref={btn}
          type="button"
          className="lapsel-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label ${id}-value`}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKey}
        >
          <span id={`${id}-value`}>
            {current?.lap ? (
              <>Lap {current.lap.num} · <span className={isBest(current.lap) ? 'best-sec' : ''}>{fmtLap(current.lap.time)}</span></>
            ) : 'None'}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {open && (
        <ul
          ref={list}
          className="lapsel-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value ?? 'none'}
              id={`${id}-opt-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === selIdx}
              className={`${i === active ? 'active' : ''} ${i === selIdx ? 'selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.lap ? (
                <>
                  <span>Lap {o.lap.num}</span>
                  <span className={`num ${isBest(o.lap) ? 'best-sec' : ''}`}>{fmtLap(o.lap.time)}</span>
                  <span className="num faint">{isBest(o.lap) ? 'best' : best !== null && o.lap.time !== null ? fmtDelta(o.lap.time - best) : ''}</span>
                  <span className="num faint">{o.lap.incidents ? `${o.lap.incidents}x` : ''}</span>
                </>
              ) : (
                <span className="muted">None</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
