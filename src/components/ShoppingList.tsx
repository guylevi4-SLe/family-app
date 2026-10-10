import { useMemo, useRef, useState } from 'react';
import { orderedDepartments } from '../data/departments';
import { addItems, clearChecked, parseItems, updateItem, type Item } from '../data/items';
import { useOverrides } from '../data/hooks';
import { ItemSheet } from './ItemSheet';
import { CommentButton } from './CommentButton';
import { Icon } from './Icon';

const RECENT_DAYS = 30;

export function ShoppingList({
  familyId,
  items,
  deptOrder,
}: {
  familyId: string;
  items: Item[] | undefined;
  deptOrder: string[] | undefined;
}) {
  const overrides = useOverrides(familyId);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Item | null>(null);
  const [showBought, setShowBought] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [undo, setUndo] = useState<{ item: Item; timer: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const active = (items ?? []).filter((i) => !i.deleted && !i.checked);
  const bought = (items ?? []).filter((i) => !i.deleted && i.checked);
  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  const deleted = (items ?? [])
    .filter((i) => i.deleted && (i.updatedAt?.toMillis() ?? Date.now()) > cutoff)
    .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));

  const groups = useMemo(() => {
    const order = orderedDepartments(deptOrder);
    const map = new Map<string, Item[]>();
    for (const it of active) {
      const dept = order.includes(it.category) ? it.category : order[order.length - 1];
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(it);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.addedAt?.toMillis() ?? Infinity) - (b.addedAt?.toMillis() ?? Infinity));
    }
    return order.filter((d) => map.has(d)).map((d) => [d, map.get(d)!] as const);
  }, [active, deptOrder]);

  const submit = () => {
    const parsed = parseItems(text);
    if (!parsed.length) return;
    addItems(familyId, parsed, byId, overrides);
    setText('');
    inputRef.current?.focus();
  };

  const toggle = (it: Item) => {
    updateItem(familyId, it.id, { checked: !it.checked });
    if (!it.checked) {
      if (undo) clearTimeout(undo.timer);
      const timer = window.setTimeout(() => setUndo(null), 5000);
      setUndo({ item: it, timer });
    }
  };

  return (
    <main className="list-page with-bottom-add shopping">
      {active.length > 0 && (
        <div className="list-actions">
          <button className="small whatsapp" onClick={() => shareToWhatsApp(groups)}>
            <Icon name="whatsapp" size={20} />
            שליחת הרשימה לוואטסאפ
          </button>
        </div>
      )}

      {items === undefined ? null : active.length === 0 ? (
        <p className="empty">הרשימה ריקה. מה חסר בבית?</p>
      ) : (
        groups.map(([dept, list]) => (
          <section key={dept} className="dept">
            <h2>{dept}</h2>
            <ul>
              {list.map((it) => (
                <ItemRow key={it.id} item={it} onToggle={() => toggle(it)} onEdit={() => setEditing(it)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {bought.length > 0 && (
        <section className="dept bought">
          <div className="section-head">
            <button className="link" onClick={() => setShowBought(!showBought)} aria-expanded={showBought}>
              נקנו ({bought.length}) {showBought ? '▴' : '▾'}
            </button>
            <button className="link" onClick={() => clearChecked(familyId, bought)}>
              ניקוי
            </button>
          </div>
          {showBought && (
            <ul>
              {bought.map((it) => (
                <ItemRow key={it.id} item={it} onToggle={() => toggle(it)} onEdit={() => setEditing(it)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {deleted.length > 0 && (
        <section className="dept deleted">
          <button className="link muted" onClick={() => setShowDeleted(!showDeleted)} aria-expanded={showDeleted}>
            נמחקו לאחרונה ({deleted.length}) {showDeleted ? '▴' : '▾'}
          </button>
          {showDeleted && (
            <ul>
              {deleted.map((it) => (
                <li key={it.id} className="row">
                  <span className="name">{it.name}</span>
                  <button
                    className="small"
                    onClick={() => updateItem(familyId, it.id, { deleted: false, checked: false })}
                  >
                    החזרה לרשימה
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {undo && (
        <div className="toast" role="status">
          <span>{undo.item.name} סומן כנקנה</span>
          <button
            onClick={() => {
              updateItem(familyId, undo.item.id, { checked: false });
              clearTimeout(undo.timer);
              setUndo(null);
            }}
          >
            ביטול
          </button>
        </div>
      )}

      {editing && (
        <ItemSheet
          familyId={familyId}
          item={byId.get(editing.id) ?? editing}
          deptOrder={deptOrder}
          onClose={() => setEditing(null)}
        />
      )}
      <form
        className="add-box bottom-add"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder="מה להוסיף? אפשר כמה, עם פסיק"
          aria-label="הוספת מוצרים"
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds; pasted multi-line lists still work.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="primary add-button" aria-label="הוספה" disabled={!text.trim()}>
          +
        </button>
      </form>
    </main>
  );
}

function ItemRow({ item, onToggle, onEdit }: { item: Item; onToggle: () => void; onEdit: () => void }) {
  return (
    <li className={`row ${item.checked ? 'checked' : ''}`}>
      <button className="check-area" onClick={onToggle} aria-pressed={item.checked}>
        <span className="box" aria-hidden="true">{item.checked ? '✓' : ''}</span>
        <span className="name">{item.name}</span>
        {item.qty && <span className="qty">{item.qty}</span>}
        {item.pending && <span className="pending-dot" title="ממתין לסנכרון" aria-label="ממתין לסנכרון" />}
      </button>
      <CommentButton type="item" id={item.id} title={item.name} />
      <button className="icon-button edit" aria-label={`עריכת ${item.name}`} onClick={onEdit}>
        <Icon name="edit" size={18} />
      </button>
    </li>
  );
}

/** Opens WhatsApp with the open items, grouped by department. */
function shareToWhatsApp(groups: (readonly [string, Item[]])[]) {
  const lines = ['🛒 *רשימת קניות*'];
  for (const [dept, list] of groups) {
    lines.push(`*${dept}*`);
    for (const it of list) lines.push(`• ${it.name}${it.qty ? ` (${it.qty})` : ''}`);
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
}
