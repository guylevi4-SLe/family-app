import { LOGO_PATH, LOGO_TEXT } from './components/BrandLogo';
// Colour palettes. The choice is per device and is applied before the first render.
export const PALETTES = [
  { id: 'goldlight', label: 'לבן וזהב', swatch: 'linear-gradient(135deg, #fff 50%, #c99700 50%)', bar: '#f5f3ee' },
  { id: 'gold', label: 'שחור וזהב', swatch: '#f5c518', bar: '#090909' },
  { id: 'orange', label: 'כתום ולבן', swatch: 'linear-gradient(135deg, #fff 50%, #d97757 50%)', bar: '#faf9f5' },
  { id: 'pink', label: 'ורוד ולבן', swatch: 'linear-gradient(135deg, #fff 50%, #be185d 50%)', bar: '#fdf7fa' },
  { id: 'green', label: 'ירוק (הקלאסי)', swatch: '#2f6f4f', bar: '' },
] as const;

export type Palette = (typeof PALETTES)[number]['id'];

const KEY = 'palette';

export function readPalette(): Palette {
  try {
    const v = localStorage.getItem(KEY);
    if (PALETTES.some((p) => p.id === v)) return v as Palette;
  } catch {
    /* storage may be blocked */
  }
  return 'pink';
}

export function applyPalette(id: Palette, save = false) {
  document.documentElement.dataset.palette = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const bar = PALETTES.find((p) => p.id === id)!.bar || (dark ? '#131715' : '#f6f7f4');
  meta?.setAttribute('content', bar);
  paintFavicon();
  if (save) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* per-device choice is optional */
    }
  }
}

// The browser-tab icon follows the palette too.
function paintFavicon() {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const ink = css.getPropertyValue('--accent-ink').trim();
  const bg = css.getPropertyValue('--surface-2').trim();
  if (!accent) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="${bg}"/><path d="${LOGO_PATH}" fill="${accent}" stroke="${accent}" stroke-width="6" stroke-linejoin="round"/><text x="96" y="117" text-anchor="middle" font-size="50" font-weight="800" font-family="Heebo, Arial, sans-serif" fill="${ink}" direction="ltr" unicode-bidi="bidi-override">${LOGO_TEXT}</text></svg>`;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    link.type = 'image/svg+xml';
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  paintTouchIcon(bg, accent, ink);
}

// The home-screen icon too: the iPhone takes it (as a PNG) when the app is added to the home screen.
function paintTouchIcon(bg: string, accent: string, ink: string) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!link) return;
  const draw = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = bg;
    g.fillRect(0, 0, 180, 180);
    g.scale(180 / 192, 180 / 192);
    const bubble = new Path2D(LOGO_PATH);
    g.fillStyle = accent;
    g.strokeStyle = accent;
    g.lineWidth = 6;
    g.lineJoin = 'round';
    g.fill(bubble);
    g.stroke(bubble);
    g.fillStyle = ink;
    g.font = '800 50px Heebo, Arial, sans-serif';
    g.textAlign = 'center';
    g.direction = 'rtl';
    g.fillText("לוי'ס", 96, 117);
    link.href = c.toDataURL('image/png');
  };
  document.fonts?.ready.then(draw, draw) ?? draw();
}
