// The place form's Maps auto-fill ("Ambil info"), kept free of DOM so it can be tested.
// Every function reads and updates the form state; autofillState() makes its auto-fill part:
//   { place: { name, address, maps, hours, ratingCount, … }, rating, link, pasted, status, filled,
//     auto, approx, lookup, keepLink }
// A value from Maps only goes into an empty field and counts as "auto" until the user edits it.
// A new link clears the auto values (they belong to another place), never what the user typed.
import { parseMapsInput, isSafeMapsUrl, isShortMapsUrl } from './links.js';
import { approxAddress } from './geo.js';

// Where each auto-fillable field lives in the form state. The rating is kept as typed text.
const FIELDS = {
  name: { get: (s) => s.place.name, set: (s, v) => (s.place.name = v) },
  address: { get: (s) => s.place.address, set: (s, v) => (s.place.address = v) },
  rating: { get: (s) => s.rating, set: (s, v) => (s.rating = v) },
  ratingCount: { get: (s) => s.place.ratingCount, set: (s, v) => (s.place.ratingCount = v) },
  hours: { get: (s) => s.place.hours, set: (s, v) => (s.place.hours = v) },
};
const KEYS = Object.keys(FIELDS);
const none = () => Object.fromEntries(KEYS.map((key) => [key, false]));

/** The auto-fill part of a new form state; `link` is what the link field shows. */
export function autofillState(link = '') {
  return {
    link,
    pasted: null, // { raw, shown }: the last paste with its line breaks (inputs drop them)
    status: 'idle', // idle | filled | short | paste | invalid
    filled: none(), // what the last read filled in
    auto: none(), // fields still holding a value from Maps
    approx: 'none', // none | loading | done: a street-level address from OpenStreetMap
    lookup: 0, // id of the latest address lookup; older answers are dropped
    keepLink: '', // a short link to keep while the user pastes that place's text instead
  };
}

/** Share text ("name / address / link" lines) the way a one-line input shows it. */
export const oneLine = (text) => text.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/** What "Ambil info" reads: the pasted text with its line breaks while the field still shows it. */
const linkText = (state) => (state.pasted && state.pasted.shown === state.link ? state.pasted.raw : state.link);

/** The Maps URL in the link field: '' when the field is empty, null when it holds no Maps link. */
export function mapsFromLink(state) {
  const text = linkText(state);
  if (!text.trim()) return '';
  const result = parseMapsInput(text);
  // Text copied from a place panel has no link of its own: keep the short link it stands in for.
  if (result?.fromPanel && state.keepLink) return state.keepLink;
  return result?.url && isSafeMapsUrl(result.url) ? result.url : null;
}

/**
 * The user is about to paste the text for the short link in the field (name, address…),
 * replacing it: remember the link so the Maps button still opens that exact place.
 */
export function holdLink(state) {
  if (isShortMapsUrl(state.place.maps)) state.keepLink = state.place.maps;
}

/** Text handed over from elsewhere (the Editor's link field): shown on one line, read with its line breaks. */
export function pasteLink(state, text) {
  state.link = oneLine(text);
  state.pasted = { raw: text, shown: state.link };
}

/**
 * The user changed the link field to `value` (`pasted`: the clipboard text when it was a paste).
 * Keeps place.maps in step, drops a lookup still on its way and clears an old result or error.
 * Returns what the screen has to catch up on: { lookup, status } (booleans).
 */
export function editLink(state, value, pasted = null) {
  const wasEmpty = !state.link.trim();
  state.link = value;
  if (pasted) state.pasted = { raw: pasted, shown: value };
  // A held short link only stands in for panel text; anything else (a link, nothing) releases it.
  if (state.keepLink && !parseMapsInput(linkText(state))?.fromPanel) state.keepLink = '';
  state.place.maps = mapsFromLink(state) ?? '';

  const lookup = state.approx === 'loading';
  if (lookup) cancelLookup(state);
  const status = state.status !== 'idle' || wasEmpty !== !value.trim();
  if (status) state.status = 'idle';
  return { lookup, status };
}

