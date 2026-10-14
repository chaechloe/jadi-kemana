// Chat share links, message templates and Google Maps link parsing.
import { getLang, COMMON } from './i18n.js';
import { LIMITS } from './data.js';

const enc = encodeURIComponent;

export const waLink = (text) => 'https://api.whatsapp.com/send?text=' + enc(text);
export const lineLink = (text) => 'https://line.me/R/share?text=' + enc(text);
export const telegramLink = (url, text) => 'https://t.me/share/url?url=' + enc(url) + '&text=' + enc(text);

// One array entry per line. A line whose placeholder is empty is left out.
const TEMPLATES = {
  place: {
    id: ['*{name}*', '📍 {address}', 'Kayaknya oke nih, gimana menurut kalian?', '{maps}'],
    en: ['*{name}*', '📍 {address}', 'Looks good, what do you think?', '{maps}'],
  },
  random: {
    id: ['Pada jawab "terserah", yaudah aku yang pilihin: *{name}*!', '📍 {address}', 'Gas nggak nih?', '{maps}'],
    en: ['Everyone said "whatever", so I picked: *{name}*!', '📍 {address}', 'Shall we go?', '{maps}'],
  },
  compare: {
    id: ['*{A}* atau *{B}*? 🤔', '', 'A: {addrA}', '{mapsA}', '', 'B: {addrB}', '{mapsB}', '', 'Pilih yang mana nih?'],
    en: ['*{A}* or *{B}*? 🤔', '', 'A: {addrA}', '{mapsA}', '', 'B: {addrB}', '{mapsB}', '', 'Which one?'],
  },
  list: {
    id: ['Jadi kemana? 👀 Aku udah kumpulin {n} tempat buat "{title}":', '{link}', 'Buka, terus bahas yang kalian suka ya!'],
    en: ['So, where are we going? 👀 I put together {n} places for "{title}":', '{link}', 'Open it and bring up the ones you like!'],
  },
};

function render(kind, lang, vars) {
  const l = lang === 'en' || lang === 'id' ? lang : getLang();
  const lines = [];
  for (const line of TEMPLATES[kind][l]) {
    let missing = false;
    const text = line.replace(/\{(\w+)\}/g, (_, key) => {
      const value = String(vars[key] ?? '').trim();
      if (!value) missing = true;
      return value;
    });
    if (!missing) lines.push(text);
  }
  // Dropped lines can leave blank separators next to each other.
  return lines
    .filter((line, i) => line !== '' || (i > 0 && lines[i - 1] !== ''))
    .join('\n')
    .trim();
}

// A URL scheme anywhere in user text, even glued to a word ('Kopihttps://…').
const SCHEME_RE = /https?:\/\//gi;
// A dot that makes a word look like a host ('evil.example', 'www.x', 'bit.ly/x'): a letter, digit
// or '-' before it and two letters (a TLD) right after it. 'Jl. Dago', 'No.27', '4.9' and '09.00'
// do not match: they have a space or a digit after the dot.
const HOST_DOT_RE = /([\p{L}\p{N}-])\.(?=\p{L}{2})/gu;

/**
 * User text (name, address, list title) for a chat message: one line, no URL scheme, and host-like
 * dots swapped for U+2024 ONE DOT LEADER (looks the same) so chat apps do not linkify it.
 * Together this keeps the Maps link the first URL in the message.
 */
function inline(text) {
  let out = String(text ?? '').replace(/\s+/g, ' ');
  // Repeat: removing one scheme can join the pieces of another ('hthttps://tps://').
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(SCHEME_RE, '');
  }
  return out.replace(HOST_DOT_RE, '$1․').trim();
}

// Only a safe Maps URL ever reaches a message, in its canonical form.
const mapsOf = (place) => canonicalMapsUrl(place?.maps);

export function placeMessage(place, lang) {
  return render('place', lang, { name: inline(place.name), address: inline(place.address), maps: mapsOf(place) });
}

export function randomMessage(place, lang) {
  return render('random', lang, { name: inline(place.name), address: inline(place.address), maps: mapsOf(place) });
}

export function compareMessage(a, b, lang) {
  return render('compare', lang, {
    A: inline(a.name), B: inline(b.name),
    addrA: inline(a.address), mapsA: mapsOf(a),
    addrB: inline(b.address), mapsB: mapsOf(b),
  });
}

export function listMessage(list, url, lang) {
  const l = lang === 'en' || lang === 'id' ? lang : getLang();
  const title = inline(list.title) || COMMON[l].untitled;
  return render('list', l, { n: list.places.length, title, link: url });
}

const MAX_URL = 2048;
const TLD = String.raw`(?:com|[a-z]{2}|com?\.[a-z]{2})`;
const MAPS_GOOGLE_HOST = new RegExp(`^maps\\.google\\.${TLD}$`);

