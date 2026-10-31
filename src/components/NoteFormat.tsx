import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ClipboardEvent, type RefObject, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Heading, Highlighter, Italic, List, ListChecks, Strikethrough, Underline } from 'lucide-react';
import { lineDir, lineDirs, markLines, parseInline, parseLine, stripMarks, toRaw, toShown, togglePrefix, wrapSelection, type Edit, type Inline } from '../data/noteFormat';

const TAG: Record<string, string> = { b: 'strong', i: 'em', s: 's', u: 'u', hl: 'mark' };

// Each run remembers where its text starts in the note (data-at), so a selection
// made on the formatted view can be found in the text.
function runsAt(text: string, base: number): ReactNode[] {
  let pos = 0;
  return parseInline(text).map((r: Inline, k) => {
    pos = text.indexOf(r.text, pos);
    const at = base + pos;
    pos += r.text.length;
    const run = <span key={k} data-at={at}>{r.text}</span>;
    return r.marks.reduceRight<ReactNode>((child, m) => {
      const T = TAG[m] as 'strong';
      return <T>{child}</T>;
    }, r.href ? (
      // Opens the address; a tap anywhere else still starts editing.
      <a className="nf-link" dir="ltr" href={r.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{run}</a>
    ) : run);
  }).map((n, k) => <span key={k}>{n}</span>);
}

/**
 * The text box takes the direction of the line the cursor is on. Each line already
 * shows in its own direction, but the iPhone places the cursor by the box's.
 */
export function useLineDir(target: RefObject<HTMLTextAreaElement>) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const follow = () => {
      if (document.activeElement !== el) return;
      const d = lineDir(el.value, el.selectionStart);
      if (d && el.dir !== d) el.dir = d;
    };
    // Where the selection change is announced differs between browsers: listen on both.
    const events = ['selectionchange', 'input', 'keyup', 'pointerup', 'focus'];
    events.forEach((t) => el.addEventListener(t, follow));
    document.addEventListener('selectionchange', follow);
    return () => {
      events.forEach((t) => el.removeEventListener(t, follow));
      document.removeEventListener('selectionchange', follow);
    };
  }, [target]);
}

/**
 * The note's text box. A line with only numbers sits on the side of the line above
 * it: the box shows an invisible mark for that, which never reaches the saved text,
 * the cursor, or what is copied.
 */
export function NoteBox({
  boxRef,
  value,
  onText,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  boxRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onText: (v: string) => void;
}) {
  const shown = markLines(value);
  const caret = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    const c = caret.current;
    caret.current = null;
    if (!el || !c || document.activeElement !== el) return;
    el.setSelectionRange(toShown(el.value, c.start), toShown(el.value, c.end));
  });
  const put = (raw: string, at: number) => {
    caret.current = { start: at, end: at };
    onText(raw);
  };
  const copy = (e: ClipboardEvent<HTMLTextAreaElement>, cut: boolean) => {
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: t } = el;
    if (s === t) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', stripMarks(el.value.slice(s, t)));
    if (cut) put(stripMarks(el.value.slice(0, s) + el.value.slice(t)), toRaw(el.value, s));
  };
  return (
    <textarea
      {...rest}
      ref={boxRef}
      value={shown}
      onCopy={(e) => copy(e, false)}
      onCut={(e) => copy(e, true)}
      onChange={(e) => {
        const el = e.target;
        let raw = stripMarks(el.value);
        let start = toRaw(el.value, el.selectionStart);
        let end = toRaw(el.value, el.selectionEnd);
        // Deleting only the mark would change nothing: delete the character beside it.
        const kind = (e.nativeEvent as InputEvent).inputType;
        if (raw === value && el.value !== shown) {
          if (kind === 'deleteContentBackward' && start > 0) {
            start -= 1;
            raw = raw.slice(0, start) + raw.slice(start + 1);
          } else if (kind === 'deleteContentForward') raw = raw.slice(0, start) + raw.slice(start + 1);
          end = start;
        }
        caret.current = { start, end: Math.max(start, end) };
        onText(raw);
      }}
    />
  );
}

