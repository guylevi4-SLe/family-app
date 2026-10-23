import { useState } from 'react';
import { normalize, orderedDepartments } from '../data/departments';
import { addItems, setCategory, updateItem, type Item, type Urgency } from '../data/items';
import { addPrice, ago, cheapestByUnit, defaultUnit, deletePrice, estimateTotal, formatPrice, parsePrice, priceKey, priceLabel, similarKinds, type PriceEntry } from '../data/prices';
import { auth } from '../firebase';
import { CommentButton } from './CommentButton';
import { useFamily } from './FamilyContext';
import { UnitPick } from './UnitPick';
import { ZoomViewer } from './ZoomViewer';

export function ItemSheet({
  familyId,
  item,
  deptOrder,
  byKey,
  stores,
  existing,
  overrides,
  staple = false,
  onDeleted,
  onClose,
}: {
  familyId: string;
  item: Item;
  deptOrder: string[] | undefined;
  byKey: Map<string, PriceEntry[]>;
  stores: string[];
  existing: Map<string, Item>;
  overrides: Map<string, string>;
  /** Opened from "המוצרים שלנו": edits the usual quantity, and removing takes it off that list only. */
  staple?: boolean;
  onDeleted?: (item: Item) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(staple ? (item.usualQty ?? '') : item.qty);
  const [isStaple, setIsStaple] = useState(!!item.staple);
  const [urgency, setUrgency] = useState<Urgency>(item.urgency ?? '');
  const history = byKey.get(priceKey(name.trim() || item.name)) ?? [];
  const [paid, setPaid] = useState({ price: '', store: stores[0] ?? '', unit: defaultUnit(history[0], item.category) });
  const isCheapest = cheapestByUnit(history);
  const estimate = staple ? null : estimateTotal(qty, history[0]);
  const kinds = similarKinds(name.trim() || item.name, byKey);
  const photo = useFamily().itemPhotos.get(item.id);
  const [zoom, setZoom] = useState(false);

  // "קוטג'" becomes the kind bought before ("קוטג' 3%"), with its prices; the quantity stays.
  const switchTo = (kind: string) => {
    updateItem(familyId, item.id, { deleted: true });
    addItems(familyId, [{ name: kind, qty: qty.trim() }], existing, overrides);
    onClose();
  };

  const save = () => {
    const fields: Parameters<typeof updateItem>[2] = {};
    if (name.trim() && name.trim() !== item.name) fields.name = name.trim().slice(0, 80);
    if (staple) {
      if (qty.trim() !== (item.usualQty ?? '')) fields.usualQty = qty.trim().slice(0, 30);
    } else {
      if (qty.trim() !== item.qty) fields.qty = qty.trim().slice(0, 30);
      if (urgency !== (item.urgency ?? '')) fields.urgency = urgency;
      if (isStaple !== !!item.staple) {
        fields.staple = isStaple;
        if (isStaple && !item.usualQty) fields.usualQty = qty.trim().slice(0, 30);
      }
    }
    if (Object.keys(fields).length) updateItem(familyId, item.id, fields);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={save}>
      <div className="sheet" role="dialog" aria-label={`עריכת ${item.name}`} onClick={(e) => e.stopPropagation()}>
        {/* The newest photo from the item's notes, whole and uncropped. */}
        {photo && (
          <button type="button" className="item-photo" aria-label={`הגדלת התמונה של ${item.name}`} onClick={() => setZoom(true)}>
            <img src={photo} alt="" />
          </button>
        )}
        <label>
          שם
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {staple ? 'כמות רגילה' : 'כמות'}
          <input value={qty} maxLength={30} placeholder="למשל: 2, 1 ק״ג" onChange={(e) => setQty(e.target.value)} />
        </label>
        {!staple && (
          <>
            {/* No tag means a normal item; tapping the chosen tag again takes it off. */}
            <div className="urgency-pick" role="group" aria-label="דחיפות">
              {([['high', 'דחוף'], ['low', 'לא דחוף']] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={urgency === v} className={`${v} ${urgency === v ? 'on' : ''}`} onClick={() => setUrgency(urgency === v ? '' : v)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="check-line">
              <input type="checkbox" checked={isStaple} onChange={(e) => setIsStaple(e.target.checked)} />
              שמירה ב"המוצרים שלנו"
            </label>
          </>
        )}
        {!staple && kinds.length > 0 && (
          <div className="kinds">
            <span className="field-label">סוגים שקניתם בעבר</span>
            <div className="chips" role="group" aria-label="סוגים שקניתם בעבר">
              {kinds.map((k) => (
                <button type="button" key={k.key} className="chip" onClick={() => switchTo(k.name)}>
                  {k.name} <span className="chip-price">{priceLabel(k)}</span>
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
                <li key={h.id} className={isCheapest(h) ? 'cheapest' : ''}>
                  <strong>{priceLabel(h)}</strong>
                  <span>{h.store || 'בלי חנות'}</span>
                  <span className="muted">{ago(h)}</span>
                  {isCheapest(h) && <span className="cheap-mark">הכי זול</span>}
                  {h.by === auth.currentUser?.uid && (
                    <button type="button" className="link muted" aria-label={`מחיקת המחיר ${priceLabel(h)}`} onClick={() => deletePrice(familyId, h.id)}>
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small-text">עוד לא נרשם מחיר. אפשר להוסיף כאן, או אחרי הקנייה דרך "רישום מחירים" ב"נקנו בשבוע האחרון".</p>
          )}
          {estimate !== null && (
            <p className="small-text estimate">
              בערך {formatPrice(estimate)} ל־{qty.trim()}
            </p>
          )}
          <UnitPick value={paid.unit} onChange={(unit) => setPaid({ ...paid, unit })} name={name.trim() || item.name} />
          <div className="paid-form">
            <input inputMode="decimal" placeholder={paid.unit === 'kg' ? 'מחיר לק״ג ₪' : 'מחיר ₪'} aria-label="מחיר חדש" value={paid.price} onChange={(e) => setPaid({ ...paid, price: e.target.value })} />
            <input list="known-stores-sheet" placeholder="איפה?" aria-label="חנות" maxLength={40} value={paid.store} onChange={(e) => setPaid({ ...paid, store: e.target.value })} />
            <button
              type="button"
              className="small"
              disabled={!parsePrice(paid.price)}
              onClick={() => {
                addPrice(familyId, name.trim() || item.name, parsePrice(paid.price)!, paid.store, paid.unit);
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
          {staple ? (
            <button
              className="danger"
              onClick={() => {
                updateItem(familyId, item.id, { staple: false });
                onClose();
              }}
            >
              הסרה מהמוצרים שלנו
            </button>
          ) : (
            <button
              className="danger"
              onClick={() => {
                updateItem(familyId, item.id, { deleted: true });
                onDeleted?.(item);
                onClose();
              }}
            >
              מחיקה
            </button>
          )}
        </div>
        {zoom && photo && <ZoomViewer src={photo} alt={item.name} onClose={() => setZoom(false)} />}
      </div>
    </div>
  );
}
