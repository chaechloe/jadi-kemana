// Chat share links, message templates and Google Maps link parsing.
import { getLang, COMMON } from './i18n.js';
import { LIMITS } from './data.js';

const enc = encodeURIComponent;

// Other chat apps (LINE, Telegram, …) are reached through the phone's share sheet (ui.shareText).
export const waLink = (text) => 'https://api.whatsapp.com/send?text=' + enc(text);

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

const GOOGLE_HOST = new RegExp(`^(?:www\\.)?google\\.${TLD}$`); // google.com, google.co.id, …
// Short share links: they only redirect, so the name and pin aren't in the link itself.
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'share.google']);
// Tracking parameters Google adds to shared links. Dropping them keeps list links shorter.
const TRACKING_PARAMS = ['g_st', 'g_ep', 'entry', 'shorturl', 'skid'];

/**
 * https only, and only Google Maps links: google.<tld>/maps, maps.google.<tld>,
 * maps.app.goo.gl/…, goo.gl/maps/… and share.google/… (Google's newer share links).
 */
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
  if (host === 'maps.app.goo.gl' || host === 'share.google') return u.pathname.length > 1;
  if (host === 'goo.gl') return inMaps;
  if (GOOGLE_HOST.test(host)) return inMaps;
  return MAPS_GOOGLE_HOST.test(host);
}

/** Is this (safe) Maps URL a short link that only redirects? */
export const isShortMapsUrl = (url) => isSafeMapsUrl(url) && SHORT_HOSTS.has(new URL(url).hostname.toLowerCase());

/** The canonical form (`new URL().href`, tracking parameters removed) of a safe Maps URL, or '' when it is not safe. */
export function canonicalMapsUrl(url) {
  if (!isSafeMapsUrl(url)) return '';
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.includes(key) || key.startsWith('utm_')) u.searchParams.delete(key);
  }
  const href = u.href.replace(/\?$/, '');
  // Percent-encoding can make the href longer than the input, so check it again.
  return isSafeMapsUrl(href) ? href : '';
}

