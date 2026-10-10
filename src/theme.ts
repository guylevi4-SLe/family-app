// Colour palettes. The choice is per device and is applied before the first render.
export const PALETTES = [
  { id: 'gold', label: 'שחור וזהב', swatch: '#f5c518', bar: '#090909' },
  { id: 'goldlight', label: 'לבן וזהב', swatch: 'linear-gradient(135deg, #fff 50%, #c99700 50%)', bar: '#f5f3ee' },
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
  return 'gold';
}

export function applyPalette(id: Palette, save = false) {
  document.documentElement.dataset.palette = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const bar = PALETTES.find((p) => p.id === id)!.bar || (dark ? '#131715' : '#f6f7f4');
  meta?.setAttribute('content', bar);
  if (save) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* per-device choice is optional */
    }
  }
}
