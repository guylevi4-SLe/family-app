import { useEffect, useMemo, useRef, useState } from 'react';
import { orderedDepartments } from '../data/departments';
import { splitBought } from '../data/bought';
import { addItems, clearChecked, parseItems, updateItem, byUrgency, qtyLabel, type Item, type Urgency } from '../data/items';
import { useOverrides, usePrices } from '../data/hooks';
import { knownStores, priceKey, priceLabel, pricesByKey, type PriceEntry } from '../data/prices';
import { ItemSheet } from './ItemSheet';
import { PaidSheet } from './PaidSheet';
import { StaplesButton } from './Staples';
import { CommentButton } from './CommentButton';
import { useFamily } from './FamilyContext';
import { ZoomViewer } from './ZoomViewer';
import { Icon } from './Icon';
import { confirmAsk } from './ConfirmSheet';
import { Eraser } from 'lucide-react';

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
  const priceRows = usePrices(familyId);
  const byKey = useMemo(() => pricesByKey(priceRows), [priceRows]);
  const stores = useMemo(() => knownStores(priceRows), [priceRows]);
  const lastPrice = (it: Item) => byKey.get(priceKey(it.name))?.[0];
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ item: Item; staple: boolean } | null>(null);
  const [showBought, setShowBought] = useState(false);
  const [undo, setUndo] = useState<{ item: Item; deleted: boolean; timer: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const active = (items ?? []).filter((i) => !i.deleted && !i.checked);
  // Bought items older than a week leave the list. Every device does
  // this when the list opens; the writes are identical, so it's safe offline too.
  const { recent: bought, expired } = splitBought(items ?? [], Date.now());
  const expiredKey = expired.map((i) => i.id).join('\n');
  useEffect(() => {
    if (expired.length) clearChecked(familyId, expired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, expiredKey]);

  const groups = useMemo(() => {
    const order = orderedDepartments(deptOrder);
    const map = new Map<string, Item[]>();
    for (const it of active) {
      const dept = order.includes(it.category) ? it.category : order[order.length - 1];
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(it);
    }
    for (const list of map.values()) {
      list.sort(byUrgency);
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

  const offerUndo = (item: Item, deleted: boolean) => {
    if (undo) clearTimeout(undo.timer);
    const timer = window.setTimeout(() => setUndo(null), 7000);
    setUndo({ item, deleted, timer });
  };

  const toggle = (it: Item) => {
    updateItem(familyId, it.id, { checked: !it.checked });
    if (!it.checked) offerUndo(it, false);
  };

  return (
    <main className="list-page with-bottom-add shopping">
      {items !== undefined && (
        <div className="list-actions">
          {active.length > 0 && (
            <button className="small whatsapp" onClick={() => shareToWhatsApp(groups)}>
              <Icon name="whatsapp" size={20} />
              שליחת הרשימה לוואטסאפ
            </button>
          )}
          <StaplesButton
            familyId={familyId}
            items={items}
            byId={byId}
            overrides={overrides}
            deptOrder={deptOrder}
            lastPrice={lastPrice}
            onEdit={(it) => setEditing({ item: it, staple: true })}
          />
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
                <ItemRow key={it.id} item={it} last={lastPrice(it)} onToggle={() => toggle(it)} onEdit={() => setEditing({ item: it, staple: false })} onUrgency={(urgency) => updateItem(familyId, it.id, { urgency })} />
              ))}
            </ul>
          </section>
        ))
      )}

      {bought.length > 0 && (
        <section className="dept bought">
          <div className="section-head">
            <button className="link" onClick={() => setShowBought(!showBought)} aria-expanded={showBought}>
              נקנו בשבוע האחרון ({bought.length}) {showBought ? '▴' : '▾'}
            </button>
            <button
              className="link"
              onClick={async () => {
                const n = bought.length;
                if (await confirmAsk(n === 1 ? 'לנקות את הפריט שנקנה?' : `לנקות ${n} פריטים שנקנו?`, n === 1 ? 'הוא יוסר מהרשימה. אם הוא ב"המוצרים שלנו", הוא יישאר שם.' : 'הם יוסרו מהרשימה. מה שב"המוצרים שלנו" יישאר שם.', 'כן, לנקות', <Eraser size={22} />)) clearChecked(familyId, bought);
              }}
            >
              ניקוי
            </button>
          </div>
          {showBought && (
            <>
              <div className="list-actions price-actions">
                <button className="small price-button" onClick={() => setPaying(true)}>
                  <span aria-hidden="true">₪</span>
                  רישום מחירים
                </button>
              </div>
              <ul>
                {bought.map((it) => (
                  <ItemRow key={it.id} item={it} last={lastPrice(it)} onToggle={() => toggle(it)} onEdit={() => setEditing({ item: it, staple: false })} onUrgency={(urgency) => updateItem(familyId, it.id, { urgency })} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {undo && (
        <div className="toast bought-toast" role="status">
          <div className="toast-line">
            <span>{undo.item.name} {undo.deleted ? 'נמחק מהרשימה' : 'סומן כנקנה'}</span>
            <button
              onClick={() => {
                updateItem(familyId, undo.item.id, undo.deleted ? { deleted: false } : { checked: false });
                clearTimeout(undo.timer);
                setUndo(null);
              }}
            >
              ביטול
            </button>
            <button aria-label="סגירה" onClick={() => { clearTimeout(undo.timer); setUndo(null); }}>✕</button>
          </div>
        </div>
      )}

      {paying && bought.length > 0 && (
        <PaidSheet familyId={familyId} bought={bought} byKey={byKey} stores={stores} onClose={() => setPaying(false)} />
      )}

      {editing && (
        <ItemSheet
          familyId={familyId}
          item={byId.get(editing.item.id) ?? editing.item}
          staple={editing.staple}
          onDeleted={(it) => offerUndo(it, true)}
          deptOrder={deptOrder}
          byKey={byKey}
          stores={stores}
          existing={byId}
          overrides={overrides}
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
          placeholder="למשל: חלב, לחם, ביצים"
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

function ItemRow({ item, last, onToggle, onEdit, onUrgency }: { item: Item; last?: PriceEntry; onToggle: () => void; onEdit: () => void; onUrgency: (u: Urgency) => void }) {
  const photo = useFamily().itemPhotos.get(item.id);
  const [zoom, setZoom] = useState(false);
  return (
    <li className={`row ${item.checked ? 'checked' : ''}`}>
      <button className="check-area" onClick={onToggle} aria-pressed={item.checked}>
        <span className="box" aria-hidden="true">{item.checked ? '✓' : ''}</span>
        {/* Name and tags wrap onto a second line when they don't fit next to the buttons. */}
        <span className="item-main">
          <span className="name">{item.name}</span>
          {item.urgency && (
            // Tapping the tag takes it off instead of ticking the item.
            <span
              className={`urgency ${item.urgency}`}
              role="button"
              aria-label={`הסרת התג ${item.urgency === 'high' ? 'דחוף' : 'לא דחוף'} מ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onUrgency('');
              }}
            >
              {item.urgency === 'high' ? 'דחוף' : 'לא דחוף'}
            </span>
          )}
          {item.qty && (
            // The quantity opens the edit sheet (to change it) instead of ticking the item.
            <span
              className="qty"
              role="button"
              aria-label={`שינוי כמות ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              {qtyLabel(item.qty)}
            </span>
          )}
          {last && (
            <span
              className="price-tag"
              role="button"
              aria-label={`מחיר אחרון ${priceLabel(last)}${last.store ? ` ב${last.store}` : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              {priceLabel(last, true)}
            </span>
          )}
          {item.pending && <span className="pending-dot" title="ממתין לסנכרון" aria-label="ממתין לסנכרון" />}
        </span>
      </button>
      {/* The product's photo opens straight from the row. */}
      {photo && (
        <button className="comment-chip has" aria-label={`התמונה של ${item.name}`} onClick={() => setZoom(true)}>
          <Icon name="camera" size={18} />
        </button>
      )}
      <CommentButton type="item" id={item.id} title={item.name} />
      {zoom && photo && <ZoomViewer src={photo} alt={item.name} onClose={() => setZoom(false)} />}
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
    for (const it of list) {
      const tag = it.urgency === 'high' ? ' ❗דחוף' : it.urgency === 'low' ? ' (לא דחוף)' : '';
      lines.push(`• ${it.name}${it.qty ? ` (${qtyLabel(it.qty)})` : ''}${tag}`);
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
}
