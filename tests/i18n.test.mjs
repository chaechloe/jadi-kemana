import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON, t, formatHours, formatRating, relativeTime } from '../js/i18n.js';
import { PERKS, COLORS } from '../js/data.js';

// Every key path in a nested string table, e.g. 'perks.wifi'.
function keyPaths(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === 'object' ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  ).sort();
}

test('COMMON id and en have identical keys', () => {
  assert.deepEqual(keyPaths(COMMON.id), keyPaths(COMMON.en));
  for (const value of keyPaths(COMMON.en).map((k) => t({ id: COMMON.en }, k))) {
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 0);
  }
});

test('COMMON has a label for every perk and colour', () => {
  for (const lang of ['id', 'en']) {
    assert.deepEqual(Object.keys(COMMON[lang].perks), PERKS.map((p) => p.code));
    assert.deepEqual(Object.keys(COMMON[lang].colors), COLORS.map((c) => c.key));
  }
  assert.deepEqual(Object.values(COMMON.id.colors), ['Oranye', 'Ungu', 'Merah', 'Cokelat', 'Nila', 'Zaitun', 'Toska', 'Plum']);
  assert.deepEqual(Object.values(COMMON.en.colors), ['Orange', 'Purple', 'Red', 'Brown', 'Indigo', 'Olive', 'Teal', 'Plum']);
  assert.equal(COMMON.id.perks.prayer, 'Ada mushola');
});

test('t falls back to Bahasa and fills placeholders', () => {
  const dict = { id: { hi: 'Halo {name}', only: 'Cuma ID' }, en: { hi: 'Hi {name}' } };
  assert.match(t(dict, 'hi', { name: 'Rani' }), /^(Halo|Hi) Rani$/);
  assert.equal(t(dict, 'only'), 'Cuma ID');
  assert.equal(t(dict, 'missing'), 'missing');
});

test('formatHours in both languages', () => {
  assert.equal(formatHours('', 'id'), null);
  assert.equal(formatHours(null, 'en'), null);
  assert.equal(formatHours('open24', 'id'), 'Buka 24 jam');
  assert.equal(formatHours('open24', 'en'), 'Open 24 hours');
  assert.equal(formatHours('09.00–22.00', 'id'), '09.00–22.00');
  assert.equal(formatHours('09.00–22.00', 'en'), '09:00–22:00');
  assert.equal(formatHours('09:00–22:00', 'id'), '09.00–22.00');
  assert.equal(formatHours('Senin tutup', 'en'), 'Senin tutup');
});

test('formatRating in both languages', () => {
  assert.equal(formatRating(4.9, '1146', 'id'), '4.9 (1.146)');
  assert.equal(formatRating(4.9, '1146', 'en'), '4.9 (1,146)');
  assert.equal(formatRating(4.9, '1.146', 'en'), '4.9 (1,146)');
  assert.equal(formatRating(4.6, '1234567', 'id'), '4.6 (1.234.567)');
  assert.equal(formatRating(5, '643', 'en'), '5.0 (643)');
  assert.equal(formatRating(4.8, '', 'id'), '4.8');
  assert.equal(formatRating(4.8, null, 'en'), '4.8');
  assert.equal(formatRating(null, '100', 'id'), null);
});

test('relativeTime counts calendar days', () => {
  const now = new Date(2026, 9, 14, 10, 0).getTime();
  const daysAgo = (n) => new Date(2026, 9, 14 - n, 9, 0).getTime();
  assert.equal(relativeTime(daysAgo(0), 'id', now), 'diubah hari ini');
  assert.equal(relativeTime(daysAgo(2), 'id', now), 'diubah 2 hari lalu');
  assert.equal(relativeTime(daysAgo(2), 'en', now), 'edited 2 days ago');
  assert.equal(relativeTime(daysAgo(1), 'en', now), 'edited yesterday');
  assert.equal(relativeTime(daysAgo(21), 'id', now), 'diubah 3 minggu lalu');
  assert.equal(relativeTime(daysAgo(21), 'en', now), 'edited 3 weeks ago');
  assert.equal(relativeTime(daysAgo(8), 'en', now), 'edited 1 week ago');
});
