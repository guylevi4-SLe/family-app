import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

type Ask = { title: string; text: string; resolve: (ok: boolean) => void };
let show: ((a: Ask) => void) | null = null;

/** Asks "are you sure?" in the app's own sheet before deleting; resolves true on "yes". */
export function confirmDelete(title: string, text = 'אי אפשר לבטל את המחיקה.'): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(title));
  return new Promise((resolve) => show!({ title, text, resolve }));
}

/** Mounted once; shows the question {@link confirmDelete} asks. */
export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    show = setAsk;
    return () => {
      show = null;
    };
  }, []);
  if (!ask) return null;
  const done = (ok: boolean) => {
    setAsk(null);
    ask.resolve(ok);
  };
  return (
    <div className="sheet-backdrop" onClick={() => done(false)}>
      <div className="sheet more-sheet confirm-sheet" role="alertdialog" aria-label={ask.title} onClick={(e) => e.stopPropagation()}>
        <span className="confirm-icon" aria-hidden="true"><Trash2 size={26} /></span>
        <strong className="more-title">{ask.title}</strong>
        <p className="muted">{ask.text}</p>
        <button className="confirm-yes" onClick={() => done(true)}>כן, למחוק</button>
        <button className="more-cancel" onClick={() => done(false)}>ביטול</button>
      </div>
    </div>
  );
}
