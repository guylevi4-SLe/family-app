import { describe, expect, it } from 'vitest';
import { foodEmoji } from '../src/data/foodEmoji';

describe('a picture for each product', () => {
  it('finds the product in a longer name', () => {
    expect(foodEmoji('גבינה צהובה עמק קלאסית', 'מוצרי חלב וביצים')).toBe('🧀');
    expect(foodEmoji('פיתות כוסמין', 'לחם ומאפים')).toBe('🫓');
    expect(foodEmoji('ביצים L', 'מוצרי חלב וביצים')).toBe('🥚');
    expect(foodEmoji('חלב 3%', 'מוצרי חלב וביצים')).toBe('🥛');
  });
  it('prefers the longer words', () => {
    expect(foodEmoji('לחמניות', 'לחם ומאפים')).toBe('🍞');
    expect(foodEmoji('שמן זית', 'יבשים ושימורים')).toBe('🫒');
    expect(foodEmoji('נייר טואלט', 'טיפוח, היגיינה ופארם')).toBe('🧻');
  });
  it('takes two-letter words only whole', () => {
    expect(foodEmoji('תה ירוק', 'משקאות')).toBe('🍵');
    expect(foodEmoji('פיתה', 'לחם ומאפים')).toBe('🫓');
  });
  it("falls back to the department's picture", () => {
    expect(foodEmoji('משהו חדש', 'ניקיון')).toBe('🧽');
    expect(foodEmoji('משהו חדש', 'אחר')).toBe('🛒');
  });
});
