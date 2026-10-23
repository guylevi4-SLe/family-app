import { useMemo, useState } from 'react';
import { orderedDepartments } from '../data/departments';
import { addStaples, addStaplesToList, parseItems, qtyLabel, updateItem, type Item } from '../data/items';
import { priceLabel, type PriceEntry } from '../data/prices';
import { Icon } from './Icon';
import { Apple, Baby, Bath, Beef, Candy, Croissant, CupSoda, House, Milk, Package, Salad, Shapes, ShoppingBasket, Snowflake, SprayCan, Wheat, type LucideIcon } from 'lucide-react';

/** A picture for each department's square in the pantry; a family's own department gets the generic one. */
const DEPT_ICONS: Record<string, LucideIcon> = {
  'פירות וירקות': Apple,
  'מוצרי חלב וביצים': Milk,
  'לחם ומאפים': Croissant,
  'בשר עוף ודגים': Beef,
  'מעדנייה': Salad,
  'יבשים ושימורים': Package,
  'תבלינים ואפייה': Wheat,
  'חטיפים ומתוקים': Candy,
  'משקאות': CupSoda,
  'קפואים': Snowflake,
  'ניקיון': SprayCan,
  'טיפוח, היגיינה ופארם': Bath,
  'תינוקות': Baby,
  'בית וחד״פ': House,
};

/** "מזווה": a small button above the list that opens the family's usual products. */
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
  return (
    <>
      <button className="small staples-button" onClick={() => setOpen(true)}>
        <ShoppingBasket size={16} aria-hidden="true" />
        מזווה
      </button>
      {open && <StaplesSheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

/** What the family usually buys: a square per department, and a department's products a tap away; a tap on one puts it on the list. */
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
  const [dept, setDept] = useState<string | null>(null);
  const staples = items.filter((i) => i.staple);

  const groups = useMemo(() => {
    const order = orderedDepartments(deptOrder);
    const map = new Map<string, Item[]>();
    for (const it of staples) {
      const d = order.includes(it.category) ? it.category : order[order.length - 1];
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(it);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return order.filter((d) => map.has(d)).map((d) => [d, map.get(d)!] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, deptOrder]);

  // A department emptied while open (its last product moved or removed) goes back to the squares.
  const shown = groups.find(([d]) => d === dept);

  const add = () => {
    const parsed = parseItems(text);
    if (!parsed.length) return;
    addStaples(familyId, parsed, byId, overrides);
    setText('');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall staples-sheet" role="dialog" aria-label="מזווה" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          {shown ? (
            <button className="link-plain staples-back" onClick={() => setDept(null)}>
              → מזווה
            </button>
          ) : (
            <h2>מזווה</h2>
          )}
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {staples.length === 0 && <p className="muted small-text">עוד אין כאן מוצרים. אפשר להוסיף למטה, או לסמן מוצר כ"מוצר שלנו" בעריכה שלו.</p>}
        {!shown && groups.length > 0 && (
          <div className="dept-grid">
            {groups.map(([d]) => {
              const DeptIcon = DEPT_ICONS[d] ?? Shapes;
              return (
                <button key={d} className="dept-tile" onClick={() => setDept(d)}>
                  <DeptIcon size={34} strokeWidth={1.6} aria-hidden="true" />
                  <span>{d}</span>
                </button>
              );
            })}
          </div>
        )}
        {shown && (
          <div className="staple-dept">
            <h3>{shown[0]}</h3>
            <p className="muted small-text">נגיעה מוסיפה לרשימה, ונגיעה נוספת מסירה.</p>
            <ul>
              {shown[1].map((it) => {
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
        )}
        <form
          className="staple-new"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input value={text} maxLength={120} placeholder="מוצר חדש, למשל: חלב 2" aria-label="מוצר חדש למזווה" onChange={(e) => setText(e.target.value)} />
          <button className="small" disabled={!text.trim()}>
            הוספה
          </button>
        </form>
      </div>
    </div>
  );
}
