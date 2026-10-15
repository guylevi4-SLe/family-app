import { useEffect, useRef, useState, type PointerEvent } from 'react';

const HOLD_MS = 400;

/**
 * Hold and drag to reorder, as on the phone's home screen: holding a card
 * lifts it, moving up or down moves it live, and letting go saves the new
 * order. A quick tap still opens it, and a swipe still scrolls.
 */
export function useDragOrder<T>(items: T[], keyOf: (t: T) => string, commit: (items: T[]) => void) {
  const drag = useRef<{ id: string; ids: string[]; moved: boolean } | null>(null);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const justDragged = useRef(false);
  const rows = useRef(new Map<string, HTMLElement>());
  const [, render] = useState(0);
  const byId = new Map(items.map((t) => [keyOf(t), t]));
  const ids = drag.current?.ids.filter((id) => byId.has(id)) ?? items.map(keyOf);
  const ordered = ids.map((id) => byId.get(id)!);

  // While a card is lifted the page must not scroll under the finger.
  useEffect(() => {
    const stop = (e: TouchEvent) => drag.current && e.preventDefault();
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);

  const cancelHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };

  const finish = () => {
    cancelHold();
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    justDragged.current = true;
    if (d.moved) commit(d.ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!));
    render((n) => n + 1);
  };

  const row = (id: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    className: drag.current?.id === id ? 'dragging' : drag.current ? 'drag-shift' : undefined,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (items.length < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
      justDragged.current = false;
      const el = e.currentTarget;
      const pointer = e.pointerId;
      cancelHold();
      hold.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          hold.current = null;
          el.setPointerCapture?.(pointer);
          drag.current = { id, ids: items.map(keyOf), moved: false };
          navigator.vibrate?.(10);
          render((n) => n + 1);
        }, HOLD_MS),
      };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const h = hold.current;
      // Moving before the hold completes is a scroll, not a drag.
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) cancelHold();
      const d = drag.current;
      if (!d || d.id !== id) return;
      const y = e.clientY;
      const i = d.ids.indexOf(id);
      const above = rows.current.get(d.ids[i - 1])?.getBoundingClientRect();
      const below = rows.current.get(d.ids[i + 1])?.getBoundingClientRect();
      let to = i;
      if (above && y < above.top + above.height / 2) to = i - 1;
      else if (below && y > below.top + below.height / 2) to = i + 1;
      if (to !== i) {
        [d.ids[i], d.ids[to]] = [d.ids[to], d.ids[i]];
        d.moved = true;
        render((n) => n + 1);
      }
      if (y < 90) window.scrollBy(0, -10);
      else if (y > window.innerHeight - 150) window.scrollBy(0, 10);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    // The hold menu of the phone (copy, share…) would get in the way.
    onContextMenu: (e: React.MouseEvent) => {
      if (drag.current || hold.current) e.preventDefault();
    },
    // Letting go after a drag is not a tap on the card.
    onClickCapture: (e: React.MouseEvent) => {
      if (justDragged.current) {
        e.preventDefault();
        e.stopPropagation();
        justDragged.current = false;
      }
    },
  });

  return { ordered, row };
}
