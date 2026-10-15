import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeList, decodeList, sanitizeList, listUrl, CodecError } from '../js/codec.js';
import { sampleList, LIMITS } from '../js/data.js';

const toB64url = (text) => Buffer.from(text, 'utf8').toString('base64url');
const jPayload = (data) => '1j' + toB64url(JSON.stringify(data));

// Everything except the fresh place ids and timestamps must survive.
// Perks travel as a bitmask, so they come back in the fixed PERKS order.
const comparable = (raw) => {
  const list = sanitizeList(raw, { keepIds: true });
  return {
    id: list.id,
    title: list.title,
    from: list.from,
    places: list.places.map(({ id, ...rest }) => rest),
  };
};

function trickyList() {
  const list = sampleList('id');
  list.title = 'Nongkrong & ngopi #1 + "temen" \'kantor\'';
  list.places[0].note = 'Baris satu\nBaris dua & #tiga + "empat" 🎉';
  list.places[1].name = 'Kopi "Kenangan" & Teman #2 + 1';
  list.places[1].custom = ['Ada 🐈', 'A&B'];
  list.places[2].maps = 'https://www.google.com/maps/place/Arrah+Coffee/@-6.88,107.59,17z';
  return list;
}

test('round trip keeps the sample list, including emoji, &, #, +, quotes and newlines', async () => {
  for (const list of [sampleList('id'), sampleList('en'), trickyList()]) {
    const payload = await encodeList(list);
    assert.match(payload, /^1[zj][A-Za-z0-9_-]+$/);
    const back = await decodeList(payload);
    assert.deepEqual(comparable(back), comparable(list));
    assert.equal(back.sharedAt, null);
  }
});

test('decoded places get fresh, unique ids', async () => {
  const list = sampleList('en');
  const back = await decodeList(await encodeList(list));
  const ids = back.places.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]{8}$/);
    assert.ok(!list.places.some((p) => p.id === id));
  }
});

test('short Maps links are compacted in the payload', async () => {
  const payload = await encodeList(sampleList('id'));
  const json = payload[1] === 'j'
    ? Buffer.from(payload.slice(2), 'base64url').toString('utf8')
    : await inflate(payload.slice(2));
  assert.ok(json.includes('"~56P8rmgQGzV3mhrY7"'));
  assert.ok(!json.includes('maps.app.goo.gl'));
});

