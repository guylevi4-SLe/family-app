/**
 * Password-locked notes: the text and files are encrypted on the device
 * (AES-GCM, key from the password with PBKDF2), so the server only ever holds
 * ciphertext. A forgotten password cannot be recovered.
 */

const ITERATIONS = 310_000;
const IDLE_MS = 10 * 60 * 1000;

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function newSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(password: string, salt: string) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key: CryptoKey, data: BufferSource) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function open(key: CryptoKey, iv: string, ct: string) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct)));
}

/** A note's text as stored: "iv.ciphertext". */
export async function encryptText(key: CryptoKey, text: string) {
  const { iv, ct } = await seal(key, new TextEncoder().encode(text));
  return `${iv}.${ct}`;
}

/** Throws when the key (password) is wrong. */
export async function decryptText(key: CryptoKey, stored: string) {
  const [iv, ct] = stored.split('.');
  return new TextDecoder().decode(await open(key, iv, ct));
}

/** A JPEG data URL becomes { secret, iv }: the raw JPEG bytes, encrypted. */
export async function encryptImage(key: CryptoKey, dataUrl: string) {
  const { iv, ct } = await seal(key, fromB64(dataUrl.slice(dataUrl.indexOf(',') + 1)));
  return { secret: ct, iv };
}

export async function decryptImage(key: CryptoKey, secret: string, iv: string) {
  return `data:image/jpeg;base64,${toB64(await open(key, iv, secret))}`;
}

// Opened passwords stay open on this device for a while, in memory only. They
// are kept by salt: a locked folder and every note in it share one salt, so
// opening the folder opens its notes too.
const keys = new Map<string, { key: CryptoKey; at: number }>();

export function rememberKey(salt: string, key: CryptoKey) {
  keys.set(salt, { key, at: Date.now() });
}

export function rememberedKey(salt: string | undefined) {
  const k = salt ? keys.get(salt) : undefined;
  if (!k || Date.now() - k.at > IDLE_MS) {
    if (salt) keys.delete(salt);
    return null;
  }
  k.at = Date.now();
  return k.key;
}

/** Still within the idle time (without counting this as use). */
export function keyAlive(salt: string) {
  const k = keys.get(salt);
  return !!k && Date.now() - k.at <= IDLE_MS;
}

/** Typing in an open note counts as use. */
export function touchKey(salt: string) {
  const k = keys.get(salt);
  if (k) k.at = Date.now();
}

export function forgetKey(salt: string) {
  keys.delete(salt);
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => keys.clear());