/** The user typed in an auto-fillable field: the value is theirs now, and wins over a lookup on its way. */
export function editField(state, key, value) {
  FIELDS[key].set(state, value);
  state.auto[key] = false;
  if (key !== 'address') return;
  if (state.approx === 'loading') cancelLookup(state);
  if (!value.trim()) state.approx = 'none'; // an emptied field drops the OpenStreetMap credit
}

/**
 * "Ambil info": reads the link field and puts the name and address it finds into empty fields.
 * Returns { status, coords }. status: 'empty' (nothing to read, state untouched), 'invalid',
 * 'short' or 'filled'. coords ({ lat, lng }): the pin to look the address up from, when the
 * address is still empty; pass them to lookupAddress().
 */
export function readLink(state) {
  const text = linkText(state);
  if (!text.trim()) return { status: 'empty', coords: null };

  const result = parseMapsInput(text);
  if (!result || !isSafeMapsUrl(result.url)) return settle(state, 'invalid');

  // Panel text pasted for a held short link keeps that link; otherwise the new link wins.
  state.place.maps = result.fromPanel && state.keepLink ? state.keepLink : result.url;
  // The new link replaces place.maps, so whatever an earlier link filled in belongs to another
  // place: drop it rather than save place A's name with place B's link.
  clearAutoFilled(state);

  // A short link alone carries no name; the share text around it does.
  if (result.short && !result.name) {
    state.filled = none();
    return settle(state, 'short');
  }

  state.filled = {
    name: fillAuto(state, 'name', result.name),
    address: fillAuto(state, 'address', result.address),
    // Only a copied place panel carries these.
    rating: fillAuto(state, 'rating', result.rating === null ? '' : String(result.rating)),
    ratingCount: fillAuto(state, 'ratingCount', result.ratingCount),
    hours: fillAuto(state, 'hours', result.hours),
  };
  const pin = result.lat !== null && !state.place.address;
  return settle(state, 'filled', pin ? { lat: result.lat, lng: result.lng } : null);
}

/**
 * Fills the address from the pin (OpenStreetMap), unless the user got there first. The state shows
 * 'loading' straight away. Resolves true once the answer is in (the screen should catch up), or
 * false when a newer link or an edit took over meanwhile. `find` stands in for geo.approxAddress.
 */
export async function lookupAddress(state, { lat, lng }, lang, find = approxAddress) {
  const id = ++state.lookup;
  state.approx = 'loading';
  const address = await find(lat, lng, lang);
  if (id !== state.lookup) return false;

  const filled = Boolean(address) && fillAuto(state, 'address', address);
  state.approx = filled ? 'done' : 'none';
  state.filled.address = filled;
  return true;
}

/** The place form's string key for the line under the link field, or null for none. */
export function statusMessage(state) {
  switch (state.status) {
    case 'invalid':
      return 'notMaps';
    case 'short':
      return 'shortMsg';
    case 'paste':
      return 'pasteHint';
    case 'filled': {
      const { name, address, rating, ratingCount, hours } = state.filled;
      if (rating || ratingCount || hours) return 'filledDetails';
      if (name && address) return 'filledBoth';
      if (name) return 'filledName';
      return address ? 'filledAddress' : 'linkSaved';
    }
    default:
      return state.link.trim() ? null : 'emptyHelp';
  }
}

// ---- internals ----

function settle(state, status, coords = null) {
  state.status = status;
  return { status, coords };
}

/** Empties the fields that still hold a value from an earlier link, and stops its lookup. */
function clearAutoFilled(state) {
  cancelLookup(state);
  for (const key of KEYS) {
    if (!state.auto[key]) continue;
    FIELDS[key].set(state, '');
    state.auto[key] = false;
  }
  if (!state.place.address) state.approx = 'none';
}

/** Puts a value from Maps into an empty field and marks it as auto-filled. */
function fillAuto(state, key, value) {
  if (!value || String(FIELDS[key].get(state) ?? '').trim()) return false;
  FIELDS[key].set(state, value);
  state.auto[key] = true;
  return true;
}

function cancelLookup(state) {
  state.lookup += 1;
  if (state.approx === 'loading') state.approx = 'none';
}
