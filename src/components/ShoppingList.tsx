import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { guessDepartment, normalize, orderedDepartments } from '../data/departments';
import { splitBought } from '../data/bought';
import { addItems, addStaplesToList, clearChecked, parseItems, updateItem, byUrgency, qtyLabel, type Item, type Urgency } from '../data/items';
import { useOverrides, usePrices } from '../data/hooks';
import { onList, preferStaples, suggestStaples } from '../data/stapleMatch';
import { ago, cheapestByUnit, knownStores, priceKey, priceLabel, pricesByKey, type PriceEntry } from '../data/prices';
import { foodEmoji } from '../data/foodEmoji';
import { FoodIcon } from './FoodIcon';
import { ItemSheet } from './ItemSheet';
import { PaidSheet } from './PaidSheet';
import { DEPT_ICONS, StaplesSheet } from './Staples';
import { CommentButton } from './CommentButton';
import { useFamily } from './FamilyContext';
import { ZoomViewer } from './ZoomViewer';
import { Icon } from './Icon';
import { confirmAsk } from './ConfirmSheet';
import { Eraser, LayoutGrid, List, ListChecks, PackageCheck, Receipt, Shapes, ShoppingBasket } from 'lucide-react';

/** The shopping screen: four squares, each opening one part. */
export type ShopPage = 'menu' | 'list' | 'staples' | 'bought' | 'paid';

