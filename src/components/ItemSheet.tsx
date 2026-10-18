import { useState } from 'react';
import { normalize, orderedDepartments } from '../data/departments';
import { addItems, setCategory, updateItem, type Item } from '../data/items';
import { addPrice, ago, deletePrice, formatPrice, parsePrice, priceKey, similarKinds, type PriceEntry } from '../data/prices';
import { auth } from '../firebase';
import { CommentButton } from './CommentButton';

export function ItemSheet({
  familyId,
  item,
  deptOrder,
  byKey,
  stores,
  existing,
  overrides,
  onClose,
}: {
  familyId: string;
  item: Item;
  deptOrder: string[] | undefined;
  byKey: Map<string, PriceEntry[]>;
  stores: string[];
  existing: Map<string, Item>;
  overrides: Map<string, string>;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [paid, setPaid] = useState({ price: '', store: stores[0] ?? '' });
  const history = byKey.get(priceKey(name.trim() || item.name)) ?? [];
  const cheapest = history.length > 1 ? Math.min(...history.map((h) => h.price)) : null;
  const kinds = similarKinds(name.trim() || item.name, byKey);

  // "קוטג'" becomes the kind bought before ("קוטג' 3%"), with its prices; the quantity stays.
  const switchTo = (kind: string) => {
    updateItem(familyId, item.id, { deleted: true });
    addItems(familyId, [{ name: kind, qty: qty.trim() }], existing, overrides);
    onClose();
  };

  const save = () => {
    const fields: Parameters<typeof updateItem>[2] = {};
    if (name.trim() && name.trim() !== item.name) fields.name = name.trim().slice(0, 80);
    if (qty.trim() !== item.qty) fields.qty = qty.trim().slice(0, 30);
    if (Object.keys(fields).length) updateItem(familyId, item.id, fields);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={save}>
      <div className="sheet" role="dialog" aria-label={`עריכת ${item.name}`} onClick={(e) => e.stopPropagation()}>
        <label>
          שם
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          כמות
          <input value={qty} maxLength={30} placeholder="למשל: 2, 1 ק״ג" onChange={(e) => setQty(e.target.value)} />
        </label>
        {kinds.length > 0 && (
          <div className="kinds">
            <span className="field-label">סוגים שקניתם בעבר</span>
            <div className="chips" role="group" aria-label="סוגים שקניתם בעבר">
              {kinds.map((k) => (
                <button type="button" key={k.key} className="chip" onClick={() => switchTo(k.name)}>
                  {k.name} <span className="chip-price">{formatPrice(k.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="price-box">
          <span className="field-label">מחירים ששילמתם</span>
          {history.length > 0 ? (
            <ul className="price-history" aria-label="היסטוריית מחירים">
              {history.slice(0, 6).map((h) => (
                <li key={h.id} className={h.price === cheapest ? 'cheapest' : ''}>
                  <strong>{formatPrice(h.price)}</strong>
                  <span>{h.store || 'בלי חנות'}</span>
                  <span className="muted">{ago(h)}</span>
                  {h.price === cheapest && <span className="cheap-mark">הכי זול</span>}
                  {h.by === auth.currentUser?.uid && (
                    <button type="button" className="link muted" aria-label={`מחיקת המחיר ${formatPrice(h.price)}`} onClick={() => deletePrice(familyId, h.id)}>
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small-text">עוד לא נרשם מחיר. אפשר להוסיף כאן, או אחרי הקנייה דרך "רישום מחירים" ב"נקנו בשבוע האחרון".</p>
          )}
          <div className="paid-form">
            <input inputMode="decimal" placeholder="מחיר ₪" aria-label="מחיר חדש" value={paid.price} onChange={(e) => setPaid({ ...paid, price: e.target.value })} />
            <input list="known-stores-sheet" placeholder="איפה?" aria-label="חנות" maxLength={40} value={paid.store} onChange={(e) => setPaid({ ...paid, store: e.target.value })} />
            <button
              type="button"
              className="small"
              disabled={!parsePrice(paid.price)}
              onClick={() => {
                addPrice(familyId, name.trim() || item.name, parsePrice(paid.price)!, paid.store);
                setPaid({ ...paid, price: '' });
              }}
            >
              הוספה
            </button>
            <datalist id="known-stores-sheet">
              {stores.map((st) => <option key={st} value={st} />)}
            </datalist>
          </div>
        </div>
        <label>
          מחלקה
          <select
            value={item.category}
            onChange={(e) => setCategory(familyId, { ...item, norm: normalize(name) || item.norm }, e.target.value)}
          >
            {orderedDepartments(deptOrder).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <p className="muted small-text">שינוי מחלקה נשמר למשפחה, והמוצר ימוין כך גם בפעם הבאה.</p>
        <CommentButton type="item" id={item.id} title={item.name} always />
        <div className="sheet-actions">
          <button className="primary" onClick={save}>
            שמירה
          </button>
          <button
            className="danger"
            onClick={() => {
              updateItem(familyId, item.id, { deleted: true });
              onClose();
            }}
          >
            מחיקה
          </button>
        </div>
      </div>
    </div>
  );
}
