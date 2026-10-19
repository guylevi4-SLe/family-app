import { AtSign, Bell, Calendar, Camera, CircleHelp, ClipboardList, ListChecks, ShoppingCart, SquareCheck, Trash2, type LucideIcon } from 'lucide-react';

// Saved chat lines start with an emoji (it also reads well in WhatsApp and notifications);
// in the app it is drawn as a line icon instead.
const LEADS: [string, LucideIcon][] = [
  ['🛒', ShoppingCart],
  ['🗑', Trash2],
  ['☑', SquareCheck],
  ['✅', ListChecks],
  ['📅', Calendar],
  ['📋', ClipboardList],
  ['❓', CircleHelp],
  ['📷', Camera],
  ['🔔', Bell],
  ['🏷', AtSign],
];

export function leadIcon(text: string): { Icon: LucideIcon; rest: string } | null {
  for (const [emoji, Icon] of LEADS) {
    if (text.startsWith(emoji)) return { Icon, rest: text.slice(emoji.length).replace(/^️/, '').trimStart() };
  }
  return null;
}

/** A small inline line icon in the accent colour. */
export function InlineIcon({ icon: I, size = 16 }: { icon: LucideIcon; size?: number }) {
  return (
    <span className="lead-icon" aria-hidden="true">
      <I size={size} strokeWidth={2} />
    </span>
  );
}
