import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

const ACTION_W = 76;
// The same hold as lifting a row to reorder it: let go without moving and the row's menu opens.
const HOLD_MS = 400;
// Only one row stays swiped open at a time, as in the phone's Notes.
let closeOpenRow: (() => void) | null = null;

/**
 * One row of the library, in the style of the phone's Notes: tap opens it,
 * swiping it left shows its actions (share, delete), and holding it then
 * letting go without moving opens its menu (rename, delete…).
 */
export function LibRow({
  className,
  icon,
  title,
  sub,
  count,
  onOpen,
  actions = [],
  onHold,
  chevron = true,
}: {
  className: string;
  icon: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  count?: ReactNode;
  onOpen: () => void;
  actions?: SwipeAction[];
  /** Holding the row and letting go without moving (e.g. opens its menu). */
  onHold?: () => void;
  chevron?: boolean;
}) {
  const width = actions.length * ACTION_W;
  const [dx, setDx] = useState(0);
  const [sliding, setSliding] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; swiping: boolean } | null>(null);
  const swiped = useRef(false);

  const close = () => setDx(0);
  useEffect(() => () => {
    if (closeOpenRow === close) closeOpenRow = null;
  });
  const held = useRef(false);

  // Watched on the window: a row lifted to reorder captures the pointer, so its own events stop here.
  const watchHold = (e: PointerEvent<HTMLDivElement>) => {
    held.current = false;
    if (!onHold || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { clientX: x, clientY: y } = e;
    const timer = window.setTimeout(() => (held.current = true), HOLD_MS);
    const done = (open: boolean) => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      if (open) onHold();
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > 8) {
        held.current = false;
        done(false);
      }
    };
    const up = () => done(held.current);
    const cancel = () => {
      held.current = false;
      done(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    watchHold(e);
    if (!width || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY, base: dx, swiping: false };
    swiped.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.swiping) {
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my) * 1.5) {
        if (Math.abs(my) > 10) start.current = null;
        return;
      }
      s.swiping = true;
      setSliding(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    }
    setDx(Math.max(-width - 24, Math.min(0, s.base + mx)));
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    if (!s?.swiping) return;
    swiped.current = true;
    setSliding(false);
    const open = dx < -width / 2;
    setDx(open ? -width : 0);
    closeOpenRow = open ? close : closeOpenRow === close ? null : closeOpenRow;
  };

  return (
    <div className={`lib-row-wrap${dx ? ' swiped' : ''}`} data-no-swipe>
      {width > 0 && (
        <div className="swipe-actions" style={{ width }} aria-hidden={dx === 0}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={a.danger ? 'danger' : ''}
              tabIndex={dx === 0 ? -1 : 0}
              onClick={() => {
                close();
                a.onClick();
              }}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className={`lib-row ${className}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: sliding ? 'none' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => onHold && e.preventDefault()}
      >
        <button
          type="button"
          className="row-main"
          onClick={() => {
            if (held.current) {
              held.current = false;
              return;
            }
            if (swiped.current || dx) {
              swiped.current = false;
              close();
              return;
            }
            onOpen();
          }}
        >
          <span className="row-icon" aria-hidden="true">{icon}</span>
          <span className="row-text">
            <strong>{title}</strong>
            {sub && <span className="muted">{sub}</span>}
          </span>
          {count !== undefined && <span className="row-count">{count}</span>}
          {chevron && <ChevronLeft className="row-chevron" size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