// Whitespace, control and format characters (zero-width, bidi, BOM). The URL parser silently
// drops tabs and newlines, so 'https://maps.app.goo.gl/x\n\nhttps://evil…' would otherwise pass.
const UNSAFE_CHARS_RE = /[\s\p{Cc}\p{Cf}]/u;

/** https only, and only Google Maps hosts: google.com/maps, maps.google.*, maps.app.goo.gl, goo.gl/maps. */
export function isSafeMapsUrl(url) {
  if (typeof url !== 'string' || !url || url.length > MAX_URL || UNSAFE_CHARS_RE.test(url)) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  const inMaps = u.pathname === '/maps' || u.pathname.startsWith('/maps/');
  if (host === 'maps.app.goo.gl') return u.pathname.length > 1;
  if (host === 'goo.gl') return inMaps;
  if (host === 'google.com' || host === 'www.google.com') return inMaps;
  return MAPS_GOOGLE_HOST.test(host);
}

/** The canonical form (`new URL().href`) of a safe Maps URL, or '' when it is not safe. */
export function canonicalMapsUrl(url) {
  if (!isSafeMapsUrl(url)) return '';
  const href = new URL(url).href;
  // Percent-encoding can make the href longer than the input, so check it again.
  return isSafeMapsUrl(href) ? href : '';
}

// Apostrophes are legal in a path ("McDonald's"), so a URL runs until whitespace, '<', '>' or '"'.
const URL_RE = /https?:\/\/[^\s<>"]+/gi;
const BARE_MAPS_RE = /(?:^|\s)((?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.com\/maps|maps\.google\.[a-z.]+)[^\s<>"]*)/i;
// Sentence punctuation and closing quotes after a pasted URL are not part of it.
const TRAILING_RE = /[).,!?;:'"’”]+$/;
const COORDS_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

const clip = (text, max) => Array.from(text).slice(0, max).join('').trim();

/** The first safe Maps URL in `text` as { url (canonical), start, end }, [start, end) being its span in `text`. */
function findMapsUrl(text) {
  const candidates = [...text.matchAll(URL_RE)].map((m) => ({ raw: m[0], start: m.index, bare: false }));
  const bare = BARE_MAPS_RE.exec(text);
  if (bare) candidates.push({ raw: bare[1], start: bare.index + bare[0].length - bare[1].length, bare: true });
  for (const candidate of candidates) {
    const trimmed = candidate.raw.replace(TRAILING_RE, '');
    const url = candidate.bare ? 'https://' + trimmed : trimmed.replace(/^http:\/\//i, 'https://');
    const href = canonicalMapsUrl(url);
    if (href) return { url: href, start: candidate.start, end: candidate.start + candidate.raw.length };
  }
  return null;
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' ')).trim();
  } catch {
    return segment.replace(/\+/g, ' ').trim();
  }
}

function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Name and coordinates from a full Maps URL. The '@lat,lng' part is the map view, not the place.
function readUrl(url) {
  const u = new URL(url);
  let name = '';
  let lat = null;
  let lng = null;

  const segment = u.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
  const query = u.searchParams.get('q') || u.searchParams.get('query') || '';
  const candidate = segment ? decodeSegment(segment[1]) : query.trim();
  const asCoords = candidate.match(COORDS_RE);
  if (asCoords) {
    [lat, lng] = [Number(asCoords[1]), Number(asCoords[2])];
  } else if (candidate && !candidate.startsWith('@')) {
    name = candidate;
  }

  const pin = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) [lat, lng] = [Number(pin[1]), Number(pin[2])];
  if (!validCoords(lat, lng)) [lat, lng] = [null, null];
  return { name, lat, lng };
}

/**
 * A pasted Maps link or share text → { url, short, name, lat, lng, address }, or null.
 * Share text: the first non-URL line is the name, the second the address.
 */
export function parseMapsInput(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const found = findMapsUrl(text);
  if (!found) return null;
  const { url } = found;

  const host = new URL(url).hostname.toLowerCase();
  const short = host === 'maps.app.goo.gl' || host === 'goo.gl';
  const fromUrl = short ? { name: '', lat: null, lng: null } : readUrl(url);

  // Cut the Maps URL out at its exact span, so no leftover piece of it can become the name.
  const rest = text.slice(0, found.start) + text.slice(found.end);
  const lines = rest
    .split(/\r?\n/)
    .map((line) => line.replace(URL_RE, '').replace(BARE_MAPS_RE, '').trim())
    .filter(Boolean);

  return {
    url,
    short,
    name: clip(lines[0] || fromUrl.name, LIMITS.name),
    lat: fromUrl.lat,
    lng: fromUrl.lng,
    address: clip(lines[1] || '', LIMITS.address),
  };
}
