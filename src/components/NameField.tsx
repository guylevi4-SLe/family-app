import { useLayoutEffect, useRef } from 'react';

/**
 * A name being edited: grows to a second line instead of hiding the start of a
 * long name, opens with the cursor at the end, and Enter saves (submits the form).
 */
export function NameField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className="name-field"
      dir="auto"
      aria-label={label}
      rows={1}
      maxLength={60}
      enterKeyHint="done"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
