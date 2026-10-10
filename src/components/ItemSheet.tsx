import { useState } from 'react';
import { normalize, orderedDepartments } from '../data/departments';
import { setCategory, updateItem, type Item } from '../data/items';
import { CommentButton } from './CommentButton';

export function ItemSheet({
  familyId,
  item,
  deptOrder,
  onClose,
}: {
  familyId: string;
  item: Item;
  deptOrder: string[] | undefined;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);

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