export function ShoppingList({
  familyId,
  familyName,
  items,
  deptOrder,
  page,
  setPage,
}: {
  familyId: string;
  familyName: string | undefined;
  items: Item[] | undefined;
  deptOrder: string[] | undefined;
  page: ShopPage;
  setPage: (p: ShopPage) => void;
}) {
  const overrides = useOverrides(familyId);
  const priceRows = usePrices(familyId);
  const byKey = useMemo(() => pricesByKey(priceRows), [priceRows]);
  const stores = useMemo(() => knownStores(priceRows), [priceRows]);
  const lastPrice = (it: Item) => byKey.get(priceKey(it.name))?.[0];
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ item: Item; staple: boolean } | null>(null);
  const [undo, setUndo] = useState<{ item: Item; deleted: boolean; timer: number } | null>(null);
  // A short line at the bottom, e.g. that a staple is already on the list.
  const [notice, setNotice] = useState<{ text: string; timer: number } | null>(null);
  const [paying, setPaying] = useState(false);
  // At the store: the list as department squares, one department at a time. Each visit starts on the full list.
  const [byDept, setByDept] = useState(false);
  const [openDept, setOpenDept] = useState<string | null>(null);
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
  // A department whose last product was bought leaves the squares, and back to them if it was the one open.
  const shownDept = byDept ? groups.find(([d]) => d === openDept) : undefined;

  const submit = () => {
    const parsed = parseItems(text);
    if (!parsed.length) return;
    // A product on "רשימת הקבועים" is always added as that staple, not as a new item.
    const wanted = preferStaples(parsed, byId.values());
    // A staple already on the list, typed without a new quantity, is left as is and said so.
    const there = wanted.filter((p) => p.id && !p.qty && byId.get(p.id) && onList(byId.get(p.id)!));
    const fresh = wanted.filter((p) => !there.includes(p));
    if (fresh.length) addItems(familyId, fresh, byId, overrides);
    if (there.length) say(`${there.map((p) => p.name).join(', ')} כבר ברשימה`);
    setText('');
    inputRef.current?.focus();
  };

  const say = (line: string) => {
    if (notice) clearTimeout(notice.timer);
    setNotice({ text: line, timer: window.setTimeout(() => setNotice(null), 3000) });
  };

  // Staples matching the product being typed (the last one, after any commas), one tap away.
  const typing = text.split(/[\n,،;]/).pop() ?? '';
  const typed = parseItems(typing)[0];
  const found = typed ? suggestStaples(typed.name, byId.values(), 4) : [];
  // Two to a row; the best two on the row next to the field, the rest above. One alone on its row gets the whole width.
  const suggestions = found.length > 2 ? [...found.slice(2), ...found.slice(0, 2)] : found;
  const alone = (i: number) => i === 0 && found.length % 2 === 1;
  // Where it sits, for the dividers: second on its row, or on the lower row under another.
  const place = (i: number) => {
    const lower = found.length > 2 && i >= suggestions.length - 2;
    const second = !alone(i) && (suggestions.length - i) % 2 === 1;
    return [alone(i) && 'alone', second && 'second', lower && 'lower'];
  };
  const pickStaple = (s: Item) => {
    if (onList(s) && !typed?.qty) say(`${s.name} כבר ברשימה`);
    else addItems(familyId, [{ id: s.id, name: s.name, qty: typed?.qty || s.usualQty || '' }], byId, overrides);
    const rest = text.slice(0, text.length - typing.length);
    setText(/^[\s,،;]*$/.test(rest) ? '' : rest);
    inputRef.current?.focus();
  };

  const offerUndo = (item: Item, deleted: boolean) => {
    if (undo) clearTimeout(undo.timer);
    const timer = window.setTimeout(() => setUndo(null), deleted ? 4000 : 3000);
    setUndo({ item, deleted, timer });
  };

  const toggle = (it: Item) => {
    updateItem(familyId, it.id, { checked: !it.checked });
    if (!it.checked) offerUndo(it, false);
  };

  const staples = (items ?? []).filter((i) => i.staple);
  const back = <button className="link-plain dept-back" onClick={() => setPage('menu')}>→ קניות</button>;

  return (
    <main className={`list-page shopping${page === 'list' ? ' with-bottom-add' : ''}`}>
      {(page === 'menu' || page === 'staples') && items !== undefined && (
        <div className="dept-grid shop-menu">
          <ShopTile icon={<ListChecks />} label="רשימת הקניות" count={active.length} onClick={() => setPage('list')} />
          <ShopTile icon={<ShoppingBasket />} label="הקבועים שלנו" count={staples.length} onClick={() => setPage('staples')} />
          <ShopTile icon={<PackageCheck />} label="נקנו בשבוע האחרון" count={bought.length} onClick={() => setPage('bought')} />
          <ShopTile icon={<Receipt />} label="כמה שילמתי" count={byKey.size} onClick={() => setPage('paid')} />
        </div>
      )}
      {page === 'menu' && items !== undefined && (
        <QuickAdd
          staples={staples}
          deptOrder={deptOrder}
          onTap={(it) => {
            if (onList(it)) {
              updateItem(familyId, it.id, { deleted: true });
              say(`${it.name} הוסר מהרשימה`);
            } else {
              addStaplesToList(familyId, [it], byId, overrides);
              say(`${it.name} נוסף לרשימה`);
            }
          }}
          onEdit={(it) => setEditing({ item: it, staple: true })}
        />
      )}

      {page === 'list' && (
        <>
      {/* An open department has its own way back, to all the departments. */}
      {!shownDept && back}
      {active.length > 0 && (
        <div className="list-actions">
          <button
            className="small view-toggle"
            aria-label={byDept ? 'תצוגת רשימה' : 'תצוגת מחלקות'}
            aria-pressed={byDept}
            onClick={() => {
              setByDept(!byDept);
              setOpenDept(null);
            }}
          >
            {byDept ? <List size={18} aria-hidden="true" /> : <LayoutGrid size={18} aria-hidden="true" />}
          </button>
          <button className="small whatsapp" onClick={() => shareToWhatsApp(groups)}>
            <Icon name="whatsapp" size={16} />
            שליחה בוואטסאפ
          </button>
        </div>
      )}

      {items === undefined ? null : active.length === 0 ? (
        <p className="empty">הרשימה ריקה. מה חסר בבית?</p>
      ) : byDept && !shownDept ? (
        <>
        <h2 className="store-depts-title">רשימה לפי מחלקות</h2>
        <div className="dept-grid store-depts">
          {groups.map(([d]) => {
            const DeptIcon = DEPT_ICONS[d] ?? Shapes;
            return (
              <button key={d} className="dept-tile" onClick={() => setOpenDept(d)}>
                <DeptIcon size={34} strokeWidth={1.6} aria-hidden="true" />
                <span>{d}</span>
              </button>
            );
          })}
        </div>
        </>
      ) : (
        (shownDept ? [shownDept] : groups).map(([dept, list]) => (
          <section key={dept} className="dept">
            {shownDept && (
              <button className="link-plain dept-back" onClick={() => setOpenDept(null)}>
                → כל המחלקות
              </button>
            )}
            <h2>{dept}</h2>
            <ul>
              {list.map((it) => (
                <ItemRow key={it.id} item={it} last={lastPrice(it)} onToggle={() => toggle(it)} onEdit={() => setEditing({ item: it, staple: false })} onUrgency={(urgency) => updateItem(familyId, it.id, { urgency })} />
              ))}
            </ul>
          </section>
        ))
      )}

        </>
      )}

      {page === 'bought' && items !== undefined && (
        <section className="dept bought">
          {back}
          <div className="section-head">
            <h2 className="shop-title">נקנו בשבוע האחרון</h2>
            {bought.length > 0 && (
              <button
                className="link"
                onClick={async () => {
                  const n = bought.length;
                  if (await confirmAsk(n === 1 ? 'לנקות את הפריט שנקנה?' : `לנקות ${n} פריטים שנקנו?`, n === 1 ? 'הוא יוסר מהרשימה. אם הוא ברשימת הקבועים, הוא יישאר שם.' : 'הם יוסרו מהרשימה. מה שברשימת הקבועים יישאר שם.', 'כן, לנקות', <Eraser size={22} />)) clearChecked(familyId, bought);
                }}
              >
                ניקוי
              </button>
            )}
          </div>
          {bought.length === 0 ? (
            <p className="empty">לא נקנה כלום בשבוע האחרון.</p>
          ) : (
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

      {page === 'paid' && (
        <section className="dept paid-page">
          {back}
          <div className="section-head">
            <h2 className="shop-title">כמה שילמתי</h2>
          </div>
          <PaidHistory byKey={byKey} items={items ?? []} overrides={overrides} deptOrder={deptOrder} />
        </section>
      )}

      {page === 'staples' && items !== undefined && (
        <StaplesSheet
          familyId={familyId}
          familyName={familyName}
          items={items}
          byId={byId}
          overrides={overrides}
          deptOrder={deptOrder}
          lastPrice={lastPrice}
          onEdit={(it) => setEditing({ item: it, staple: true })}
          onClose={() => setPage('menu')}
        />
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

      {notice && !undo && (
        <div className="toast" role="status">
          {notice.text}
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
      {page === 'list' && (
      <form
        className="add-box bottom-add"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {suggestions.length > 0 && (
          <div className="staple-suggestions" aria-label="מרשימת הקבועים">
            {suggestions.map((s, i) => (
              // preventDefault keeps the keyboard open while tapping.
              <button
                key={s.id}
                type="button"
                className={[onList(s) && 'listed', ...place(i)].filter(Boolean).join(' ')}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pickStaple(s)}
              >
                <span className="sugg-name">
                  {onList(s) && <span aria-label="כבר ברשימה">✓ </span>}
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        )}
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
      )}
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

/**
 * Under the squares: a round button for each staple marked "הוספה מהירה". A tap
 * puts it on the list (a ✓ shows it's there) and another tap takes it off; a
 * long press opens it for editing (its short name and picture).
 */
function QuickAdd({ staples, deptOrder, onTap, onEdit }: { staples: Item[]; deptOrder: string[] | undefined; onTap: (it: Item) => void; onEdit: (it: Item) => void }) {
  const photos = useFamily().itemPhotos;
  const press = useRef<{ timer: number; long: boolean } | null>(null);
  const order = orderedDepartments(deptOrder);
  const quick = staples
    .filter((s) => s.quick)
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || (a.quickLabel || a.name).localeCompare(b.quickLabel || b.name, 'he'));
  return (
    <section className="quick-add">
      <h2>הוספה מהירה לרשימה</h2>
      {quick.length === 0 ? (
        <p className="muted small-text">כאן יופיעו מוצרים להוספה בלחיצה אחת. בוחרים אותם ב"הקבועים שלנו": עריכת מוצר, "הוספה מהירה ממסך הקניות".</p>
      ) : (
        <div className="quick-grid">
          {quick.map((it) => {
            const on = onList(it);
            const photo = photos.get(it.id);
            return (
              <button
                key={it.id}
                className={`quick-btn${on ? ' on' : ''}`}
                aria-pressed={on}
                aria-label={on ? `הסרת ${it.name} מהרשימה` : `הוספת ${it.name} לרשימה`}
                onPointerDown={() => {
                  const p = { long: false, timer: 0 };
                  p.timer = window.setTimeout(() => {
                    p.long = true;
                    onEdit(it);
                  }, 550);
                  press.current = p;
                }}
                onPointerUp={() => press.current && clearTimeout(press.current.timer)}
                onPointerLeave={() => press.current && clearTimeout(press.current.timer)}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (press.current?.long) return;
                  onTap(it);
                }}
              >
                <span className={`quick-emoji${photo ? ' photo' : ''}`}>
                  {photo ? <img src={photo} alt="" /> : <FoodIcon value={it.quickEmoji || foodEmoji(it.name, it.category)} />}
                  {on && <span className="quick-on" aria-hidden="true">✓</span>}
                </span>
                <span className="quick-name">{it.quickLabel || it.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** One of the shopping screen's four squares, with how many are in it. */
function ShopTile({ icon, label, count, onClick }: { icon: ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button className="dept-tile shop-tile" onClick={onClick}>
      {icon}
      <span>{label}</span>
      <span className="shop-count">{count}</span>
    </button>
  );
}

/** Every product the family wrote a price for, by department: the last price, and the ones before it a tap away. */
function PaidHistory({ byKey, items, overrides, deptOrder }: { byKey: Map<string, PriceEntry[]>; items: Item[]; overrides: Map<string, string>; deptOrder: string[] | undefined }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    // A product's department is the one its row on the list has (moved by hand, too), else the usual guess by name.
    const deptOf = new Map(items.map((it) => [priceKey(it.name), it.category]));
    const order = orderedDepartments(deptOrder);
    const map = new Map<string, [string, PriceEntry[]][]>();
    for (const [key, history] of byKey) {
      const guess = deptOf.get(key) ?? guessDepartment(normalize(history[0].name), overrides);
      const dept = order.includes(guess) ? guess : order[order.length - 1];
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push([key, history]);
    }
    return order.filter((d) => map.has(d)).map((d) => [d, map.get(d)!] as const);
  }, [byKey, items, overrides, deptOrder]);
  if (!byKey.size) return <p className="empty">עוד לא נרשמו מחירים. אפשר לרשום אותם ב"נקנו בשבוע האחרון".</p>;
  return (
    <>
      {groups.map(([dept, products]) => (
        <section key={dept} className="paid-dept">
          <h2>{dept}</h2>
          <ul className="paid-history">
            {products.map(([key, history]) => {
              const last = history[0];
              const isCheapest = cheapestByUnit(history);
              const shown = open === key;
              return (
                <li key={key}>
                  <button className="paid-row" aria-expanded={history.length > 1 ? shown : undefined} disabled={history.length < 2} onClick={() => setOpen(shown ? null : key)}>
                    <span className="paid-main">
                      <span className="name">{last.name}</span>
                      <span className="muted">
                        {last.store ? `${last.store} · ` : ''}
                        {ago(last)}
                      </span>
                    </span>
                    <strong>{priceLabel(last)}</strong>
                    {history.length > 1 && <span className="paid-more">{shown ? '▴' : `${history.length} ▾`}</span>}
                  </button>
                  {shown && (
                    <ul className="price-history" aria-label={`היסטוריית מחירים ${last.name}`}>
                      {history.map((h) => (
                        <li key={h.id} className={isCheapest(h) ? 'cheapest' : ''}>
                          <strong>{priceLabel(h)}</strong>
                          <span>{h.store || 'בלי חנות'}</span>
                          <span className="muted">{ago(h)}</span>
                          {isCheapest(h) && <span className="cheap-mark">הכי זול</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
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
