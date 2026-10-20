import {
  Receipt,
  Backpack,
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  CalendarDays,
  Camera,
  CarFront,
  ClipboardList,
  CreditCard,
  Dog,
  Dumbbell,
  FileText,
  Folder,
  Gift,
  GraduationCap,
  Heart,
  House,
  KeyRound,
  Landmark,
  Lightbulb,
  Lock,
  Luggage,
  Music,
  PartyPopper,
  Phone,
  Pill,
  Pin,
  Plane,
  School,
  Shield,
  Shirt,
  ShoppingBag,
  Star,
  Stethoscope,
  StickyNote,
  Tent,
  TreePalm,
  Trophy,
  Utensils,
  Wallet,
  Waves,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/**
 * Line icons for lists, notes and folders (Lucide, ISC licence). They are stored
 * in the item's `emoji` field as "i:<key>"; older items keep an emoji, which is
 * shown as its matching icon. `emoji` is what WhatsApp messages use.
 */
export const LIST_ICONS: { key: string; Icon: LucideIcon; label: string; emoji: string }[] = [
  { key: 'clipboard', Icon: ClipboardList, label: 'רשימה', emoji: '📋' },
  { key: 'note', Icon: StickyNote, label: 'פתק', emoji: '📝' },
  { key: 'dumbbell', Icon: Dumbbell, label: 'כושר', emoji: '🏋️' },
  { key: 'tent', Icon: Tent, label: 'קמפינג', emoji: '🏕️' },
  { key: 'plane', Icon: Plane, label: 'טיסה', emoji: '✈️' },
  { key: 'beach', Icon: TreePalm, label: 'חופשה', emoji: '🏖️' },
  { key: 'sea', Icon: Waves, label: 'ים ובריכה', emoji: '🌊' },
  { key: 'backpack', Icon: Backpack, label: 'תיק', emoji: '🎒' },
  { key: 'luggage', Icon: Luggage, label: 'מזוודה', emoji: '🧳' },
  { key: 'gift', Icon: Gift, label: 'מתנה', emoji: '🎁' },
  { key: 'party', Icon: PartyPopper, label: 'מסיבה', emoji: '🎉' },
  { key: 'home', Icon: House, label: 'בית', emoji: '🏠' },
  { key: 'key', Icon: KeyRound, label: 'מפתח', emoji: '🔑' },
  { key: 'tools', Icon: Wrench, label: 'תיקונים', emoji: '🛠️' },
  { key: 'car', Icon: CarFront, label: 'רכב', emoji: '🚗' },
  { key: 'bike', Icon: Bike, label: 'אופניים', emoji: '🚲' },
  { key: 'shopping', Icon: ShoppingBag, label: 'קניות', emoji: '🛍️' },
  { key: 'food', Icon: Utensils, label: 'אוכל', emoji: '🍽️' },
  { key: 'shirt', Icon: Shirt, label: 'בגדים', emoji: '👕' },
  { key: 'baby', Icon: Baby, label: 'תינוק', emoji: '👶' },
  { key: 'dog', Icon: Dog, label: 'כלב', emoji: '🐶' },
  { key: 'school', Icon: School, label: 'בית ספר', emoji: '🏫' },
  { key: 'grad', Icon: GraduationCap, label: 'לימודים', emoji: '🎓' },
  { key: 'book', Icon: BookOpen, label: 'ספר', emoji: '📖' },
  { key: 'work', Icon: Briefcase, label: 'עבודה', emoji: '💼' },
  { key: 'health', Icon: Stethoscope, label: 'רפואה', emoji: '🏥' },
  { key: 'pill', Icon: Pill, label: 'תרופות', emoji: '💊' },
  { key: 'phone', Icon: Phone, label: 'טלפון', emoji: '📞' },
  { key: 'card', Icon: CreditCard, label: 'אשראי', emoji: '💳' },
  { key: 'wallet', Icon: Wallet, label: 'כסף', emoji: '👛' },
  { key: 'bank', Icon: Landmark, label: 'בנק', emoji: '🏦' },
  { key: 'doc', Icon: FileText, label: 'מסמך', emoji: '📄' },
  { key: 'receipt', Icon: Receipt, label: 'קבלה', emoji: '🧾' },
  { key: 'lock', Icon: Lock, label: 'סודי', emoji: '🔒' },
  { key: 'shield', Icon: Shield, label: 'ביטוח', emoji: '🛡️' },
  { key: 'idea', Icon: Lightbulb, label: 'רעיון', emoji: '💡' },
  { key: 'pin', Icon: Pin, label: 'חשוב', emoji: '📌' },
  { key: 'calendar', Icon: CalendarDays, label: 'תאריכים', emoji: '📅' },
  { key: 'camera', Icon: Camera, label: 'תמונות', emoji: '📷' },
  { key: 'music', Icon: Music, label: 'מוזיקה', emoji: '🎵' },
  { key: 'trophy', Icon: Trophy, label: 'חוג', emoji: '🏆' },
  { key: 'wifi', Icon: Wifi, label: 'אינטרנט', emoji: '📶' },
  { key: 'heart', Icon: Heart, label: 'אהבה', emoji: '❤️' },
  { key: 'star', Icon: Star, label: 'מיוחד', emoji: '⭐' },
  { key: 'folder', Icon: Folder, label: 'תיקייה', emoji: '📁' },
];

const BY_KEY = new Map(LIST_ICONS.map((i) => [i.key, i]));
const BY_EMOJI = new Map(LIST_ICONS.map((i) => [i.emoji, i]));
BY_EMOJI.set('🏋', BY_KEY.get('dumbbell')!);
BY_EMOJI.set('✈', BY_KEY.get('plane')!);
BY_EMOJI.set('🛠', BY_KEY.get('tools')!);

/** The stored value for an icon key. */
export const iconValue = (key: string) => `i:${key}`;

const find = (value: string | undefined) =>
  value?.startsWith('i:') ? BY_KEY.get(value.slice(2)) : value ? BY_EMOJI.get(value) : undefined;

/** The icon's key, when the stored value (or old emoji) has one. */
export const iconKey = (value: string | undefined) => find(value)?.key;

/** An emoji for plain-text places such as WhatsApp messages. */
export const iconEmoji = (value: string | undefined) => find(value)?.emoji ?? value ?? '';

export function ListIcon({ value, size = 24 }: { value: string | undefined; size?: number }) {
  const hit = find(value);
  if (!hit) return <span className="list-icon-emoji">{value}</span>;
  return <hit.Icon className="list-icon" size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** A grid of icons to choose from. */
export function IconPicker({ value, onPick, label = 'סמל' }: { value: string | undefined; onPick: (value: string) => void; label?: string }) {
  const current = iconKey(value);
  return (
    <div className="icon-pick" role="group" aria-label={label}>
      {LIST_ICONS.filter((i) => i.key !== 'folder').map(({ key, Icon, label: name }) => (
        <button
          key={key}
          type="button"
          className={key === current ? 'on' : ''}
          aria-pressed={key === current}
          aria-label={name}
          title={name}
          onClick={() => onPick(iconValue(key))}
        >
          <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
