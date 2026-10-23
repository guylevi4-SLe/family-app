import { useState } from 'react';
import type { Item } from '../data/items';
import { addPrice, defaultUnit, formatPrice, parsePrice, priceKey, type PriceEntry, type PriceUnit } from '../data/prices';
import { UnitPick } from './UnitPick';

/** After shopping: one store for the trip, and an optional price for each item that was bought. */
export function PaidSheet({
  familyId,
  bought,
  byKey,
  stores,
  onClose,
}: {
  familyId: string;
  bought: Item[];
  byKey: Map<string, PriceEntry[]>;
  stores: string[];
  onClose: () => void;
}) {
  const [store, setStore] = useState(stores[0] ?? '');
  const [prices, setPrices] = useState<Record<string, string>>({});
  // Each product starts with the unit it was priced in last time, or per kilo for produce and meat.
  const [units, setUnits] = useState<Record<string, PriceUnit>>(() =>
    Object.fromEntries(bought.map((it) => [it.id, defaultUnit(byKey.get(priceKey(it.name))?.[0], it.category)])),
  );
  const filled = bought.filter((it) => parsePrice(prices[it.id] ?? ''));

  const save = () => {
    for (const it of filled) addPrice(familyId, it.name, parsePrice(prices[it.id])!, store, units[it.id] ?? '');
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="מחירים מהקנייה" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">כמה שילמתם?</h2>
        <p className="muted small-text">אפשר למלא רק חלק. מה שנשאר ריק לא נשמר.</p>
        <label>
          חנות
          <input list="known-stores-trip" placeholder="איפה קניתם?" maxLength={40} value={store} onChange={(e) => setStore(e.target.value)} />
          <datalist id="known-stores-trip">
            {stores.map((st) => <option key={st} value={st} />)}
          </datalist>
        </label>
        <ul className="paid-list">
          {bought.map((it) => {
            const last = byKey.get(priceKey(it.name))?.[0];
            return (
              <li key={it.id}>
                <span className="name">{it.name}</span>
                <input
                  inputMode="decimal"
                  aria-label={`מחיר ${it.name}`}
                  placeholder={last ? formatPrice(last.price) : '₪'}
                  value={prices[it.id] ?? ''}
                  onChange={(e) => setPrices({ ...prices, [it.id]: e.target.value })}
                />
                <UnitPick value={units[it.id] ?? ''} onChange={(u) => setUnits({ ...units, [it.id]: u })} name={it.name} />
              </li>
            );
          })}
        </ul>
        <div className="sheet-actions">
          <button className="primary" disabled={!filled.length} onClick={save}>
            שמירה{filled.length ? ` (${filled.length})` : ''}
          </button>
          <button onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  );
}
