import type { ReactNode, RefObject } from 'react';
import { Bold, Heading, Highlighter, Italic, List, ListChecks, Strikethrough, Underline } from 'lucide-react';
import { parseInline, parseLine, togglePrefix, wrapSelection, type Edit, type Inline } from '../data/noteFormat';

const TAG: Record<string, string> = { b: 'strong', i: 'em', s: 's', u: 'u', hl: 'mark' };

function runs(text: string): ReactNode[] {
  return parseInline(text).map((r: Inline, k) =>
    r.marks.reduceRight<ReactNode>((child, m) => {
      const T = TAG[m] as 'strong';
      return <T>{child}</T>;
    }, <span key={k}>{r.text}</span>),
  ).map((n, k) => <span key={k}>{n}</span>);
}

/** The note, formatted. Tapping text starts editing; tapping a checkbox ticks it. */
export function NoteView({ text, onEdit, onToggle }: { text: string; onEdit: () => void; onToggle: (line: number) => void }) {
  return (
    <div className="note-body note-view" role="button" tabIndex={0} aria-label="עריכת תוכן הפתק" onClick={onEdit} onKeyDown={(e) => e.key === 'Enter' && onEdit()}>
      {text.split('\n').map((raw, i) => {
        const line = parseLine(raw);
        switch (line.kind) {
          case 'empty':
            return <p key={i} className="nf-empty" />;
          case 'h1':
            return <p key={i} className="nf-h1">{runs(line.text)}</p>;
          case 'h2':
            return <p key={i} className="nf-h2">{runs(line.text)}</p>;
          case 'quote':
            return <p key={i} className="nf-quote">{runs(line.text)}</p>;
          case 'bullet':
            return <p key={i} className="nf-li"><span className="nf-bullet" aria-hidden="true">•</span>{runs(line.text)}</p>;
          case 'number':
            return <p key={i} className="nf-li"><span className="nf-bullet">{line.n}.</span>{runs(line.text)}</p>;
          case 'check':
            return (
              <p key={i} className={`nf-check ${line.done ? 'done' : ''}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={line.done}
                  aria-label={line.text || 'סימון'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(i);
                  }}
                >
                  {line.done ? '✓' : ''}
                </button>
                <span>{runs(line.text)}</span>
              </p>
            );
          default:
            return <p key={i}>{runs(line.text)}</p>;
        }
      })}
    </div>
  );
}

const TOOLS: { label: string; icon: ReactNode; run: (v: string, s: number, e: number) => Edit }[] = [
  { label: 'מודגש', icon: <Bold size={18} />, run: (v, s, e) => wrapSelection(v, s, e, '*') },
  { label: 'קו מתחת', icon: <Underline size={18} />, run: (v, s, e) => wrapSelection(v, s, e, '++') },
  { label: 'נטוי', icon: <Italic size={18} />, run: (v, s, e) => wrapSelection(v, s, e, '_') },
  { label: 'קו חוצה', icon: <Strikethrough size={18} />, run: (v, s, e) => wrapSelection(v, s, e, '~') },
  { label: 'מרקר', icon: <Highlighter size={18} />, run: (v, s, e) => wrapSelection(v, s, e, '==') },
  { label: 'כותרת', icon: <Heading size={18} />, run: (v, s, e) => togglePrefix(v, s, e, '# ') },
  { label: 'רשימה', icon: <List size={18} />, run: (v, s, e) => togglePrefix(v, s, e, '- ') },
  { label: 'תיבות סימון', icon: <ListChecks size={18} />, run: (v, s, e) => togglePrefix(v, s, e, '[ ] ') },
];

/** Buttons that add the marks; they keep the keyboard and the selection where they are. */
export function FormatBar({ target, onChange }: { target: RefObject<HTMLTextAreaElement>; onChange: (v: string) => void }) {
  return (
    <div className="format-bar" role="toolbar" aria-label="עיצוב טקסט">
      {TOOLS.map((t) => (
        <button
          key={t.label}
          type="button"
          aria-label={t.label}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = target.current;
            if (!el) return;
            const r = t.run(el.value, el.selectionStart, el.selectionEnd);
            el.value = r.value;
            onChange(r.value);
            el.focus();
            el.setSelectionRange(r.start, r.end);
          }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