// Apostrophes are legal in a path ("McDonald's"), so a URL runs until whitespace, '<', '>' or '"'.
const URL_RE = /https?:\/\/[^\s<>"]+/gi;
// The same links pasted without "https://".
const BARE_MAPS_RE =
  /(?:^|\s)((?:maps\.app\.goo\.gl|share\.google|goo\.gl\/maps|(?:www\.)?google\.(?:com?\.)?[a-z]{2,3}\/maps|maps\.google\.[a-z.]+)[^\s<>"]*)/i;
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

// ---- Place panel text (copied from the Google Maps website) ----

// Buttons, tabs and labels around a place in Google Maps (English + Indonesian UI). Not place data.
const PANEL_CHROME = new Set([
  'overview', 'menu', 'reviews', 'about', 'directions', 'save', 'nearby', 'send to phone', 'share',
  'dine-in', 'takeaway', 'delivery', 'drive-through', 'your maps history', 'website', 'call', 'photos',
  'updates', 'suggest an edit', 'claim this business', 'order online', 'reserve a table',
  'ringkasan', 'ulasan', 'tentang', 'rute', 'simpan', 'di sekitar', 'kirim ke ponsel', 'bagikan',
  'makan di tempat', 'bawa pulang', 'pesan antar', 'histori maps anda', 'situs web', 'telepon', 'foto',
  'info terbaru', 'sarankan pengeditan', 'klaim bisnis ini', 'pesan online', '·',
]);
const RATING_LINE_RE = /^([0-5])[.,](\d)$/;
const COUNT_LINE_RE = /^\(([\d.,]+)\)/; // "(716)·Rp 1–25.000"
const PHONE_RE = /^[+(]?\d[\d\s().-]{6,}$/;
const PLUS_CODE_RE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;
const NOT_PLACE_DATA_RE = /\bRp\b|per (person|orang)|reported by|dilaporkan oleh|^(open|closed|opens|closes|buka|tutup)\b/i;
const ADDRESS_RE = /^(jl\.?|jalan|gg\.?|gang|komp(lek|\.)|ruko|perum)\s|\b\d{5}\b|\b(kec\.|kota|kab\.|kabupaten)\s/i;
const OPEN_24_RE = /open 24 hours|buka 24 jam/i;

/** "Jl. X No.1, Turangga, Kec. Lengkong, Kota Bandung, Jawa Barat 40264" → drops ", Jawa Barat 40264". */
const trimProvince = (address) => address.replace(/,\s*[\p{L} .'-]+\s+\d{5}\s*$/u, '').replace(/\s+\d{5}\s*$/, '');

/**
 * The text of a place panel copied from the Google Maps website → its name, rating, review count,
 * address and (only when it's "open 24 hours") hours, plus a Maps search link for the place.
 * Returns null unless it clearly looks like a place: a name plus an address or a rating.
 */
function parsePlacePanel(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let name = '';
  let rating = null;
  let ratingCount = '';
  let address = '';
  let hours = '';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (PANEL_CHROME.has(lower)) continue;
    if (OPEN_24_RE.test(line)) hours = 'open24';
    const r = line.match(RATING_LINE_RE);
    if (r) {
      if (rating === null) rating = Number(`${r[1]}.${r[2]}`);
      continue;
    }
    const count = line.match(COUNT_LINE_RE);
    if (count) {
      if (!ratingCount) ratingCount = count[1].replace(/\D/g, '');
      continue;
    }
    if (PHONE_RE.test(line) || PLUS_CODE_RE.test(line) || NOT_PLACE_DATA_RE.test(line)) continue;
    if (!address && ADDRESS_RE.test(line)) {
      address = trimProvince(line);
      continue;
    }
    if (!name && rating === null && !address) name = line; // the title comes first in the panel
  }

  if (!name || (!address && rating === null)) return null;
  name = clip(name, LIMITS.name);
  address = clip(address, LIMITS.address);
  // Google's documented "Maps URLs" search link: opens this place in Maps, no API key needed.
  const url = 'https://www.google.com/maps/search/?api=1&query=' + enc([name, address].filter(Boolean).join(', '));
  return { url: canonicalMapsUrl(url), short: false, name, lat: null, lng: null, address, rating, ratingCount, hours, fromPanel: true };
}

/**
 * Anything pasted from Google Maps → { url, short, name, lat, lng, address, rating, ratingCount, hours, fromPanel }, or null.
 * - A link: name and pin from a full link; short links (maps.app.goo.gl, share.google) only redirect.
 * - Share text (the link comes last): the first other line is the name, the second the address.
 *   On a single line, "Name, address <link>" is split at the first comma.
 * - A place panel copied from the Google Maps website (no link): see parsePlacePanel.
 * rating/ratingCount/hours are only ever filled from a copied panel.
 */
export function parseMapsInput(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const found = findMapsUrl(text);
  if (!found) return parsePlacePanel(text);
  const { url } = found;

  const short = isShortMapsUrl(url);
  const fromUrl = short ? { name: '', lat: null, lng: null } : readUrl(url);

  // Share text ends with the link. Words after it ("Cek ini <link> ya") are chat, not a name.
  const after = text.slice(found.end).replace(URL_RE, '').replace(/[\s).,!?;:'"’”]+/g, '');
  const before = after ? '' : text.slice(0, found.start);
  let lines = before
    .split(/\r?\n/)
    .map((line) => line.replace(URL_RE, '').replace(BARE_MAPS_RE, '').trim())
    .filter(Boolean);
  if (lines.length === 1 && lines[0].includes(', ')) {
    const cut = lines[0].indexOf(', ');
    lines = [lines[0].slice(0, cut), lines[0].slice(cut + 2)];
  }

  return {
    url,
    short,
    name: clip(lines[0] || fromUrl.name, LIMITS.name),
    lat: fromUrl.lat,
    lng: fromUrl.lng,
    address: clip(lines[1] || '', LIMITS.address),
    rating: null,
    ratingCount: '',
    hours: '',
    fromPanel: false,
  };
}
