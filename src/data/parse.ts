import { isKnownProduct, normalize } from './departments';

export interface ParsedItem {
  name: string;
  qty: string;
}

// Quantities can be written in digits or words, before or after the product:
// "קילו בשר טחון", "חצי קילו עגבניות", "שתי חבילות במבה", "חלב 2", "ביצים x12".
const AMOUNT_WORDS = [
  'חצי', 'רבע', 'אחד', 'אחת', 'שני', 'שתי', 'שניים', 'שתיים', 'שלושה', 'שלוש', 'ארבעה', 'ארבע',
  'חמישה', 'חמש', 'שישה', 'שש', 'שבעה', 'שבע', 'שמונה', 'תשעה', 'תשע', 'עשרה', 'עשר', 'תריסר', 'זוג',
];
const UNITS = [
  'קילו', 'ק"ג', 'קג', "ק'ג", 'קילוגרם', 'גרם', 'גר', "גר'", 'ליטר', 'ליטרים', "ל'", 'מ"ל', 'מל',
  'יחידות', 'יחידה', "יח'", 'יח', 'חבילה', 'חבילות', 'בקבוק', 'בקבוקים', 'קופסה', 'קופסא', 'קופסאות',
  'שקית', 'שקיות', 'מגש', 'מגשים', 'פחית', 'פחיות', 'צרור', 'צרורות', 'קרטון', 'קרטונים', 'שישייה',
  'גביע', 'גביעים', 'כיכר', 'כיכרות', 'מארז', 'מארזים',
];
const FRACTION = new Set(['וחצי', 'ורבע']);
const isNumber = (t: string) => /^(?:[x×X]?\d+(?:[.,]\d+)?|\d+\/\d+)$/.test(t);
const isAmount = (t: string) => isNumber(t) || AMOUNT_WORDS.includes(t);
const isUnit = (t: string) => UNITS.includes(t.replace(/[״”]/g, '"').replace(/[׳`]/g, "'"));

/** Length of a quantity phrase at the start of `tokens` (0 if none). */
function quantityLength(tokens: string[]): number {
  let i = 0;
  if (i < tokens.length && isAmount(tokens[i])) i++;
  if (i < tokens.length && isUnit(tokens[i])) {
    i++;
    if (i < tokens.length && FRACTION.has(tokens[i])) i++;
    if (i < tokens.length && tokens[i] === 'של') i++;
  }
  return i;
}

function splitQuantity(part: string): ParsedItem {
  // "חלב 3%" and known multi-word products ("שקיות זבל") are names, not quantities.
  if (/%$/.test(part) || isKnownProduct(part)) return { name: part, qty: '' };
  const tokens = part.split(/\s+/);
  const lead = quantityLength(tokens);
  if (lead > 0 && lead < tokens.length) {
    const qty = tokens.slice(0, lead).filter((t) => t !== 'של').join(' ');
    return { name: tokens.slice(lead).join(' '), qty: qty.replace(/^[x×X]/, '') };
  }
  // Trailing: try the longest quantity phrase that ends the text.
  for (let start = Math.max(1, tokens.length - 4); start < tokens.length; start++) {
    const tail = tokens.slice(start);
    if (quantityLength(tail) === tail.length) {
      return { name: tokens.slice(0, start).join(' '), qty: tail.join(' ').replace(/^[x×X]/, '') };
    }
  }
  // Number glued to the end: "חלב2", "ביצים x12".
  const glued = part.match(/^(.*?\D)\s*[x×X]?(\d+(?:[.,]\d+)?)$/);
  if (glued && glued[1].trim()) return { name: glued[1].trim(), qty: glued[2] };
  // Number glued to the start: "2זירו". Known names like "7אפ" stay whole.
  const front = part.match(/^(\d+)([א-ת].*)$/);
  if (front && !isKnownProduct(tokens[0])) return { name: front[2], qty: front[1] };
  return { name: part, qty: '' };
}

/**
 * Splits free text into products. Accepts one per line or comma-separated,
 * with an optional quantity before or after the name.
 */
export function parseItems(text: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,،;]+/)) {
    const part = raw.replace(/^[\s\-•*·]+/, '').replace(/\s+/g, ' ').trim();
    if (!part) continue;
    const { name, qty } = splitQuantity(part);
    const norm = normalize(name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ name: name.slice(0, 80), qty: qty.slice(0, 30) });
  }
  return out;
}

