import { useMemo, useState } from 'react';
import { orderedDepartments } from '../data/departments';
import { addStaples, addStaplesToList, parseItems, qtyLabel, type Item } from '../data/items';
import { formatPrice, type PriceEntry } from '../data/prices';
import { Icon } from './Icon';

/** "המוצרים שלנו": what the family usually buys, by department; a tap puts it on the list. */
export function StaplesSection({
  familyId,
  items,
  byId,
  overrides,
  deptOrder,
  lastPrice,
  onEdit,
}: {
  familyId: string;
  items: Item[];
  byId: Map<string, Item>;
  overrides: Map<string, string>;
  deptOrder: string[] | undefined;
  lastPrice: (it: Item) => PriceEntry | undefined;
  onEdit: (it: Item) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const staples = items.filter((i) => i.staple);
  const others = items.filter((i) => !i.staple);

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
    <section className="dept staples">
      <div className="section-head">
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          המוצרים שלנו ({staples.length}) {open ? '▴' : '▾'}
        </button>
        {open && others.length > 0 && (
          <button className="link" onClick={() => setPicking(true)}>
            בחירה ממה שקניתם
          </button>
        )}
      </div>
      {open && (
        <>
          {staples.length === 0 && <p className="muted small-text">עוד אין כאן מוצרים. אפשר להוסיף למטה, או לבחור מתוך מה שכבר קניתם.</p>}
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
                        disabled={onList}
                        aria-label={onList ? `${it.name} כבר ברשימה` : `הוספת ${it.name} לרשימה`}
                        onClick={() => addStaplesToList(familyId, [it], byId, overrides)}
                      >
                        <span className="staple-mark" aria-hidden="true">{onList ? '✓' : '+'}</span>
                        <span className="name">{it.name}</span>
                        {it.usualQty && <span className="qty">{qtyLabel(it.usualQty)}</span>}
                        {onList && <span className="on-list-tag">ברשימה</span>}
                        {last && <span className="price-tag">{formatPrice(last.price)}</span>}
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
        </>
      )}
      {picking && <StaplePicker familyId={familyId} others={others} byId={byId} overrides={overrides} onClose={() => setPicking(false)} />}
    </section>
  );
}

/** Choose which products bought before go on "המוצרים שלנו". */
function StaplePicker({
  familyId,
  others,
  byId,
  overrides,
  onClose,
}: {
  familyId: string;
  others: Item[];
  byId: Map<string, Item>;
  overrides: Map<string, string>;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const sorted = [...others].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };
  const save = () => {
    const picked = sorted.filter((it) => chosen.has(it.id));
    addStaples(familyId, picked.map((it) => ({ name: it.name, qty: it.qty })), byId, overrides);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="בחירה ממה שקניתם" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">מה אתם קונים בדרך כלל?</h2>
        <p className="muted small-text">אלה מוצרים שכבר היו ברשימה. מה שתסמנו יעבור ל"המוצרים שלנו".</p>
        <ul className="picker-list">
          {sorted.map((it) => (
            <li key={it.id}>
              <label>
                <input type="checkbox" checked={chosen.has(it.id)} onChange={() => toggle(it.id)} />
                <span className="name">{it.name}</span>
                <span className="muted">{it.category}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="sheet-actions">
          <button className="primary" disabled={!chosen.size} onClick={save}>
            הוספה{chosen.size ? ` (${chosen.size})` : ''}
          </button>
          <button onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  );
}