async function inflate(b64) {
  const stream = new Blob([Buffer.from(b64, 'base64url')]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

test('compressed payload is shorter than the plain JSON one', async () => {
  const payload = await encodeList(sampleList('id'));
  assert.equal(payload[1], 'z');
  // The same JSON, sent as mode 'j'.
  const plain = '1j' + toB64url(await inflate(payload.slice(2)));
  assert.ok(payload.length < plain.length, `${payload.length} < ${plain.length}`);
  assert.deepEqual(comparable(await decodeList(plain)), comparable(await decodeList(payload)));
});

test("mode 'j' payloads decode", async () => {
  const payload = jPayload([1, 'abc12345', 'Makan & ngopi', 'Dimas', [
    ['Warung #1', '🍜', 6, 'Jl. Braga', '10.00–21.00', 45, '1200', 0b11, ['Murah'], 'Enak\nbanget', '~abcDEF123'],
  ]]);
  const list = await decodeList(payload);
  assert.equal(list.id, 'abc12345');
  assert.equal(list.title, 'Makan & ngopi');
  assert.equal(list.from, 'Dimas');
  const [p] = list.places;
  assert.equal(p.name, 'Warung #1');
  assert.equal(p.color, 'teal');
  assert.equal(p.rating, 4.5);
  assert.equal(p.ratingCount, '1200');
  assert.deepEqual(p.perks, ['wifi', 'plug']);
  assert.deepEqual(p.custom, ['Murah']);
  assert.equal(p.note, 'Enak\nbanget');
  assert.equal(p.maps, 'https://maps.app.goo.gl/abcDEF123');
});

test('malicious payloads are sanitized', async () => {
  const long = 'x'.repeat(600);
  const row = (i) => [
    `Tempat ${i} ${long}`, '<img src=x>', 99, long, long, 999, '12abc34' + long, 0xffffff,
    [long, 7, null, 'a', 'b', 'c', 'd', 'e', 'f'], long, 'javascript:alert(1)',
  ];
  const rows = Array.from({ length: 50 }, (_, i) => row(i));
  rows[1][10] = 'http://maps.app.goo.gl/abc';
  rows[2][10] = 'https://evil.example/maps/place/x';
  rows[3][10] = 'https://maps.google.evil.com/x';
  rows[4][10] = 'https://www.google.com/maps/place/OK';
  const list = await decodeList(jPayload([1, '<script>', long, long, rows]));

  assert.equal(list.places.length, LIMITS.places);
  assert.match(list.id, /^[a-z0-9]{8}$/);
  assert.equal(Array.from(list.title).length, LIMITS.title);
  assert.equal(Array.from(list.from).length, LIMITS.from);
  for (const p of list.places) {
    assert.ok(Array.from(p.name).length <= LIMITS.name);
    assert.ok(Array.from(p.address).length <= LIMITS.address);
    assert.ok(Array.from(p.hours).length <= LIMITS.hours);
    assert.ok(Array.from(p.note).length <= LIMITS.note);
    assert.ok(p.custom.length <= LIMITS.custom);
    for (const c of p.custom) assert.ok(Array.from(c).length <= LIMITS.customLen);
    assert.equal(p.emoji, '🛋️');
    assert.equal(p.color, 'orange');
    assert.equal(p.rating, 5, "clamped to 0–5");
    assert.ok(p.ratingCount.length <= 9 && /^\d*$/.test(p.ratingCount));
    assert.equal(p.perks.length, 10);
  }
  assert.equal(list.places[0].maps, '');
  assert.equal(list.places[1].maps, '');
  assert.equal(list.places[2].maps, '');
  assert.equal(list.places[3].maps, '');
  assert.equal(list.places[4].maps, 'https://www.google.com/maps/place/OK');
});

test('oversized payloads are refused', async () => {
  const huge = jPayload([1, 'abc', 't', 'f', [['x'.repeat(300 * 1024)]]]);
  await assert.rejects(decodeList(huge), (err) => err instanceof CodecError && err.code === 'corrupt');
});

test('perks come back as the same set', async () => {
  const list = sampleList('id');
  const back = await decodeList(await encodeList(list));
  assert.deepEqual(back.places.map((p) => [...p.perks].sort()), list.places.map((p) => [...p.perks].sort()));
});

test('sanitizeList drops nameless places and non-objects, and fixes types', () => {
  const list = sanitizeList({
    id: 'ok123', title: 42, from: { evil: true },
    places: [null, 'str', [1, 2], { name: '' }, { name: '  Kopi  ', rating: '4,7', perks: ['wifi', 'nope', 'wifi'], custom: 'x' }],
  });
  assert.equal(list.title, '42');
  assert.equal(list.from, '');
  assert.equal(list.places.length, 1);
  const [p] = list.places;
  assert.equal(p.name, 'Kopi');
  assert.equal(p.rating, 4.7);
  assert.deepEqual(p.perks, ['wifi']);
  assert.deepEqual(p.custom, []);
  assert.throws(() => sanitizeList(null), CodecError);
});

test('wrong version and garbage throw CodecError with a code', async () => {
  const cases = [
    ['2zAAAA', 'version'],
    [jPayload([2, 'a', 'b', 'c', []]), 'version'],
    ['1jnot*base64', 'corrupt'],
    ['1j' + toB64url('{not json'), 'corrupt'],
    ['1j' + toB64url('{"a":1}'), 'corrupt'],
    ['1zAAAAAAAAAAAA', 'corrupt'],
    ['', 'corrupt'],
    ['hello', 'corrupt'],
  ];
  for (const [payload, code] of cases) {
    await assert.rejects(decodeList(payload), (err) => err instanceof CodecError && err.code === code, payload);
  }
});

test('truncated compressed payload is reported as corrupt', async () => {
  const payload = await encodeList(sampleList('id'));
  await assert.rejects(decodeList(payload.slice(0, payload.length / 2)), (err) => err instanceof CodecError);
});

test('listUrl puts the payload in the fragment', () => {
  assert.equal(listUrl('1zABC', 'https://example.org/jadi-kemana/'), 'https://example.org/jadi-kemana/#d=1zABC');
  assert.equal(listUrl('1zABC', 'https://example.org/app/#/old'), 'https://example.org/app/#d=1zABC');
});

test('unsafe Maps values are dropped and safe ones stored as the canonical href', () => {
  const list = sanitizeList({
    places: [
      { name: 'A', maps: 'https://maps.app.goo.gl/abc\n\nPROMO: https://evil.example/login' },
      { name: 'B', maps: 'https://www.google.com/maps/place/A B' },
      { name: 'C', maps: 'https://maps.app.goo.gl/abc‮' },
      { name: 'D', maps: '  https://MAPS.APP.GOO.GL/abc  ' },
      { name: 'E', maps: 'https://maps.google.com?q=x' },
    ],
  });
  assert.deepEqual(list.places.map((p) => p.maps), ['', '', '', 'https://maps.app.goo.gl/abc', 'https://maps.google.com/?q=x']);
});

test('emoji with stacked combining marks or stray format characters is replaced', () => {
  const zalgo = '☕́̂̃̄';
  const cases = [zalgo, '☕​', '☕‮', '☕☕'];
  const list = sanitizeList({ places: cases.map((emoji, i) => ({ name: `P${i}`, emoji })) });
  for (const p of list.places) assert.equal(p.emoji, '🛋️', p.name);
  // VS16, ZWJ sequences and skin tones are still fine.
  const ok = ['☁️', '🧑‍💻', '👍🏽'];
  const good = sanitizeList({ places: ok.map((emoji, i) => ({ name: `Q${i}`, emoji })) });
  assert.deepEqual(good.places.map((p) => p.emoji), ok);
});

test('a rating of 0 is the same as no rating, and 0.1–5.0 round-trips', async () => {
  const ratings = [0, -1, 0.04, '0', 0.1, 0.3, 0.7, 1.15, 2.9, 4.95, 5];
  const list = sanitizeList({ places: ratings.map((rating, i) => ({ name: `P${i}`, rating })) });
  assert.deepEqual(list.places.map((p) => p.rating), [null, null, null, null, 0.1, 0.3, 0.7, 1.2, 2.9, 5, 5]);
  const back = await decodeList(await encodeList(list));
  assert.deepEqual(back.places.map((p) => p.rating), list.places.map((p) => p.rating));
  for (let x10 = 1; x10 <= 50; x10++) {
    const one = sanitizeList({ places: [{ name: 'x', rating: x10 / 10 }] });
    const [p] = (await decodeList(await encodeList(one))).places;
    assert.equal(p.rating, x10 / 10);
  }
});

test('a menu link round-trips; old links without it and unsafe ones come back as no menu', async () => {
  const list = sanitizeList({
    places: [
      { name: 'A', menu: 'https://drive.google.com/file/d/abc/view?usp=sharing' },
      { name: 'B', menu: 'javascript:alert(1)' },
      { name: 'C', menu: 'https://google.com@evil.example/' },
      { name: 'D' },
    ],
  });
  assert.deepEqual(list.places.map((p) => p.menu), ['https://drive.google.com/file/d/abc/view?usp=sharing', '', '', '']);
  const back = await decodeList(await encodeList(list));
  assert.deepEqual(back.places.map((p) => p.menu), list.places.map((p) => p.menu));

  // A link from before menus existed: each place has 11 fields.
  const old = '1j' + Buffer.from(JSON.stringify([1, 'old00001', 'Lama', '', [['Kopi', '☕', 0, '', '', 0, '', 0, [], '', '']]])).toString('base64url');
  assert.equal((await decodeList(old)).places[0].menu, '');
  // A crafted 12th field is checked like any other input.
  const evil = '1j' + Buffer.from(JSON.stringify([1, 'evil0001', 'X', '', [['Kopi', '☕', 0, '', '', 0, '', 0, [], '', '', 'javascript:alert(1)']]])).toString('base64url');
  assert.equal((await decodeList(evil)).places[0].menu, '');
});

test('a link carries when its list last changed; older links and odd values give null', async () => {
  const changed = Date.UTC(2026, 9, 14, 8, 30);
  const list = sanitizeList({ title: 'Waktu', places: [{ name: 'A' }], createdAt: changed - 1000, updatedAt: changed });
  const back = await decodeList(await encodeList(list));
  assert.equal(back.linkTime, changed);
  assert.equal(back.updatedAt, changed);

  const raw = (extra) =>
    '1j' + Buffer.from(JSON.stringify([1, 'time0001', 'T', '', [['A', '☕', 0, '', '', 0, '', 0, [], '', '']], ...extra])).toString('base64url');
  assert.equal((await decodeList(raw([]))).linkTime, null, 'a link from before the time field');
  for (const odd of ['yesterday', -5, 0, Date.UTC(2020, 0, 1), Date.now() + 7 * 24 * 3600 * 1000, 1e20]) {
    assert.equal((await decodeList(raw([odd]))).linkTime, null, String(odd));
  }
});
