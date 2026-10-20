import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { EllipsisVertical } from 'lucide-react';

export type MenuItem = { label: string; icon: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean };

/** The bottom sheet of actions on its own, opened by its owner (e.g. a long press on a row). */
export function ActionSheet({ title, items, onClose }: { title: string; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet more-sheet" role="dialog" aria-label={`פעולות: ${title}`} onClick={(e) => e.stopPropagation()}>
        <strong className="more-title">{title}</strong>
        <ul className="more-items">
          {items.map((item) => (
            <li key={item.label}>
              <button
                className={`more-item ${item.danger ? 'danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  onClose();
                  item.onClick();
                }}
              >
                <span className="more-icon" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="more-cancel" onClick={onClose}>ביטול</button>
      </div>
    </div>
  );
}

/**
 * A "⋮" button that opens a small menu of actions (rename, lock, delete…) at the
 * top right, under the button, instead of a row of buttons. A floating "+"
 * (any trigger given its own className) opens the actions as a sheet from the
 * bottom instead, near the thumb.
 */
export function MoreMenu({
  title,
  subtitle,
  items,
  label = 'אפשרויות',
  className = 'more-button',
  icon = <EllipsisVertical size={22} strokeWidth={2} aria-hidden="true" />,
}: {
  title: string;
  /** A small line under the title (e.g. which date new things get). */
  subtitle?: string;
  items: (MenuItem | false | null | undefined)[];
  /** The trigger button: "⋮" unless given (e.g. a floating "+"). */
  label?: string;
  className?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const shown = items.filter(Boolean) as MenuItem[];
  const popover = className === 'more-button';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const show = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (popover && r) {
      // Under the button; above it when a row near the bottom would push the menu off screen.
      const height = 48 + shown.length * 50;
      setPlace(r.bottom + 6 + height > window.innerHeight - 12 ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 });
    }
    setOpen(true);
  };

  const list = (
    <ul className="more-items">
      {shown.map((item) => (
        <li key={item.label}>
          <button
            className={`more-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
          >
            <span className="more-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <button ref={trigger} className={className} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
        {icon}
      </button>
      {open &&
        (popover ? (
          <div className="menu-backdrop" onClick={() => setOpen(false)}>
            <div className="menu-pop" style={place} role="dialog" aria-label={`${label}: ${title}`} onClick={(e) => e.stopPropagation()}>
              <strong className="menu-title">{title}</strong>
              {subtitle && <span className="menu-subtitle">{subtitle}</span>}
              {list}
            </div>
          </div>
        ) : (
          <div className="sheet-backdrop" onClick={() => setOpen(false)}>
            <div className="sheet more-sheet" role="dialog" aria-label={`${label}: ${title}`} onClick={(e) => e.stopPropagation()}>
              <strong className="more-title">{title}</strong>
              {subtitle && <span className="more-subtitle">{subtitle}</span>}
              {list}
              <button className="more-cancel" onClick={() => setOpen(false)}>ביטול</button>
            </div>
          </div>
        ))}
    </>
  );
}
