/**
 * The לוי'ס mark drawn in the palette's colours (the PNG icons stay for the
 * installed app icon, which a web page cannot recolour).
 */
/**
 * "לוי'ס" stored in drawing order (left to right) and drawn with the bidi
 * algorithm switched off, so it reads the same whatever the surrounding text's
 * direction (Safari reversed it next to an English family name).
 */
export const LOGO_TEXT = "ס'יול";

export const LOGO_PATH = 'M96 30 L168 62 V138 H72 L50 162 V138 H24 V62 Z';

export function BrandLogo({ className, size }: { className?: string; size: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 192 192" aria-hidden="true">
      <rect className="logo-bg" width="192" height="192" rx="42" />
      <path className="logo-bubble" d={LOGO_PATH} strokeLinejoin="round" />
      <text className="logo-text" x="96" y="117" textAnchor="middle" direction="ltr" unicodeBidi="bidi-override" fontSize="50" fontWeight="800" fontFamily="Heebo, Arial, sans-serif">
        {LOGO_TEXT}
      </text>
    </svg>
  );
}
