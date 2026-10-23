import { useMemo, useState } from 'react';
import { orderedDepartments } from '../data/departments';
import { addStaples, addStaplesToList, parseItems, qtyLabel, updateItem, type Item } from '../data/items';
import { priceLabel, type PriceEntry } from '../data/prices';
import { Icon } from './Icon';
import { ShoppingBasket } from 'lucide-react';

/** "המוצרים שלנו": a small button above the list that opens the family's usual products. */
export function StaplesButton(props: {
  familyId: string;
  items: Item[];
  byId: Map<string, Item>;
  overrides: Map<string, string>;
  deptOrder: string[] | undefined;
  lastPrice: (it: Item) => PriceEntry | undefined;
  onEdit: (it: Item) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = props.items.filter((i) => i.staple).length;
  return (
    <>
      <button className="small staples-button" onClick={() => setOpen(true)}>
        <ShoppingBasket size={16} aria-hidden="true" />
        המוצרים שלנו ({count})
      </button>
      {open && <StaplesSheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

/** What the family usually buys, by department, over the list; a tap puts it on the list. */
function StaplesSheet({
  familyId,
  items,
  byId,
  overrides,
  deptOrder,
  lastPrice,
  onEdit,
  onClose,
}: {
  familyId: string;
  items: Item[];
  byId: Map<string, Item>;
  overrides: Map<string, string>;
  deptOrder: string[] | undefined;
  lastPrice: (it: Item) => PriceEntry | undefined;
  onEdit: (it: Item) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const staples = items.filter((i) => i.staple);

  const groups = useMemo(() => {
    const order = orderedDepartments(deptOrder);
    const map = new Map<string, Item[]>();
    for (const it of staples) {
      const dept = order.includes(it.category) ? it.category : order[order.length - 1];
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(it);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return order.filter((d) => map.has(d)).map((d) => [d, map.get(d)!] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, deptOrder]);

  const add = () => {
    const parsed = parseItems(text);
    if (!parsed.length) return;
    addStaples(familyId, parsed, byId, overrides);
    setText('');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall staples-sheet" role="dialog" aria-label="המוצרים שלנו" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>המוצרים שלנו</h2>
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small-text">
          {staples.length === 0 ? 'עוד אין כאן מוצרים. אפשר להוסיף למטה, או לסמן מוצר כ"מוצר שלנו" בעריכה שלו.' : 'נגיעה מוסיפה לרשימה, ונגיעה נוספת מסירה.'}
        </p>
        {groups.map(([dept, list]) => (
          <div key={dept} className="staple-dept">
            <h3>{dept}</h3>
            <ul>
              {list.map((it) => {
                const onList = !it.deleted && !it.checked;
                const last = lastPrice(it);
                return (
                  <li key={it.id} className={`row staple-row ${onList ? 'on-list' : ''}`}>
                    <button
                      className="staple-add"
                      aria-label={onList ? `הסרת ${it.name} מהרשימה` : `הוספת ${it.name} לרשימה`}
                      aria-pressed={onList}
                      onClick={() => (onList ? updateItem(familyId, it.id, { deleted: true }) : addStaplesToList(familyId, [it], byId, overrides))}
                    >
                      <span className="staple-mark" aria-hidden="true">{onList ? '✓' : '+'}</span>
                      <span className="name">{it.name}</span>
                      {it.usualQty && <span className="qty">{qtyLabel(it.usualQty)}</span>}
                      {last && <span className="price-tag">{priceLabel(last, true)}</span>}
                    </button>
                    <button className="icon-button edit" aria-label={`עריכת ${it.name}`} onClick={() => onEdit(it)}>
                      <Icon name="edit" size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <form
          className="staple-new"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input value={text} maxLength={120} placeholder="מוצר חדש, למשל: חלב 2" aria-label="מוצר חדש למוצרים שלנו" onChange={(e) => setText(e.target.value)} />
          <button className="small" disabled={!text.trim()}>
            הוספה
          </button>
        </form>
      </div>
    </div>
  );
}
