import { describe, expect, it } from 'vitest';
import { cheapestByUnit, defaultUnit, estimateTotal, formatPrice, parsePrice, priceKey, priceLabel, pricesByKey, similarKinds, weightKg, type PriceEntry } from '../src/data/priceUtils';

const at = (ms: number) => ({ toMillis: () => ms }) as PriceEntry['at'];
const e = (name: string, price: number, ms: number, store = ''): PriceEntry => ({ id: `${name}${ms}`, key: priceKey(name), name, price, store, at: at(ms), by: 'dad' });

describe('prices', () => {
  it('matches products by name, forgiving geresh and spacing', () => {
    expect(priceKey("קוטג'  3%")).toBe(priceKey('קוטג 3%'));
    expect(priceKey('קוטג׳')).toBe(priceKey('קוטג'));
    expect(priceKey("קוטג' 3%")).not.toBe(priceKey("קוטג' 9%"));
  });
  it('reads typed prices', () => {
    expect(parsePrice('6,90')).toBe(6.9);
    expect(parsePrice('₪ 7')).toBe(7);
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('0')).toBeNull();
    expect(formatPrice(6.9)).toBe('₪6.90');
    expect(formatPrice(7)).toBe('₪7');
  });
  it('finds kinds bought before, with their latest price, but not other products', () => {
    const byKey = pricesByKey([e("קוטג' 3%", 5.5, 1), e("קוטג' 3%", 5.9, 2), e("קוטג' טרה", 5.4, 3), e('קוטג', 6, 4), e('קוטגים', 9, 5), e('גבינה לבנה', 7, 6)]);
    expect(byKey.get(priceKey("קוטג' 3%"))![0].price).toBe(5.9);
    const kinds = similarKinds("קוטג'", byKey).map((k) => k.name).sort();
    expect(kinds).toEqual(["קוטג' 3%", "קוטג' טרה"]);
  });
  it('reads weights from quantities, and nothing else', () => {
    expect(weightKg('1.5 ק"ג')).toBe(1.5);
    expect(weightKg('2 ק״ג')).toBe(2);
    expect(weightKg('1,5 קילו')).toBe(1.5);
    expect(weightKg('2קילו')).toBe(2);
    expect(weightKg('קילו')).toBe(1);
    expect(weightKg('חצי קילו')).toBe(0.5);
    expect(weightKg('קילו וחצי')).toBe(1.5);
    expect(weightKg('2 קילו וחצי')).toBe(2.5);
    expect(weightKg('1 וחצי קילו')).toBe(1.5);
    expect(weightKg('500 גרם')).toBe(0.5);
    expect(weightKg('שני קילו')).toBe(2);
    expect(weightKg('2')).toBeNull();
    expect(weightKg('')).toBeNull();
    expect(weightKg('2 חבילות')).toBeNull();
    expect(weightKg('1 ליטר')).toBeNull();
    expect(weightKg('גרם')).toBeNull();
  });
  it('prices per kilo: label, estimate, start unit and cheapest only within one unit', () => {
    const kg = { ...e('עוף', 39.9, 2), unit: 'kg' as const };
    expect(priceLabel(kg)).toBe('₪39.90 לק״ג');
    expect(priceLabel(kg, true)).toBe('₪39.90/ק״ג');
    expect(priceLabel(e('חלב', 6.9, 1))).toBe('₪6.90');
    expect(estimateTotal('1.5 ק"ג', kg)).toBe(60);
    expect(estimateTotal('2', kg)).toBeNull();
    expect(estimateTotal('1 ק"ג', e('עוף', 30, 1))).toBeNull();
    expect(defaultUnit(undefined, 'בשר עוף ודגים')).toBe('kg');
    expect(defaultUnit(undefined, 'פירות וירקות')).toBe('kg');
    expect(defaultUnit(undefined, 'מוצרי חלב וביצים')).toBe('');
    expect(defaultUnit(e('עגבניות', 12, 1), 'פירות וירקות')).toBe('');
    expect(defaultUnit({ ...e('חזה', 40, 1), unit: 'kg' }, 'אחר')).toBe('kg');
    const tray = e('עוף', 25, 3);
    const kg2 = { ...e('עוף', 34.9, 4), unit: 'kg' as const };
    const cheap = cheapestByUnit([tray, kg, kg2]);
    expect(cheap(kg2)).toBe(true);
    expect(cheap(kg)).toBe(false);
    expect(cheap(tray)).toBe(false);
  });
});
