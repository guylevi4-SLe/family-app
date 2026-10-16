import { describe, expect, it } from 'vitest';
import { formatPrice, parsePrice, priceKey, pricesByKey, similarKinds, type PriceEntry } from '../src/data/priceUtils';

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
});
