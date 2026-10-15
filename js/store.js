// Lists saved on this device, in localStorage. Storage can fail at any time
// (private mode, quota, eviction), so every access is guarded and an in-memory
// copy keeps the session working.
import { LIMITS, SAMPLE_ID, newId } from './data.js';
import { sanitizeList } from './codec.js';

const KEY = 'jk.v1.lists';
const PROBE = 'jk.v1.probe';

let memory = [];
// Set once a write fails; from then on the in-memory copy is the source of truth.
let writeFailed = false;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readAll() {
  try {
    const s = storage();
    if (!s || writeFailed) return memory.map(clone);
    const raw = s.getItem(KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      try {
        return [sanitizeList(item, { keepIds: true })];
      } catch {
        return [];
      }
    });
  } catch {
    return memory.map(clone);
  }
}

// A write that didn't reach localStorage (full, blocked, private mode) is announced once as the
// 'jk:storage-failed' event, so the app can say so instead of "saved".
const FAILED_EVENT = 'jk:storage-failed';

function writeAll(lists) {
  memory = lists.map(clone);
  try {
    const s = storage();
    if (!s) throw new Error('no storage');
    s.setItem(KEY, JSON.stringify(lists));
    writeFailed = false;
    return true;
  } catch {
    writeFailed = true;
    if (typeof Event === 'function') globalThis.dispatchEvent?.(new Event(FAILED_EVENT));
    return false;
  }
}

/** Did the last change reach this device's storage? false after a failed write, until one succeeds. */
export const savedToDevice = () => !writeFailed;

const clone = (value) => structuredClone(value);

/** A new list id not used by any of `lists`. */
function freshId(lists) {
  let id = newId();
  while (lists.some((list) => list.id === id)) id = newId();
  return id;
}

// Both sides come out of sanitizeList, so their keys are in the same order and JSON compares them.
const samePlace = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What a link carries: decoded places get fresh ids, so ids and dates don't count.
const content = (list) => JSON.stringify([list.title, list.from, list.places.map(({ id, ...place }) => place)]);

// updatedAt always moves past sharedAt, even within the same millisecond.
const touchTime = (list) => Math.max(Date.now(), (list.sharedAt ?? 0) + 1, (list.updatedAt ?? 0) + 1);

/** Can this browser save lists? */
export function storageOk() {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(PROBE, '1');
    s.removeItem(PROBE);
    return true;
  } catch {
    return false;
  }
}

/** All lists, newest first. */
export function getLists() {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getList(id) {
  return readAll().find((list) => list.id === id) ?? null;
}

export function createList({ title = '', from = '' } = {}) {
  const lists = readAll();
  const id = freshId(lists);
  const now = Date.now();
  const list = sanitizeList({ id, title, from, places: [], createdAt: now, updatedAt: now, sharedAt: null });
  writeAll([list, ...lists]);
  return list;
}

/** Saves (inserts or replaces) a list. touch=false keeps updatedAt. Returns the saved list. */
export function saveList(list, { touch = true } = {}) {
  const lists = readAll();
  const next = sanitizeList({ ...list, updatedAt: touch ? touchTime(list) : list.updatedAt }, { keepIds: true });
  const index = lists.findIndex((l) => l.id === next.id);
  if (index >= 0) lists[index] = next;
  else lists.unshift(next);
  writeAll(lists);
  return next;
}

export function deleteList(id) {
  writeAll(readAll().filter((list) => list.id !== id));
}

// Applies `change` to a copy of the stored list and saves it. Returns the list
// (unsaved when `change` returns false), or null when the list is missing.
function updateList(listId, change, options) {
  const list = getList(listId);
  if (!list) return null;
  if (change(list) === false) return list;
  return saveList(list, options);
}

/**
 * Adds a place (a new id when it has none) or replaces the one with the same id.
 * Returns the saved list, or null when the list is missing or already full.
 * Saving a place without changes returns the stored list untouched, so it doesn't
 * count as "changed since shared".
 */
export function upsertPlace(listId, place) {
  const list = getList(listId);
  if (!list) return null;
  const index = place.id ? list.places.findIndex((p) => p.id === place.id) : -1;
  if (index >= 0) {
    const before = list.places[index];
    list.places[index] = { ...place };
    // Compare the place as it would be stored (sanitized), not as the form sent it.
    if (samePlace(sanitizeList(list, { keepIds: true }).places[index], before)) {
      list.places[index] = before;
      return list;
    }
  } else {
    if (list.places.length >= LIMITS.places) return null;
    list.places.push({ ...place, id: place.id || newId() });
  }
  return saveList(list);
}

export function removePlace(listId, placeId) {
  return updateList(listId, (l) => {
    l.places = l.places.filter((p) => p.id !== placeId);
  });
}

export function movePlace(listId, fromIndex, toIndex) {
  return updateList(listId, (l) => {
    const last = l.places.length - 1;
    if (fromIndex < 0 || fromIndex > last) return false;
    const to = Math.min(Math.max(0, toIndex), last);
    if (to === fromIndex) return false;
    const [moved] = l.places.splice(fromIndex, 1);
    l.places.splice(to, 0, moved);
    return true;
  });
}

/** Records that the current version was shared. */
export function markShared(listId) {
  return updateList(
    listId,
    (l) => {
      l.sharedAt = Math.max(Date.now(), l.updatedAt);
    },
    { touch: false },
  );
}

/**
 * How a list opened from a link relates to the one saved here:
 * 'new' (not saved here), 'same' (saved with the same content) or 'different'.
 * The example's fixed id is shared by every device, so it is always 'new'.
 */
export function compareWithSaved(list) {
  const saved = list.id === SAMPLE_ID ? null : getList(list.id);
  if (!saved) return { status: 'new', saved: null };
  return { status: content(saved) === content(list) ? 'same' : 'different', saved };
}

/**
 * Saves a list opened from a link. A saved list with the same id is replaced (keeping when it was
 * created and last shared), unless `asCopy`, which saves it under a fresh id beside it. The example
 * always gets a fresh id. Ask first (compareWithSaved) before replacing a list that differs.
 */
export function importList(list, { asCopy = false } = {}) {
  const lists = readAll();
  const saved = lists.find((l) => l.id === list.id);
  if (asCopy || list.id === SAMPLE_ID) {
    return { list: saveList({ ...list, id: freshId(lists), sharedAt: null }, { touch: false }), existed: false };
  }
  if (!saved) return { list: saveList(list, { touch: false }), existed: false };
  return { list: saveList({ ...list, createdAt: saved.createdAt, sharedAt: saved.sharedAt, updatedAt: saved.updatedAt }), existed: true };
}
