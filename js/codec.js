// List <-> URL fragment payload (codec v1). See docs/ARCHITECTURE.md, "Link payload".
import { PERKS, COLORS, EMOJIS, LIMITS, newId } from './data.js';
import { canonicalMapsUrl, canonicalWebUrl } from './links.js';

const VERSION = '1';
const MAX_PAYLOAD = 360 * 1024; // characters, enough for MAX_JSON in mode 'j'
const MAX_JSON = 256 * 1024; // bytes after inflating
const SHORT_MAPS = 'https://maps.app.goo.gl/';
const ID_RE = /^[a-z0-9]{1,16}$/;

export class CodecError extends Error {
  /** @param {'version'|'corrupt'|'unsupported'} code */
  constructor(code, message = code) {
    super(message);
    this.name = 'CodecError';
    this.code = code;
  }
}

// ---- base64url ----

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64].map((ch, i) => [ch, i]));

function toBase64url(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out.push(B64[(n >> 18) & 63], B64[(n >> 12) & 63]);
    if (left > 1) out.push(B64[(n >> 6) & 63]);
    if (left > 2) out.push(B64[n & 63]);
  }
  return out.join('');
}

function fromBase64url(text) {
  if (text.length % 4 === 1) throw new CodecError('corrupt');
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let j = 0;
  for (const ch of text) {
    const value = B64_INDEX.get(ch);
    if (value === undefined) throw new CodecError('corrupt');
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[j++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, j);
}

// ---- deflate-raw ----

const canCompress = () => typeof CompressionStream === 'function';
const canDecompress = () => typeof DecompressionStream === 'function';

// Pipes bytes through a transform stream, refusing output larger than `limit`.
async function transform(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new CodecError('corrupt', 'payload too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// ---- positional JSON ----

const compactMaps = (url) => (url.startsWith(SHORT_MAPS) ? '~' + url.slice(SHORT_MAPS.length) : url);
const expandMaps = (value) => (value.startsWith('~') ? SHORT_MAPS + value.slice(1) : value);

function perksToMask(perks = []) {
  return PERKS.reduce((mask, perk, i) => (perks.includes(perk.code) ? mask | (1 << i) : mask), 0);
}

function maskToPerks(mask) {
  const n = Number.isInteger(mask) ? mask : 0;
  return PERKS.filter((_, i) => n & (1 << i)).map((perk) => perk.code);
}

function packPlace(p) {
  const color = Math.max(0, COLORS.findIndex((c) => c.key === p.color));
  const rating = typeof p.rating === 'number' ? Math.round(p.rating * 10) : 0;
  return [
    p.name || '', p.emoji || '', color, p.address || '', p.hours || '', rating,
    String(p.ratingCount || ''), perksToMask(p.perks), p.custom || [], p.note || '', compactMaps(p.maps || ''),
    // Appended later (menu link): older links simply end before it.
    p.menu || '',
  ];
}

// Positional array → loose object; sanitizeList does the real validation.
function unpackPlace(row) {
  if (!Array.isArray(row)) return null;
  const [name, emoji, color, address, hours, rating, ratingCount, mask, custom, note, maps, menu] = row;
  return {
    name, emoji, address, hours, ratingCount, custom, note, menu,
    color: COLORS[color]?.key,
    rating: Number.isInteger(rating) && rating > 0 ? rating / 10 : null,
    perks: maskToPerks(mask),
    maps: typeof maps === 'string' ? expandMaps(maps) : '',
  };
}

// ---- public API ----

/** List → payload string ('1' + mode + base64url data). */
export async function encodeList(list) {
  const clean = sanitizeList(list, { keepIds: true });
  const json = JSON.stringify([1, clean.id, clean.title, clean.from, clean.places.map(packPlace)]);
  const bytes = new TextEncoder().encode(json);
  const plain = VERSION + 'j' + toBase64url(bytes);
  if (!canCompress()) return plain;
  try {
    const packed = VERSION + 'z' + toBase64url(await transform(bytes, new CompressionStream('deflate-raw')));
    return packed.length < plain.length ? packed : plain;
  } catch {
    return plain;
  }
}

/** Payload string → sanitized List with fresh place ids. Throws CodecError. */
export async function decodeList(payload) {
  if (typeof payload !== 'string') throw new CodecError('corrupt');
  const text = payload.trim();
  if (text.length < 3 || text.length > MAX_PAYLOAD) throw new CodecError('corrupt');
  if (text[0] !== VERSION) throw new CodecError(/\d/.test(text[0]) ? 'version' : 'corrupt');

  const mode = text[1];
  if (mode !== 'z' && mode !== 'j') throw new CodecError('corrupt');
  if (mode === 'z' && !canDecompress()) throw new CodecError('unsupported');

  let bytes = fromBase64url(text.slice(2));
  if (mode === 'z') {
    try {
      bytes = await transform(bytes, new DecompressionStream('deflate-raw'), MAX_JSON);
    } catch (err) {
      throw err instanceof CodecError ? err : new CodecError('corrupt');
    }
  } else if (bytes.length > MAX_JSON) {
    throw new CodecError('corrupt');
  }

  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CodecError('corrupt');
  }
  if (!Array.isArray(data)) throw new CodecError('corrupt');
  if (data[0] !== 1) throw new CodecError(typeof data[0] === 'number' ? 'version' : 'corrupt');

  const [, id, title, from, rows] = data;
  const places = Array.isArray(rows) ? rows.slice(0, LIMITS.places).map(unpackPlace) : [];
  return sanitizeList({ id, title, from, places });
}

// ---- sanitizing ----

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f‎‏‪-‮⁦-⁩]/g;

/** A trimmed string of at most `max` characters (code points); multiline keeps line breaks. */
function cleanText(value, max, { multiline = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  let text = String(value).replace(CONTROL, '');
  text = multiline ? text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ');
  return Array.from(text.trim()).slice(0, max).join('').trim();
}

// Combining marks other than VS16 (U+FE0F) and the keycap (U+20E3): stacked marks are Zalgo text.
const EMOJI_BAD_MARK = /(?![️⃣])\p{M}/u;
// Invisible format characters other than the ZWJ (U+200D) that joins emoji sequences.
const EMOJI_BAD_FORMAT = /(?!‍)\p{Cf}/u;

/** One of data.EMOJIS, or any single emoji grapheme from a link; anything else becomes EMOJIS[0]. */
function cleanEmoji(value) {
  if (EMOJIS.includes(value)) return value;
  const single = typeof value === 'string' && value.length <= 16
    && /^\p{Extended_Pictographic}/u.test(value)
    && !/[\p{L}\p{N}\s<>&"']/u.test(value)
    && !EMOJI_BAD_MARK.test(value)
    && !EMOJI_BAD_FORMAT.test(value)
    && isOneGrapheme(value);
  return single ? value : EMOJIS[0];
}

// Without Intl.Segmenter there is no reliable way to count graphemes, so only data.EMOJIS pass.
function isOneGrapheme(text) {
  if (typeof Intl?.Segmenter !== 'function') return false;
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length === 1;
}

/** 0.1–5.0 with one decimal, or null. 0 means "no rating", as ratingX10 = 0 does in the payload. */
function cleanRating(value) {
  const n = typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const rating = Math.round(Math.min(5, Math.max(0, n)) * 10) / 10;
  return rating > 0 ? rating : null;
}

function cleanCount(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
}

function cleanHours(value) {
  if (value === 'open24') return 'open24';
  return cleanText(value, LIMITS.hours);
}

function cleanPerks(value) {
  const list = Array.isArray(value) ? value : [];
  return PERKS.map((p) => p.code).filter((code) => list.includes(code));
}

function cleanCustom(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  const used = new Set();
  for (const item of list) {
    const text = cleanText(item, LIMITS.customLen);
    if (!text || used.has(text.toLowerCase())) continue;
    used.add(text.toLowerCase());
    out.push(text);
    if (out.length >= LIMITS.custom) break;
  }
  return out;
}

// Store the canonical href, never the raw string: isSafeMapsUrl rejects whitespace and control
// characters, and the href is what the URL parser actually understood.
const cleanMaps = (value) => (typeof value === 'string' ? canonicalMapsUrl(value.trim()) : '');
const cleanTime = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);

function cleanPlace(raw, id) {
  return {
    id,
    name: cleanText(raw.name, LIMITS.name),
    emoji: cleanEmoji(raw.emoji),
    color: COLORS.some((c) => c.key === raw.color) ? raw.color : COLORS[0].key,
    address: cleanText(raw.address, LIMITS.address),
    hours: cleanHours(raw.hours),
    rating: cleanRating(raw.rating),
    ratingCount: cleanCount(raw.ratingCount),
    perks: cleanPerks(raw.perks),
    custom: cleanCustom(raw.custom),
    note: cleanText(raw.note, LIMITS.note, { multiline: true }),
    maps: cleanMaps(raw.maps),
    menu: canonicalWebUrl(raw.menu),
  };
}

/**
 * Untrusted object → valid List: checks types, truncates to LIMITS, drops unsafe Maps URLs
 * and nameless places, caps the place count, and gives places fresh ids.
 * `keepIds` keeps valid, unique place ids (for lists this app stored itself).
 */
export function sanitizeList(obj, { keepIds = false } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new CodecError('corrupt');
  const now = Date.now();
  const used = new Set();
  const placeId = (raw) => {
    let id = keepIds && typeof raw === 'string' && ID_RE.test(raw) && !used.has(raw) ? raw : newId();
    while (used.has(id)) id = newId();
    used.add(id);
    return id;
  };

  const places = (Array.isArray(obj.places) ? obj.places : [])
    .filter((p) => p && typeof p === 'object' && !Array.isArray(p))
    .map((p) => cleanPlace(p, placeId(p.id)))
    .filter((p) => p.name)
    .slice(0, LIMITS.places);

  const createdAt = cleanTime(obj.createdAt, now);
  const updatedAt = cleanTime(obj.updatedAt, createdAt);
  return {
    id: typeof obj.id === 'string' && ID_RE.test(obj.id) ? obj.id : newId(),
    title: cleanText(obj.title, LIMITS.title),
    from: cleanText(obj.from, LIMITS.from),
    places,
    createdAt,
    updatedAt,
    sharedAt: Number.isFinite(obj.sharedAt) ? obj.sharedAt : null,
  };
}

/** The shareable link for a payload. */
export function listUrl(payload, base = location.origin + location.pathname) {
  return String(base).split('#')[0] + '#d=' + payload;
}
