import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  waLink, placeMessage, randomMessage, compareMessage, listMessage,
  isSafeMapsUrl, isShortMapsUrl, canonicalMapsUrl, parseMapsInput,
} from '../js/links.js';
import { sampleList } from '../js/data.js';

const [kinterra, hibrew] = sampleList('id').places;
const KINTERRA_URL = 'https://www.google.com/maps/place/Kinterra+Coffee+%26+Space/@-6.9280646,107.6191791,17z/data=!3m1!4b1!4m6!3m5!1s0x2e68e94e77562653:0x4d1ea46c7407cf2b!8m2!3d-6.9280646!4d107.6217594!16s%2Fg%2F11ymt7s3t5';

test('waLink encodes &, #, + and emoji, and never uses wa.me', () => {
  const text = 'A & B #1 + C 🛋️\nnext';
  const link = waLink(text);
  assert.ok(link.startsWith('https://api.whatsapp.com/send?text='));
  assert.ok(!link.includes('wa.me'));
  const encoded = link.slice('https://api.whatsapp.com/send?text='.length);
  assert.ok(!/[&#+ \n]/.test(encoded));
  assert.ok(encoded.includes('%26') && encoded.includes('%23') && encoded.includes('%2B') && encoded.includes('%0A'));
  assert.equal(new URL(link).searchParams.get('text'), text);
});

test('place message matches the template exactly', () => {
  assert.equal(
    placeMessage(kinterra, 'id'),
    '*Kinterra Coffee & Space*\n📍 Jl. Talaga Bodas No.27, Lengkong, Bandung\nKayaknya oke nih, gimana menurut kalian?\nhttps://maps.app.goo.gl/56P8rmgQGzV3mhrY7',
  );
  assert.equal(
    placeMessage(kinterra, 'en'),
    '*Kinterra Coffee & Space*\n📍 Jl. Talaga Bodas No.27, Lengkong, Bandung\nLooks good, what do you think?\nhttps://maps.app.goo.gl/56P8rmgQGzV3mhrY7',
  );
});

test('random message matches the template exactly', () => {
  assert.equal(
    randomMessage(hibrew, 'id'),
    'Pada jawab "terserah", yaudah aku yang pilihin: *HI Brew Coffee*!\n📍 Jl. Boscha No.43, Pasteur, Bandung\nGas nggak nih?\nhttps://maps.app.goo.gl/f52J378v6Zn7hWh39',
  );
  assert.equal(
    randomMessage(hibrew, 'en'),
    'Everyone said "whatever", so I picked: *HI Brew Coffee*!\n📍 Jl. Boscha No.43, Pasteur, Bandung\nShall we go?\nhttps://maps.app.goo.gl/f52J378v6Zn7hWh39',
  );
});

test('compare message matches the template exactly', () => {
  assert.equal(
    compareMessage(kinterra, hibrew, 'id'),
    '*Kinterra Coffee & Space* atau *HI Brew Coffee*? 🤔\n\nA: Jl. Talaga Bodas No.27, Lengkong, Bandung\nhttps://maps.app.goo.gl/56P8rmgQGzV3mhrY7\n\nB: Jl. Boscha No.43, Pasteur, Bandung\nhttps://maps.app.goo.gl/f52J378v6Zn7hWh39\n\nPilih yang mana nih?',
  );
  assert.equal(
    compareMessage(kinterra, hibrew, 'en'),
    '*Kinterra Coffee & Space* or *HI Brew Coffee*? 🤔\n\nA: Jl. Talaga Bodas No.27, Lengkong, Bandung\nhttps://maps.app.goo.gl/56P8rmgQGzV3mhrY7\n\nB: Jl. Boscha No.43, Pasteur, Bandung\nhttps://maps.app.goo.gl/f52J378v6Zn7hWh39\n\nWhich one?',
  );
});

test('list message matches the template exactly', () => {
  const link = 'https://example.org/jadi-kemana/#d=1zABC';
  assert.equal(
    listMessage(sampleList('id'), link, 'id'),
    `Jadi kemana? 👀 Aku udah kumpulin 5 tempat buat "Contoh: Spot WFC Bandung":\n${link}\nBuka, terus bahas yang kalian suka ya!`,
  );
  assert.equal(
    listMessage(sampleList('en'), link, 'en'),
    `So, where are we going? 👀 I put together 5 places for "Example: Bandung work-from-cafe spots":\n${link}\nOpen it and bring up the ones you like!`,
  );
});

test('the Maps link is the first URL in a place message', () => {
  const sneaky = { ...kinterra, name: 'Kopi https://evil.example', address: 'see http://evil.example/x' };
  for (const msg of [placeMessage(sneaky, 'id'), randomMessage(sneaky, 'en'), placeMessage(kinterra, 'en')]) {
    const first = msg.match(/https?:\/\/\S+/)[0];
    assert.equal(first, kinterra.maps);
  }
});

test('empty lines are left out', () => {
  const bare = { ...kinterra, address: '', maps: '' };
  assert.equal(placeMessage(bare, 'id'), '*Kinterra Coffee & Space*\nKayaknya oke nih, gimana menurut kalian?');
  assert.equal(randomMessage({ ...hibrew, maps: '' }, 'en'), 'Everyone said "whatever", so I picked: *HI Brew Coffee*!\n📍 Jl. Boscha No.43, Pasteur, Bandung\nShall we go?');
  assert.equal(
    compareMessage(bare, hibrew, 'en'),
    '*Kinterra Coffee & Space* or *HI Brew Coffee*? 🤔\n\nB: Jl. Boscha No.43, Pasteur, Bandung\nhttps://maps.app.goo.gl/f52J378v6Zn7hWh39\n\nWhich one?',
  );
  assert.equal(placeMessage({ ...kinterra, maps: 'javascript:alert(1)' }, 'en').includes('javascript'), false);
});

test('isSafeMapsUrl accepts only https Google Maps hosts', () => {
  for (const url of [
    'https://maps.app.goo.gl/56P8rmgQGzV3mhrY7',
    'https://goo.gl/maps/abc',
    'https://www.google.com/maps/place/X',
    'https://google.com/maps?q=x',
    'https://maps.google.com/?q=x',
    'https://maps.google.co.id/maps?q=x',
    KINTERRA_URL,
  ]) assert.ok(isSafeMapsUrl(url), url);
  for (const url of [
    'http://maps.app.goo.gl/abc',
    'javascript:alert(1)',
    'https://goo.gl/abc',
    'https://www.google.com/search?q=x',
    'https://maps.google.evil.com/x',
    'https://evil.com/maps/place/x',
    'https://user:pw@www.google.com/maps',
    'https://maps.app.goo.gl/',
    '',
    null,
  ]) assert.ok(!isSafeMapsUrl(url), String(url));
});

test('parseMapsInput reads the full Kinterra URL', () => {
  const r = parseMapsInput(KINTERRA_URL);
  assert.equal(r.url, KINTERRA_URL);
  assert.equal(r.short, false);
  assert.equal(r.name, 'Kinterra Coffee & Space');
  assert.equal(r.lat, -6.9280646);
  assert.equal(r.lng, 107.6217594);
  assert.equal(r.address, '');
});

test('parseMapsInput flags a short link', () => {
  const r = parseMapsInput('  https://maps.app.goo.gl/56P8rmgQGzV3mhrY7  ');
  assert.equal(r.url, 'https://maps.app.goo.gl/56P8rmgQGzV3mhrY7');
  assert.equal(r.short, true);
  assert.equal(r.name, '');
  assert.equal(r.lat, null);
});

test('parseMapsInput reads share text', () => {
  const text = 'Kinterra Coffee & Space\nJl. Talaga Bodas No.27, Lengkong, Bandung\n\nhttps://maps.app.goo.gl/56P8rmgQGzV3mhrY7';
  const r = parseMapsInput(text);
  assert.equal(r.url, 'https://maps.app.goo.gl/56P8rmgQGzV3mhrY7');
  assert.equal(r.short, true);
  assert.equal(r.name, 'Kinterra Coffee & Space');
  assert.equal(r.address, 'Jl. Talaga Bodas No.27, Lengkong, Bandung');
});

test('parseMapsInput reads search and ?q= forms', () => {
  assert.equal(parseMapsInput('https://www.google.com/maps/search/Arrah+Coffee+Sukajadi').name, 'Arrah Coffee Sukajadi');
  assert.equal(parseMapsInput('https://maps.google.com/?q=HI+Brew+Coffee').name, 'HI Brew Coffee');
  const pin = parseMapsInput('https://www.google.com/maps?q=-6.92,107.62');
  assert.equal(pin.name, '');
  assert.equal(pin.lat, -6.92);
  assert.equal(pin.lng, 107.62);
});

test('parseMapsInput returns null for junk', () => {
  for (const junk of ['', '   ', 'hello world', 'https://example.com/maps/place/X', 'javascript:alert(1)', 'http://evil.com', null, 42]) {
    assert.equal(parseMapsInput(junk), null, String(junk));
  }
});

test('isSafeMapsUrl rejects whitespace, control and bidi characters', () => {
  for (const url of [
    'https://maps.app.goo.gl/abc\n\nPROMO: https://evil.example/login',
    'https://maps.app.goo.gl/abc\tx',
    'https://maps.app.goo.gl/abc\r',
    'https://www.google.com/maps/place/A B',
    'https://maps.app.goo.gl/abc‮evil',
    'https://maps.app.goo.gl/abc⁦x⁩',
    'https://maps.app.goo.gl/abc​',
    '﻿https://maps.app.goo.gl/abc',
  ]) {
    assert.ok(!isSafeMapsUrl(url), JSON.stringify(url));
    assert.equal(canonicalMapsUrl(url), '', JSON.stringify(url));
  }
});

test('canonicalMapsUrl returns the parsed href', () => {
  assert.equal(canonicalMapsUrl('https://MAPS.APP.GOO.GL/abc'), 'https://maps.app.goo.gl/abc');
  assert.equal(canonicalMapsUrl('https://maps.google.com?q=x'), 'https://maps.google.com/?q=x');
  assert.equal(canonicalMapsUrl(KINTERRA_URL), KINTERRA_URL);
  assert.equal(parseMapsInput('Kopi\nhttps://MAPS.APP.GOO.GL/abc').url, 'https://maps.app.goo.gl/abc');
});

test('a message never carries a Maps value with a newline in it', () => {
  const sneaky = { ...kinterra, maps: 'https://maps.app.goo.gl/abc\n\nPROMO: https://evil.example/login' };
  const msg = placeMessage(sneaky, 'en');
  assert.ok(!msg.includes('evil'));
  assert.ok(!msg.includes('maps.app.goo.gl'));
});

test('URLs and bare domains in user text never come before the Maps link', () => {
  const names = ['Kopihttps://evil.example', 'Kopi_https://evil.example/x', 'www.evil.example', 'Promo bit.ly/x', 'hthttps://tps://evil.example'];
  for (const name of names) {
    const place = { ...kinterra, name, address: 'see www.evil.example or evil.co.id/login' };
    for (const msg of [placeMessage(place, 'id'), randomMessage(place, 'en'), compareMessage(place, hibrew, 'en')]) {
      assert.equal(msg.match(/https?:\/\/\S+/)[0], kinterra.maps, name);
      assert.ok(!/\b[a-z0-9-]+\.[a-z]{2,}/i.test(msg.replace(/https?:\/\/\S+/g, '')), msg);
    }
  }
  const title = listMessage({ ...sampleList('en'), title: 'go www.evil.example' }, 'https://example.org/#d=1', 'en');
  assert.ok(title.includes('www․evil․example'));
});

test('normal address text and numbers keep their dots', () => {
  const place = { ...kinterra, name: 'Kopi 4.9 rating', address: 'Jl. Talaga Bodas No.27, buka 09.00 Gg. Mawar' };
  const msg = placeMessage(place, 'id');
  assert.ok(msg.includes('*Kopi 4.9 rating*'));
  assert.ok(msg.includes('📍 Jl. Talaga Bodas No.27, buka 09.00 Gg. Mawar'));
});

test("parseMapsInput keeps apostrophes in the URL (McDonald's)", () => {
  const url = "https://www.google.com/maps/place/McDonald's+Braga/@-6.9175,107.6091,17z/data=!3m1!4b1!4m6!3m5!1s0x2e68e63e!8m2!3d-6.9175!4d107.6091!16s%2Fg%2F1";
  const r = parseMapsInput(url);
  assert.equal(r.url, url);
  assert.equal(r.short, false);
  assert.equal(r.name, "McDonald's Braga");
  assert.equal(r.lat, -6.9175);
  assert.equal(r.lng, 107.6091);
  assert.equal(r.address, '');
  // Trailing punctuation and quotes are not part of the URL.
  assert.equal(parseMapsInput(`Lihat "${url}".`).url, url);
});

test('parseMapsInput accepts every Google share format people actually paste', () => {
  const short = 'https://maps.app.goo.gl/56P8rmgQGzV3mhrY7';
  // Tracking parameters are dropped, so list links stay short.
  const tagged = parseMapsInput(`${short}?g_st=ic`);
  assert.equal(tagged.url, short);
  assert.equal(tagged.short, true);
  assert.equal(tagged.name, '');
  // Google's newer share links.
  assert.equal(parseMapsInput('https://share.google/AbCdEfGh1234567')?.short, true);
  // Country domains such as google.co.id.
  const coId = parseMapsInput('https://www.google.co.id/maps/place/Kinterra+Coffee+%26+Space/@-6.928,107.62,17z');
  assert.equal(coId?.name, 'Kinterra Coffee & Space');
  assert.equal(coId?.short, false);
  // Android share text: name, address, then the link.
  const shared = parseMapsInput(`Kinterra Coffee & Space\nJl. Talaga Bodas No.27, Lengkong, Bandung\n${short}`);
  assert.equal(shared.name, 'Kinterra Coffee & Space');
  assert.equal(shared.address, 'Jl. Talaga Bodas No.27, Lengkong, Bandung');
  assert.equal(shared.short, true);
  // One line: split at the first comma.
  const oneLine = parseMapsInput(`Kinterra Coffee & Space, Jl. Talaga Bodas No.27 ${short}`);
  assert.equal(oneLine.name, 'Kinterra Coffee & Space');
  assert.equal(oneLine.address, 'Jl. Talaga Bodas No.27');
  // Words after the link are chat, not a place name.
  assert.equal(parseMapsInput(`Cek ini ${short} ya`).name, '');
});

test('isShortMapsUrl tells redirect-only links apart', () => {
  assert.equal(isShortMapsUrl('https://maps.app.goo.gl/abc'), true);
  assert.equal(isShortMapsUrl('https://share.google/abc'), true);
  assert.equal(isShortMapsUrl('https://www.google.com/maps/place/X'), false);
  assert.equal(isShortMapsUrl('https://evil.example/maps'), false);
});

// A made-up place laid out exactly like a place panel copied from the Google Maps website.
const PANEL = `Kopi Contoh Sejahtera
4,6
(1.234)·Rp 25–50.000
Kedai Kopi

Overview

Menu

Reviews

About


Directions


Save


Share

·

Dine-in
·

Takeaway


Jl. Contoh Raya No.12, Sukasari, Kec. Coblong, Kota Bandung, Jawa Barat 40135



Open · Closes 10 pm

Rp 25–50.000 per person
Reported by 12 people


0812-0000-0000


6P2Q+XX Sukasari, Bandung City, West Java


Your Maps history`;

test('a place panel copied from the Google Maps website fills name, rating, count and address', () => {
  const r = parseMapsInput(PANEL);
  assert.equal(r.fromPanel, true);
  assert.equal(r.short, false);
  assert.equal(r.name, 'Kopi Contoh Sejahtera');
  assert.equal(r.rating, 4.6);
  assert.equal(r.ratingCount, '1234');
  assert.equal(r.address, 'Jl. Contoh Raya No.12, Sukasari, Kec. Coblong, Kota Bandung');
  assert.equal(r.hours, '');
  // No phone number or plus code leaks into any field.
  assert.ok(!JSON.stringify(r).includes('0812'));
  assert.ok(!JSON.stringify(r).includes('6P2Q'));
  // A working Google Maps search link for the place, so "Open in Maps" still works.
  assert.equal(isSafeMapsUrl(r.url), true);
  assert.equal(new URL(r.url).searchParams.get('query'), 'Kopi Contoh Sejahtera, Jl. Contoh Raya No.12, Sukasari, Kec. Coblong, Kota Bandung');
});

test('a copied panel that says "Open 24 hours" sets the hours', () => {
  const r = parseMapsInput(PANEL.replace('Open · Closes 10 pm', 'Open 24 hours'));
  assert.equal(r.hours, 'open24');
});

test('plain chat text is not mistaken for a place', () => {
  assert.equal(parseMapsInput('Kopi Kenangan'), null);
  assert.equal(parseMapsInput('Hai semua, besok jadi kemana?'), null);
});
