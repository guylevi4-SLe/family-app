import { useState, type ReactNode } from 'react';
import { EllipsisVertical } from 'lucide-react';

export type MenuItem = { label: string; icon: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean };

/** A "⋮" button that opens a sheet of actions (rename, lock, delete…), instead of a row of buttons. */
export function MoreMenu({ title, items }: { title: string; items: (MenuItem | false | null | undefined)[] }) {
  const [open, setOpen] = useState(false);
  const shown = items.filter(Boolean) as MenuItem[];
  return (
    <>
      <button className="more-button" aria-label="אפשרויות" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <EllipsisVertical size={22} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet more-sheet" role="dialog" aria-label={`אפשרויות: ${title}`} onClick={(e) => e.stopPropagation()}>
            <strong className="more-title">{title}</strong>
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
            <button className="more-cancel" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </div>
      )}
    </>
  );
}
