import { describe, expect, it } from 'vitest';
import { EMOJI_CHOICES, foodEmoji } from '../src/data/foodEmoji';
import { DRAWN } from '../src/data/foodIcons';

describe('a picture for each product', () => {
  it('finds the product in a longer name', () => {
    expect(foodEmoji('גבינה צהובה עמק קלאסית', 'מוצרי חלב וביצים')).toBe('🧀');
    expect(foodEmoji('פיתות כוסמין', 'לחם ומאפים')).toBe('svg:pita');
    expect(foodEmoji('במבה 80 גרם', 'חטיפים ומתוקים')).toBe('svg:bamba');
    expect(foodEmoji('גבינה בולגרית 5%', 'מוצרי חלב וביצים')).toBe('svg:feta');
    expect(foodEmoji('שמנת מתוקה 32%', 'מוצרי חלב וביצים')).toBe('svg:cream');
    expect(foodEmoji('ביצים L', 'מוצרי חלב וביצים')).toBe('🥚');
    expect(foodEmoji('חלב 3%', 'מוצרי חלב וביצים')).toBe('svg:milk');
    expect(foodEmoji('נקניק סלמי', 'מעדנייה')).toBe('svg:salami');
    expect(foodEmoji('נקניקיות עוף', 'בשר עוף ודגים')).toBe('🌭');
    expect(foodEmoji('שמן קנולה', 'יבשים ושימורים')).toBe('svg:oil');
  });
  it('prefers the longer words', () => {
    expect(foodEmoji('לחמניות', 'לחם ומאפים')).toBe('🍞');
    expect(foodEmoji('שמן זית', 'יבשים ושימורים')).toBe('🫒');
    expect(foodEmoji('נייר טואלט', 'טיפוח, היגיינה ופארם')).toBe('🧻');
  });
  it('takes two-letter words only whole', () => {
    expect(foodEmoji('תה ירוק', 'משקאות')).toBe('🍵');
    expect(foodEmoji('פיתה', 'לחם ומאפים')).toBe('svg:pita');
  });
  it('has a drawing for every drawn picture in the dictionary', () => {
    for (const p of EMOJI_CHOICES) if (p.startsWith('svg:')) expect(DRAWN[p]?.svg).toMatch(/^<svg /);
  });
  it("falls back to the department's picture", () => {
    expect(foodEmoji('משהו חדש', 'ניקיון')).toBe('🧽');
    expect(foodEmoji('משהו חדש', 'אחר')).toBe('🛒');
  });
});
