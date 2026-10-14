import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autofillState, oneLine, mapsFromLink, pasteLink, editLink, editField, holdLink, readLink, lookupAddress, statusMessage,
} from '../js/autofill.js';

const KINTERRA_URL = 'https://www.google.com/maps/place/Kinterra+Coffee+%26+Space/@-6.9280646,107.6191791,17z/data=!3m1!4b1!4m6!3m5!1s0x2e68e94e77562653:0x4d1ea46c7407cf2b!8m2!3d-6.9280646!4d107.6217594!16s%2Fg%2F11ymt7s3t5';
const HIBREW_URL = 'https://www.google.com/maps/place/HI+Brew+Coffee/@-6.88,107.59,17z/data=!4m6!3m5!1s0x0:0x1!8m2!3d-6.8801!4d107.5901';
const SHORT_URL = 'https://maps.app.goo.gl/56P8rmgQGzV3mhrY7';
const SHARE_TEXT = `Kinterra Coffee & Space\nJl. Talaga Bodas No.27, Lengkong, Bandung\n${SHORT_URL}`;

/** A form state as the place form makes it: the place plus the auto-fill fields. */
const formState = (place = {}) => ({ place: { name: '', address: '', maps: '', ...place }, ...autofillState(place.maps) });

/** Just the name/address flags (the panel-only fields are tested separately). */
const pick = (flags) => ({ name: flags.name, address: flags.address });

/** A stand-in for geo.approxAddress that answers `address`. */
const answer = (address) => async () => address;

test('a full Maps URL fills the name at once, then the address from the pin', async () => {
  const state = formState();
  editLink(state, KINTERRA_URL);
  assert.ok(state.place.maps.startsWith('https://www.google.com/maps/place/Kinterra'));

  const { status, coords } = readLink(state);
  assert.equal(status, 'filled');
  assert.equal(state.status, 'filled');
  assert.equal(state.place.name, 'Kinterra Coffee & Space');
  assert.deepEqual(pick(state.auto), { name: true, address: false });
  assert.deepEqual(pick(state.filled), { name: true, address: false });
  assert.deepEqual(coords, { lat: -6.9280646, lng: 107.6217594 });
  assert.equal(statusMessage(state), 'filledName');

  let asked = null;
  const pending = lookupAddress(state, coords, 'en', async (lat, lng, lang) => {
    asked = { lat, lng, lang };
    return 'Jl. Talaga Bodas, Lengkong, Bandung';
  });
  assert.equal(state.approx, 'loading');
  assert.equal(await pending, true);
  assert.deepEqual(asked, { lat: -6.9280646, lng: 107.6217594, lang: 'en' });
  assert.equal(state.place.address, 'Jl. Talaga Bodas, Lengkong, Bandung');
  assert.equal(state.approx, 'done');
  assert.deepEqual(pick(state.auto), { name: true, address: true });
  assert.deepEqual(pick(state.filled), { name: true, address: true });
  assert.equal(statusMessage(state), 'filledBoth');
});

test('no address from the lookup leaves the field empty', async () => {
  const state = formState();
  editLink(state, KINTERRA_URL);
  const { coords } = readLink(state);
  assert.equal(await lookupAddress(state, coords, 'id', answer(null)), true);
  assert.equal(state.place.address, '');
  assert.equal(state.approx, 'none');
  assert.equal(statusMessage(state), 'filledName');
});

test('typed fields are never overwritten', async () => {
  const state = formState();
  editField(state, 'name', 'Kopi Kita');
  editField(state, 'address', 'Jl. Dago No.1');
  editLink(state, KINTERRA_URL);
  const { status, coords } = readLink(state);
  assert.equal(status, 'filled');
  assert.equal(coords, null); // the address is already there
  assert.equal(state.place.name, 'Kopi Kita');
  assert.equal(state.place.address, 'Jl. Dago No.1');
  assert.deepEqual(pick(state.auto), { name: false, address: false });
  assert.equal(statusMessage(state), 'linkSaved');

  // Editing an auto-filled value makes it the user's: the next link leaves it alone.
  const edited = formState();
  editLink(edited, KINTERRA_URL);
  readLink(edited);
  editField(edited, 'name', 'Kinterra (lantai 2)');
  editLink(edited, HIBREW_URL);
  readLink(edited);
  assert.equal(edited.place.name, 'Kinterra (lantai 2)');

  // Typing the address while the lookup is on its way wins over its answer.
  const racing = formState();
  editLink(racing, KINTERRA_URL);
  const pending = lookupAddress(racing, readLink(racing).coords, 'id', answer('Jl. Talaga Bodas'));
  editField(racing, 'address', 'Jl. Punyaku');
  assert.equal(racing.approx, 'none');
  assert.equal(await pending, false);
  assert.equal(racing.place.address, 'Jl. Punyaku');
  assert.equal(racing.auto.address, false);
});

test('a new link clears what the previous link filled in', async () => {
  const state = formState();
  editLink(state, KINTERRA_URL);
  const first = readLink(state);
  await lookupAddress(state, first.coords, 'id', answer('Jl. Talaga Bodas, Lengkong, Bandung'));

  const changed = editLink(state, HIBREW_URL);
  assert.deepEqual(changed, { lookup: false, status: true });
  assert.equal(state.status, 'idle');

  const { status, coords } = readLink(state);
  assert.equal(status, 'filled');
  assert.equal(state.place.name, 'HI Brew Coffee');
  assert.equal(state.place.address, ''); // Kinterra's address is gone…
  assert.equal(state.approx, 'none');
  assert.deepEqual(coords, { lat: -6.8801, lng: 107.5901 }); // …and HI Brew's is looked up instead
  assert.deepEqual(pick(state.auto), { name: true, address: false });
});

