import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

type Ask = { title: string; text: string; yes?: string; alt?: string; icon?: ReactNode; resolve: (answer: boolean | 'alt') => void };
let show: ((a: Ask) => void) | null = null;

/** Asks "are you sure?" in the app's own sheet before deleting; resolves true on "yes". */
export function confirmDelete(title: string, text = 'אי אפשר לבטל את המחיקה.'): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(title));
  return new Promise((resolve) => show!({ title, text, resolve: (a) => resolve(a === true) }));
}

/** The same sheet for any other "are you sure?", with its own "yes" button and icon. */
export function confirmAsk(title: string, text: string, yes: string, icon: ReactNode): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(title));
  return new Promise((resolve) => show!({ title, text, yes, icon, resolve: (a) => resolve(a === true) }));
}

/** Deleting with two choices: resolves 'yes', 'alt' or null when cancelled. */
export function confirmChoice(title: string, text: string, yes: string, alt: string): Promise<'yes' | 'alt' | null> {
  if (!show) return Promise.resolve(window.confirm(title) ? 'yes' : null);
  return new Promise((resolve) => show!({ title, text, yes, alt, resolve: (a) => resolve(a === true ? 'yes' : a || null) }));
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
  const done = (answer: boolean | 'alt') => {
    setAsk(null);
    ask.resolve(answer);
  };
  return (
    <div className="sheet-backdrop confirm-backdrop" onClick={() => done(false)}>
      <div className="sheet more-sheet confirm-sheet" role="alertdialog" aria-label={ask.title} onClick={(e) => e.stopPropagation()}>
        <span className="confirm-icon" aria-hidden="true">{ask.icon ?? <Trash2 size={26} />}</span>
        <strong className="more-title">{ask.title}</strong>
        <p className="muted">{ask.text}</p>
        <button className="confirm-yes" onClick={() => done(true)}>{ask.yes ?? 'כן, למחוק'}</button>
        {ask.alt && <button className="confirm-alt" onClick={() => done('alt')}>{ask.alt}</button>}
        <button className="more-cancel" onClick={() => done(false)}>ביטול</button>
      </div>
    </div>
  );
}
