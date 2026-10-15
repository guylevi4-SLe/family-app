import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

/**
 * Drag to reorder: each row gets a grip; holding it and moving up or down
 * moves the row live, and letting go saves the new order. Arrow keys on the
 * grip move a row one place.
 */
export function useDragOrder<T>(items: T[], keyOf: (t: T) => string, commit: (items: T[]) => void) {
  const drag = useRef<{ id: string; ids: string[]; moved: boolean } | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const [, render] = useState(0);
  const byId = new Map(items.map((t) => [keyOf(t), t]));
  const ids = drag.current?.ids.filter((id) => byId.has(id)) ?? items.map(keyOf);
  const ordered = ids.map((id) => byId.get(id)!);

  const finish = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) commit(d.ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!));
    render((n) => n + 1);
  };

  const row = (id: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    className: drag.current?.id === id ? 'dragging' : undefined,
  });

  const grip = (id: string, title: string) => (
    <button
      type="button"
      className="drag-grip"
      aria-label={`גרירה לשינוי הסדר: ${title}`}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id, ids: items.map(keyOf), moved: false };
        navigator.vibrate?.(8);
        render((n) => n + 1);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
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
        // Near the screen's edge the page scrolls, for long lists.
        if (y < 90) window.scrollBy(0, -10);
        else if (y > window.innerHeight - 150) window.scrollBy(0, 10);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={(e: KeyboardEvent) => {
        const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const all = items.map(keyOf);
        const i = all.indexOf(id);
        if (!step || !all[i + step]) return;
        e.preventDefault();
        [all[i], all[i + step]] = [all[i + step], all[i]];
        commit(all.map((k) => byId.get(k)!));
      }}
    >
      <GripVertical size={20} aria-hidden="true" />
    </button>
  );

  return { ordered, row, grip };
}
