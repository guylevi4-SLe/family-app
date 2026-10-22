import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share } from 'lucide-react';

const MIN = 1;

/** The image as a file, built synchronously so sharing stays inside the tap (iOS requires that). */
function toFile(src: string, name: string): File | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(src);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = m[1].split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|]/g, '').trim() || 'תמונה';
  return new File([bytes], `${base}.${ext}`, { type: m[1] });
}

/** Opens the phone's share sheet (WhatsApp is one of its choices); without one, downloads the image. */
function shareImage(src: string, name: string) {
  const file = toFile(src, name);
  if (file && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = src;
  a.download = file?.name ?? 'תמונה.jpg';
  a.click();
}
const MAX = 5;

/**
 * Full-screen image viewer: starts with the whole image on screen, pinch or
 * the +/− buttons to zoom, drag to move around, double-tap to toggle zoom.
 */
export function ZoomViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [scale, setScale] = useState(1);
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const onResize = () => setBox({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const fit = nat ? Math.min(box.w / nat.w, (box.h - 64) / nat.h) : 1;
  const width = nat ? nat.w * fit * scale : 0;
  const height = nat ? nat.h * fit * scale : 0;

  // Zoom around a point on screen so that spot stays under the fingers.
  const zoomTo = (next: number, cx = box.w / 2, cy = box.h / 2) => {
    const el = boxRef.current;
    const s = Math.min(MAX, Math.max(MIN, next));
    if (!el || !nat) return setScale(s);
    const ratio = s / scale;
    const x = (el.scrollLeft + cx) * ratio - cx;
    const y = (el.scrollTop + cy) * ratio - cy;
    setScale(s);
    requestAnimationFrame(() => {
      el.scrollLeft = x;
      el.scrollTop = y;
    });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) zoomTo(scale > 1.5 ? 1 : 2.5, e.touches[0].clientX, e.touches[0].clientY);
      lastTap.current = now;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinch.current) return;
    e.preventDefault();
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    zoomTo(pinch.current.scale * (dist / pinch.current.dist), pinch.current.cx, pinch.current.cy);
  };

  // React's touchmove listener is passive; block the page's own pinch while zooming the image.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  // Rendered on <body> so the sheet's animation transform cannot trap it.
  return createPortal(
    <div className="zoom-viewer" role="dialog" aria-label={alt} onClick={(e) => e.stopPropagation()}>
      <div className="zoom-bar">
        <button className="icon-button" aria-label="סגירה" onClick={onClose}>✕</button>
        <span className="zoom-bar-gap" />
        <button className="icon-button" aria-label="שיתוף התמונה" onClick={() => shareImage(src, alt)}>
          <Share size={22} aria-hidden="true" />
        </button>
        <button className="icon-button" aria-label="הקטנה" disabled={scale <= MIN} onClick={() => zoomTo(scale / 1.5)}>−</button>
        <button className="icon-button" aria-label="הגדלה" disabled={scale >= MAX} onClick={() => zoomTo(scale * 1.5)}>+</button>
      </div>
      <div ref={boxRef} className="zoom-box" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => (pinch.current = null)}>
        <div className="zoom-stage" style={{ width: Math.max(width, box.w), height: Math.max(height, box.h - 64) }}>
          <img
            src={src}
            alt={alt}
            style={nat ? { width, height } : { maxWidth: '100%' }}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            draggable={false}
          />
        </div>
      </div>
      {/* Two fingertips spreading apart: shown a few times, then it fades away. */}
      <span className="zoom-hint" role="img" aria-label="הרחקת אצבעות להגדלה">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <g className="zoom-finger a">
            <circle cx="17" cy="27" r="5" fill="currentColor" fillOpacity="0.35" />
            <path d="M10 34l-4 4M6 33v5h5" />
          </g>
          <g className="zoom-finger b">
            <circle cx="27" cy="17" r="5" fill="currentColor" fillOpacity="0.35" />
            <path d="M34 10l4-4M33 6h5v5" />
          </g>
        </svg>
      </span>
    </div>,
    document.body,
  );
}
