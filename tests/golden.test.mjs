// Golden links: real v1 payloads frozen in time. Lists that people already shared
// must keep opening exactly like this forever. If this test fails, a change broke
// old links. Don't update the expectations; fix the change (e.g. only ever APPEND
// to data.PERKS and data.COLORS, never reorder or remove).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeList } from '../js/codec.js';

// Compressed ('1z'), as produced by encodeList on 2026-10-14.
const GOLDEN_Z =
  '1zLY4_TsMwHEavYn0D0w_HDv1DmWhBQgKJgcKUZHASyzG4dkQSBTogLsBUITFU4hjsHCUn4Aiohe19b_j0EkkwwZVCCAnCRXCl9szZpmXfX-zu3rJhuwHhRnkLShJchdqyA3arK5ZiqXPtVJUChJ_Pty1oSrh0nJ0rE9h14JLYQvmy8wYEccyFGF43ccyFAI3GBBnvaBzPKMG8VOyhK6w3yAgL9Wgb1qi2S32-57JTILzM8zMZHz09r5FRgqUugi9BGD7eQYJ2JaHWPh79L0FJtrdV29bNSRT1fc9NCMZpXoRVtFJ1E9VOFTr6-4pODyd8RlJM-YTkdI0sy34B';

// Plain ('1j'), written by hand from the format in docs/ARCHITECTURE.md:
// perks bitmask 529 = wifi (bit 0) + prayer (bit 4) + cheap (bit 9); colour 7 = plum, 0 = orange.
const GOLDEN_J =
  '1jWzEsImdvbGQwMDAxIiwiR29sZGVuIGxpc3QgwrcgVWppIOKckyIsIlJhbmkiLFtbIktvcGkgJiBUZWggXCJTZWJlbGFoXCIiLCLwn42cIiw3LCJKbC4gRGFnbyBOby4xLCBCYW5kdW5nIiwiMDguMDDigJMyMi4wMCIsNDUsIjEyMDAiLDUyOSxbIkFkYSBrdWNpbmciXSwiQmFyaXMgc2F0dVxuYmFyaXMgZHVhIiwifkFiQzEyM3h5eiJdLFsiU2Vjb25kIiwi4piVIiwwLCIiLCJvcGVuMjQiLDAsIiIsMCxbXSwiIiwiaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS9tYXBzL3BsYWNlL1NlY29uZC9ALTYuOSwxMDcuNiwxN3oiXV1d';

const view = (list) => ({
  id: list.id,
  title: list.title,
  from: list.from,
  places: list.places.map((p) => ({
    name: p.name,
    emoji: p.emoji,
    color: p.color,
    address: p.address,
    hours: p.hours,
    rating: p.rating,
    ratingCount: p.ratingCount,
    perks: [...p.perks].sort(),
    custom: p.custom,
    note: p.note,
    maps: p.maps,
    menu: p.menu,
  })),
});

const EXPECTED = {
  id: 'gold0001',
  title: 'Golden list · Uji ✓',
  from: 'Rani',
  places: [
    {
      name: 'Kopi & Teh "Sebelah"',
      emoji: '🍜',
      color: 'plum',
      address: 'Jl. Dago No.1, Bandung',
      hours: '08.00–22.00',
      rating: 4.5,
      ratingCount: '1200',
      perks: ['cheap', 'prayer', 'wifi'],
      custom: ['Ada kucing'],
      note: 'Baris satu\nbaris dua',
      maps: 'https://maps.app.goo.gl/AbC123xyz',
      menu: '', // made before menu links existed
    },
    {
      name: 'Second',
      emoji: '☕',
      color: 'orange',
      address: '',
      hours: 'open24',
      rating: null,
      ratingCount: '',
      perks: [],
      custom: [],
      note: '',
      maps: 'https://www.google.com/maps/place/Second/@-6.9,107.6,17z',
      menu: '',
    },
  ],
};

test('a frozen compressed v1 link still decodes exactly', async () => {
  assert.deepEqual(view(await decodeList(GOLDEN_Z)), EXPECTED);
});

test('a frozen plain v1 link still decodes exactly', async () => {
  assert.deepEqual(view(await decodeList(GOLDEN_J)), EXPECTED);
});

// Compressed ('1z') with a menu link (the 12th place field), as produced by encodeList on 2026-10-15.
const GOLDEN_MENU_Z =
  '1zNY5NSgQxFISvEmr9SF56pnVwKQ0D4g-I4qLJIpgYI5lkGDvjTryAKxFcCB7DvUeZE3gECYPwUZuC-mrUhFCSY-YOhGVJzmex8rmKn29x_RBBGOJkQeOIG7upOYgznysIv1-vn6COcJKkuIy2ivMiexLHNruaAwiaJfPu5a3Tkhk0PyQsFqBez2g0hLYjXBTDJm49CM_NrrsZCPfTtH48Usq1SoZSQvLytqzUXUxeObW8OB3m_YHaRv8EQyOubF7b_2e7j3cQE9DgfTQh9hhj_gA';

test('a frozen link with a menu link still decodes exactly', async () => {
  assert.deepEqual(view(await decodeList(GOLDEN_MENU_Z)), {
    id: 'gold0002',
    title: 'Golden menu · Uji',
    from: 'Dita',
    places: [
      {
        name: 'Warung Menu',
        emoji: '🍜',
        color: 'red',
        address: 'Jl. Riau No.5, Bandung',
        hours: '10.00–21.00',
        rating: 4.7,
        ratingCount: '88',
        perks: ['cheap', 'wifi'],
        custom: [],
        note: 'Menu di Drive',
        maps: 'https://maps.app.goo.gl/Gold123',
        menu: 'https://drive.google.com/file/d/GOLD456/view',
      },
      {
        name: 'Tanpa Menu',
        emoji: '☕',
        color: 'orange',
        address: '',
        hours: '',
        rating: null,
        ratingCount: '',
        perks: [],
        custom: [],
        note: '',
        maps: '',
        menu: '',
      },
    ],
  });
});
