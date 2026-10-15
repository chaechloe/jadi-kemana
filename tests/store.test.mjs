import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A minimal in-memory localStorage.
class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });

const store = await import('../js/store.js');
const { sampleList, SAMPLE_ID } = await import('../js/data.js');

// Lets the clock move on, so updatedAt values differ.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const changedSinceShared = (list) => list.sharedAt !== null && list.updatedAt > list.sharedAt;
const place = (name) => ({ name, emoji: '☕', color: 'teal', address: '', hours: '', rating: null, ratingCount: '', perks: [], custom: [], note: '', maps: '' });

beforeEach(() => localStorage.clear());

test('storageOk reports a working storage', () => {
  assert.equal(store.storageOk(), true);
});

test('create, read, save and delete lists', async () => {
  const a = store.createList({ title: 'Nongkrong Sabtu', from: 'Rani' });
  assert.match(a.id, /^[a-z0-9]{8}$/);
  assert.equal(a.sharedAt, null);
  assert.deepEqual(store.getList(a.id), a);

  const b = store.createList({ title: 'Bukber kantor', from: 'Rani' });
  await tick();
  store.saveList({ ...a, title: 'Nongkrong Minggu' });
  const lists = store.getLists();
  assert.deepEqual(lists.map((l) => l.id), [a.id, b.id], 'newest first');
  assert.equal(lists[0].title, 'Nongkrong Minggu');

  const kept = store.saveList({ ...b, title: 'Bukber' }, { touch: false });
  assert.equal(kept.updatedAt, b.updatedAt);

  store.deleteList(a.id);
  assert.equal(store.getList(a.id), null);
  assert.equal(store.getLists().length, 1);
  assert.ok(localStorage.getItem('jk.v1.lists').includes('Bukber'));
});

test('upsert and remove places', () => {
  const list = store.createList({ title: 'Ngopi', from: 'Ayu' });
  let saved = store.upsertPlace(list.id, place('Kopi A'));
  const [a] = saved.places;
  assert.match(a.id, /^[a-z0-9]{8}$/);

  saved = store.upsertPlace(list.id, place('Kopi B'));
  saved = store.upsertPlace(list.id, { ...a, name: 'Kopi A+', rating: 4.5 });
  assert.deepEqual(saved.places.map((p) => p.name), ['Kopi A+', 'Kopi B']);
  assert.equal(saved.places[0].id, a.id);
  assert.equal(saved.places[0].rating, 4.5);

  saved = store.removePlace(list.id, a.id);
  assert.deepEqual(saved.places.map((p) => p.name), ['Kopi B']);
  assert.equal(store.upsertPlace('missing', place('X')), null);
});

test('upsertPlace refuses a 21st place', () => {
  const list = store.createList({ title: 'Banyak', from: '' });
  for (let i = 0; i < 20; i++) assert.ok(store.upsertPlace(list.id, place(`P${i}`)));
  assert.equal(store.upsertPlace(list.id, place('P20')), null);
  assert.equal(store.getList(list.id).places.length, 20);
});

test('movePlace reorders places', () => {
  const list = store.createList({ title: 'Urut', from: '' });
  for (const name of ['A', 'B', 'C', 'D']) store.upsertPlace(list.id, place(name));
  const names = () => store.getList(list.id).places.map((p) => p.name);

  store.movePlace(list.id, 0, 2);
  assert.deepEqual(names(), ['B', 'C', 'A', 'D']);
  store.movePlace(list.id, 3, 0);
  assert.deepEqual(names(), ['D', 'B', 'C', 'A']);
  store.movePlace(list.id, 1, 99);
  assert.deepEqual(names(), ['D', 'C', 'A', 'B']);
  store.movePlace(list.id, 9, 0);
  assert.deepEqual(names(), ['D', 'C', 'A', 'B']);
});

test('markShared and changed since shared', () => {
  const list = store.createList({ title: 'Share', from: 'Rani' });
  store.upsertPlace(list.id, place('A'));
  assert.equal(changedSinceShared(store.getList(list.id)), false, 'never shared');

  const shared = store.markShared(list.id);
  assert.equal(typeof shared.sharedAt, 'number');
  assert.equal(changedSinceShared(shared), false);
  assert.equal(changedSinceShared(store.getList(list.id)), false);

  // Same millisecond is fine: an edit always moves updatedAt past sharedAt.
  store.upsertPlace(list.id, place('B'));
  assert.equal(changedSinceShared(store.getList(list.id)), true);

  store.markShared(list.id);
  assert.equal(changedSinceShared(store.getList(list.id)), false);
});

