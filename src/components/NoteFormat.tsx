import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Heading, Highlighter, Italic, List, ListChecks, Strikethrough, Underline } from 'lucide-react';
import { parseInline, parseLine, togglePrefix, wrapSelection, type Edit, type Inline } from '../data/noteFormat';

const TAG: Record<string, string> = { b: 'strong', i: 'em', s: 's', u: 'u', hl: 'mark' };

// Each run remembers where its text starts in the note (data-at), so a selection
// made on the formatted view can be found in the text.
function runsAt(text: string, base: number): ReactNode[] {
  let pos = 0;
  return parseInline(text).map((r: Inline, k) => {
    pos = text.indexOf(r.text, pos);
    const at = base + pos;
    pos += r.text.length;
    return r.marks.reduceRight<ReactNode>((child, m) => {
      const T = TAG[m] as 'strong';
      return <T>{child}</T>;
    }, <span key={k} data-at={at}>{r.text}</span>);
  }).map((n, k) => <span key={k}>{n}</span>);
}

/** Where the selection on the formatted view sits in the note's text, or null when nothing there is selected. */
export function viewSelection(view: HTMLElement | null): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!view || !sel || sel.isCollapsed || !sel.rangeCount) return null;
  const at = (node: Node, offset: number) => {
    const span = node.nodeType === Node.TEXT_NODE ? node.parentElement : null;
    const base = span && view.contains(span) ? span.dataset.at : undefined;
    return base === undefined ? null : Number(base) + offset;
  };
  const r = sel.getRangeAt(0);
  const a = at(r.startContainer, r.startOffset);
  const b = at(r.endContainer, r.endOffset);
  return a === null || b === null || a === b ? null : { start: Math.min(a, b), end: Math.max(a, b) };
}

/** The note, formatted. Tapping text starts editing; tapping a checkbox ticks it. */
export function NoteView({ text, onEdit, onToggle, viewRef }: { text: string; onEdit: () => void; onToggle: (line: number) => void; viewRef?: RefObject<HTMLDivElement> }) {
  let lineStart = 0;
  return (
    <div ref={viewRef} className="note-body note-view" role="button" tabIndex={0} aria-label="עריכת תוכן הפתק" onClick={onEdit} onKeyDown={(e) => e.key === 'Enter' && onEdit()}>
      {text.split('\n').map((raw, i) => {
        const line = parseLine(raw);
        const base = lineStart + raw.length - ('text' in line ? line.text.length : 0);
        lineStart += raw.length + 1;
        const runs = (t: string) => runsAt(t, base);
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

/** Where the on-screen keyboard starts (px from the top), or null when no keyboard is open. */
function useKeyboardTop() {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height;
      setTop(covered > 120 ? vv.offsetTop + vv.height : null);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return top;
}

/**
 * Buttons that add the marks; they keep the keyboard and the selection where they are.
 * With the phone keyboard open the bar sits right on top of it, so scrolling never hides it.
 */
export function FormatBar({ target, onChange, range }: { target: RefObject<HTMLTextAreaElement>; onChange: (v: string) => void; range?: { start: number; end: number } | null }) {
  const keyboardTop = useKeyboardTop();
  const bar = (
    <div
      className={`format-bar ${keyboardTop !== null ? 'on-keyboard' : ''}`}
      style={keyboardTop !== null ? { top: keyboardTop } : undefined}
      role="toolbar"
      aria-label="עיצוב טקסט"
    >
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
            // A word picked on the formatted view: change the text without opening the keyboard.
            if (range) {
              onChange(t.run(el.value, range.start, range.end).value);
              window.getSelection()?.removeAllRanges();
              return;
            }
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
  return keyboardTop !== null ? createPortal(bar, document.body) : bar;
}