test('a short link alone clears the auto values and reports short', async () => {
  const state = formState();
  editLink(state, KINTERRA_URL);
  const pending = lookupAddress(state, readLink(state).coords, 'id', answer('Jl. Talaga Bodas'));

  editLink(state, SHORT_URL);
  const { status, coords } = readLink(state);
  assert.equal(status, 'short');
  assert.equal(state.status, 'short');
  assert.equal(coords, null);
  assert.equal(state.place.maps, SHORT_URL);
  assert.equal(state.place.name, '');
  assert.equal(state.place.address, '');
  assert.deepEqual(pick(state.auto), { name: false, address: false });
  assert.deepEqual(pick(state.filled), { name: false, address: false });
  assert.equal(statusMessage(state), 'shortMsg');
  assert.equal(await pending, false); // the old link's lookup no longer counts
  assert.equal(state.place.address, '');
});

test('non-Maps input is refused and keeps no Maps link', () => {
  const state = formState({ name: 'Kopi Kita' });
  editLink(state, 'https://example.com/maps/place/Kopi');
  assert.equal(mapsFromLink(state), null);
  assert.equal(state.place.maps, '');

  assert.equal(readLink(state).status, 'invalid');
  assert.equal(state.status, 'invalid');
  assert.equal(statusMessage(state), 'notMaps');
  assert.equal(state.place.name, 'Kopi Kita');

  // Typing again clears the error.
  assert.deepEqual(editLink(state, 'https://example.com/maps/place/Kop'), { lookup: false, status: true });
  assert.equal(state.status, 'idle');
});

test('an empty link field reads nothing and shows the help', () => {
  const state = formState();
  assert.deepEqual(readLink(state), { status: 'empty', coords: null });
  assert.equal(state.status, 'idle');
  assert.equal(mapsFromLink(state), '');
  assert.equal(statusMessage(state), 'emptyHelp');
  editLink(state, 'x');
  assert.equal(statusMessage(state), null);
});

test('share text fills the name and address from its lines', () => {
  const state = formState();
  pasteLink(state, SHARE_TEXT);
  assert.equal(state.link, `Kinterra Coffee & Space Jl. Talaga Bodas No.27, Lengkong, Bandung ${SHORT_URL}`);
  assert.equal(state.link, oneLine(SHARE_TEXT));

  const { status, coords } = readLink(state);
  assert.equal(status, 'filled');
  assert.equal(coords, null); // a short link has no pin
  assert.equal(state.place.maps, SHORT_URL);
  assert.equal(state.place.name, 'Kinterra Coffee & Space');
  assert.equal(state.place.address, 'Jl. Talaga Bodas No.27, Lengkong, Bandung');
  assert.deepEqual(pick(state.auto), { name: true, address: true });
  assert.equal(statusMessage(state), 'filledBoth');

  // The same text pasted into the field (which flattens it) still reads its lines.
  const typed = formState();
  editLink(typed, oneLine(SHARE_TEXT), SHARE_TEXT);
  readLink(typed);
  assert.equal(typed.place.name, 'Kinterra Coffee & Space');
  assert.equal(typed.place.address, 'Jl. Talaga Bodas No.27, Lengkong, Bandung');
});

// A made-up place panel, as copied from the Google Maps website (no link in it).
const PANEL = `Kopi Contoh Sejahtera\n4,6\n(1.234)·Rp 25–50.000\nKedai Kopi\nDirections\nSave\nJl. Contoh Raya No.12, Sukasari, Kec. Coblong, Kota Bandung, Jawa Barat 40135\nOpen 24 hours\n0812-0000-0000`;
const panelState = () => ({ ...formState(), rating: '', place: { name: '', address: '', maps: '', hours: '', ratingCount: '' } });

test('a pasted place panel fills name, address, rating, review count and hours', () => {
  const state = panelState();
  pasteLink(state, PANEL);
  assert.equal(readLink(state).status, 'filled');
  assert.equal(state.place.name, 'Kopi Contoh Sejahtera');
  assert.equal(state.place.address, 'Jl. Contoh Raya No.12, Sukasari, Kec. Coblong, Kota Bandung');
  assert.equal(state.rating, '4.6');
  assert.equal(state.place.ratingCount, '1234');
  assert.equal(state.place.hours, 'open24');
  assert.ok(state.place.maps.startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.equal(statusMessage(state), 'filledDetails');
});

test('a typed rating is never overwritten by a pasted panel', () => {
  const state = panelState();
  editField(state, 'rating', '4.9');
  pasteLink(state, PANEL);
  readLink(state);
  assert.equal(state.rating, '4.9');
  assert.equal(state.auto.rating, false);
});

test('panel text pasted over a held short link keeps the short link for the Maps button', () => {
  const state = panelState();
  editLink(state, SHORT_URL);
  assert.equal(readLink(state).status, 'short');
  holdLink(state); // "Tempel info tempatnya"
  editLink(state, 'x', PANEL);
  pasteLink(state, PANEL);
  readLink(state);
  assert.equal(state.place.maps, SHORT_URL);
  assert.equal(mapsFromLink(state), SHORT_URL);
  assert.equal(state.place.name, 'Kopi Contoh Sejahtera');
  // Typing a different link releases the held one.
  editLink(state, HIBREW_URL);
  assert.equal(state.keepLink, '');
  assert.ok(mapsFromLink(state).includes('HI+Brew'));
});