test('upsertPlace without changes keeps updatedAt', async () => {
  const list = store.createList({ title: 'Sama', from: 'Rani' });
  const [a] = store.upsertPlace(list.id, place('Kopi A')).places;
  const shared = store.markShared(list.id);
  await tick();

  // Same values, even untrimmed ones that sanitize to the stored place.
  const same = store.upsertPlace(list.id, { ...a, name: '  Kopi A  ' });
  assert.equal(same.updatedAt, shared.updatedAt);
  assert.equal(changedSinceShared(store.getList(list.id)), false);

  store.upsertPlace(list.id, { ...a, note: 'Enak' });
  assert.equal(changedSinceShared(store.getList(list.id)), true);
});

test('importList replaces a list with the same id', async () => {
  const sample = { ...sampleList('id'), id: 'abcd1234' };
  const first = store.importList(sample);
  assert.equal(first.existed, false);
  assert.equal(first.list.id, 'abcd1234');
  assert.equal(first.list.places.length, 5);

  const en = sampleList('en');
  const second = store.importList({ ...en, id: 'abcd1234', places: en.places.slice(0, 2) });
  assert.equal(second.existed, true);
  assert.equal(store.getLists().filter((l) => l.id === 'abcd1234').length, 1);
  assert.equal(store.getList('abcd1234').title, 'Example: Bandung work-from-cafe spots');
  assert.equal(store.getList('abcd1234').places.length, 2);
});

test('importList never stores the example list id', () => {
  const first = store.importList(sampleList('id'));
  const second = store.importList(sampleList('en'));
  assert.equal(first.existed, false);
  assert.equal(second.existed, false);
  assert.notEqual(first.list.id, SAMPLE_ID);
  assert.notEqual(second.list.id, first.list.id);
  assert.match(first.list.id, /^[a-z0-9]{8}$/);
  assert.equal(store.getList(SAMPLE_ID), null);
  assert.equal(store.getLists().length, 2);
});

test('the example list is bilingual', () => {
  assert.deepEqual(sampleList('id').places[1].custom, ['Tempat taruh tas', 'Ada lesehan']);
  assert.deepEqual(sampleList('en').places[1].custom, ['Bag hooks at tables', 'Floor seating']);
});

test('broken storage does not throw', () => {
  const real = globalThis.localStorage;
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: broken, configurable: true, writable: true });
  try {
    assert.equal(store.storageOk(), false);
    const list = store.createList({ title: 'Sementara', from: '' });
    assert.equal(store.getList(list.id).title, 'Sementara', 'kept in memory for this session');
    assert.ok(Array.isArray(store.getLists()));
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true, writable: true });
  }
});

test('compareWithSaved tells a new, an identical and a changed list apart', async () => {
  const { decodeList, encodeList } = await import('../js/codec.js');
  const mine = store.createList({ title: 'Nongkrong Sabtu', from: 'Rani' });
  store.upsertPlace(mine.id, place('Kopi A'));
  const shared = store.markShared(mine.id);
  const link = await decodeList(await encodeList(shared)); // places come back with fresh ids

  assert.equal(store.compareWithSaved({ ...link, id: 'zzzz9999' }).status, 'new');
  assert.equal(store.compareWithSaved(link).status, 'same');
  await tick();
  store.upsertPlace(mine.id, place('Kopi B')); // edited after sharing
  assert.equal(store.compareWithSaved(link).status, 'different');
  assert.equal(store.compareWithSaved(sampleList('id')).status, 'new');
});

test('importList asCopy keeps the saved list; replacing keeps when it was created and shared', async () => {
  const mine = store.createList({ title: 'Nongkrong Sabtu', from: 'Rani' });
  store.upsertPlace(mine.id, place('Kopi A'));
  const shared = store.markShared(mine.id);
  const older = { ...shared, places: [] };

  const copy = store.importList(older, { asCopy: true });
  assert.notEqual(copy.list.id, mine.id);
  assert.equal(copy.list.sharedAt, null);
  assert.equal(store.getList(mine.id).places.length, 1, 'the saved list is untouched');

  await tick();
  const replaced = store.importList(older);
  assert.equal(replaced.existed, true);
  assert.equal(replaced.list.places.length, 0);
  assert.equal(replaced.list.createdAt, shared.createdAt);
  assert.equal(replaced.list.sharedAt, shared.sharedAt);
  assert.ok(changedSinceShared(replaced.list), 'a replaced list counts as changed since shared');
});

test('a write that does not reach storage is reported, and the app is told', () => {
  const real = globalThis.localStorage;
  let told = 0;
  const onFail = () => told++;
  globalThis.addEventListener?.('jk:storage-failed', onFail);
  try {
    const full = new MemoryStorage();
    full.setItem = () => { throw new Error('QuotaExceededError'); };
    Object.defineProperty(globalThis, 'localStorage', { value: full, configurable: true, writable: true });
    store.createList({ title: 'Penuh' });
    assert.equal(store.savedToDevice(), false);
    if (globalThis.addEventListener) assert.equal(told, 1);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true, writable: true });
    globalThis.removeEventListener?.('jk:storage-failed', onFail);
  }
  store.createList({ title: 'Lega lagi' });
  assert.equal(store.savedToDevice(), true);
});