/** Where the selection on the formatted view sits in the note's text, or null when nothing there is selected. */
export function viewSelection(view: HTMLElement | null): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!view || !sel || sel.isCollapsed || !sel.rangeCount) return null;
  const base = (t: Node) => {
    const span = t.parentElement;
    return span && view.contains(span) && span.dataset.at !== undefined ? Number(span.dataset.at) : null;
  };
  // A selection that covers a formatted word edge to edge can end on the element
  // around it (iPhone does this) rather than in its text: use the text just inside.
  const at = (node: Node, offset: number, end: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const b = base(node);
      return b === null ? null : b + offset;
    }
    const point = document.createRange();
    point.setStart(node, offset);
    const walk = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    let found: number | null = null;
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const b = base(t);
      if (b === null) continue;
      const len = (t as Text).length;
      if (!end && point.comparePoint(t, 0) >= 0) return b;
      if (end && point.comparePoint(t, len) <= 0) found = b + len;
    }
    return found;
  };
  const r = sel.getRangeAt(0);
  const a = at(r.startContainer, r.startOffset, false);
  const b = at(r.endContainer, r.endOffset, true);
  return a === null || b === null || a === b ? null : { start: Math.min(a, b), end: Math.max(a, b) };
}

/** The note, formatted. Tapping text starts editing; tapping a checkbox ticks it. */
export function NoteView({ text, onEdit, onToggle, viewRef }: { text: string; onEdit: () => void; onToggle: (line: number) => void; viewRef?: RefObject<HTMLDivElement> }) {
  let lineStart = 0;
  const dirs = lineDirs(text);
  return (
    <div ref={viewRef} className="note-body note-view" role="button" tabIndex={0} aria-label="עריכת תוכן הפתק" onClick={onEdit} onKeyDown={(e) => e.key === 'Enter' && onEdit()}>
      {text.split('\n').map((raw, i) => {
        const line = parseLine(raw);
        const dir = dirs[i] ?? 'auto';
        const base = lineStart + raw.length - ('text' in line ? line.text.length : 0);
        lineStart += raw.length + 1;
        const runs = (t: string) => runsAt(t, base);
        switch (line.kind) {
          case 'empty':
            return <p key={i} dir={dir} className="nf-empty" />;
          case 'h1':
            return <p key={i} dir={dir} className="nf-h1">{runs(line.text)}</p>;
          case 'h2':
            return <p key={i} dir={dir} className="nf-h2">{runs(line.text)}</p>;
          case 'quote':
            return <p key={i} dir={dir} className="nf-quote">{runs(line.text)}</p>;
          case 'bullet':
            return <p key={i} dir={dir} className="nf-li"><span className="nf-bullet" aria-hidden="true">•</span>{runs(line.text)}</p>;
          case 'number':
            return <p key={i} dir={dir} className="nf-li"><span className="nf-bullet">{line.n}.</span>{runs(line.text)}</p>;
          case 'check':
            return (
              <p key={i} dir={dir} className={`nf-check ${line.done ? 'done' : ''}`}>
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
            return <p key={i} dir={dir}>{runs(line.text)}</p>;
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
            // The box may show invisible direction marks: work on the text itself.
            const raw = stripMarks(el.value);
            if (range) {
              onChange(t.run(raw, range.start, range.end).value);
              window.getSelection()?.removeAllRanges();
              return;
            }
            const r = t.run(raw, toRaw(el.value, el.selectionStart), toRaw(el.value, el.selectionEnd));
            el.value = markLines(r.value);
            onChange(r.value);
            el.focus();
            el.setSelectionRange(toShown(el.value, r.start), toShown(el.value, r.end));
          }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
  return keyboardTop !== null ? createPortal(bar, document.body) : bar;
}
