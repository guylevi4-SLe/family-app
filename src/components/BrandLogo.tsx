/**
 * The לוי'ס mark drawn in the palette's colours (the PNG icons stay for the
 * installed app icon, which a web page cannot recolour).
 */
export const LOGO_PATH = 'M96 30 L168 62 V138 H72 L50 162 V138 H24 V62 Z';

export function BrandLogo({ className, size }: { className?: string; size: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 192 192" aria-hidden="true">
      <rect className="logo-bg" width="192" height="192" rx="42" />
      <path className="logo-bubble" d={LOGO_PATH} strokeLinejoin="round" />
      <text className="logo-text" x="96" y="117" textAnchor="middle" direction="rtl" unicodeBidi="isolate" fontSize="50" fontWeight="800" fontFamily="Heebo, Arial, sans-serif">
        לוי'ס
      </text>
    </svg>
  );
}
