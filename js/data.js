// Fixed vocabularies, limits, ids and the sample list.
// The order of PERKS and COLORS is part of the link format: only ever append.

export const PERKS = Object.freeze([
  { code: 'wifi', icon: 'wifi' },
  { code: 'plug', icon: 'plug' },
  { code: 'ac', icon: 'air-conditioning' },
  { code: 'outdoor', icon: 'trees' },
  { code: 'prayer', icon: 'building-mosque' },
  { code: 'parking', icon: 'parking' },
  { code: 'open24', icon: 'clock-24' },
  { code: 'smoking', icon: 'smoking' },
  { code: 'meeting', icon: 'users-group' },
  { code: 'cheap', icon: 'coin' },
].map(Object.freeze));

export const COLORS = Object.freeze([
  { key: 'orange', hex: '#C0530B' },
  { key: 'purple', hex: '#6B4FA0' },
  { key: 'red', hex: '#A8402F' },
  { key: 'brown', hex: '#8A5A1F' },
  { key: 'indigo', hex: '#3F5F8A' },
  { key: 'olive', hex: '#66651C' },
  { key: 'teal', hex: '#2F6F73' },
  { key: 'plum', hex: '#8A3F6B' },
].map(Object.freeze));

export const EMOJIS = Object.freeze(['🛋️', '☕', '🍩', '🫖', '🍜', '🍰', '📚', '🌿']);

export const LIMITS = Object.freeze({
  places: 20,
  title: 60,
  from: 30,
  name: 80,
  address: 160,
  hours: 40,
  note: 200,
  custom: 5,
  customLen: 30,
});

const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 8-char base36 id from the CSPRNG (rejection sampling keeps it unbiased). */
export function newId() {
  let id = '';
  while (id.length < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < 252 && id.length < 8) id += ID_CHARS[b % 36];
    }
  }
  return id;
}

export function colorHex(key) {
  return (COLORS.find((c) => c.key === key) || COLORS[0]).hex;
}

// Custom perks and notes are bilingual here; sampleList() picks one language.
const SAMPLE_PLACES = [
  {
    name: 'Kinterra Coffee & Space', emoji: '🛋️', color: 'purple',
    address: 'Jl. Talaga Bodas No.27, Lengkong, Bandung', hours: '', rating: 4.9, ratingCount: '',
    perks: ['wifi', 'plug', 'outdoor', 'meeting'], custom: { id: ['Ada rak buku'], en: ['Bookshelf'] },
    note: {
      id: 'Datang jam 9–10 biar kebagian sofa. Ada private room juga kalau mau kerja fokus.',
      en: "Come around 9–10 to grab a sofa. There's a private room too if you need to focus.",
    },
    maps: 'https://maps.app.goo.gl/56P8rmgQGzV3mhrY7',
  },
  {
    name: 'HI Brew Coffee', emoji: '🫖', color: 'red',
    address: 'Jl. Boscha No.43, Pasteur, Bandung', hours: '09.00–22.00', rating: 4.6, ratingCount: '',
    perks: ['plug', 'ac'], custom: { id: ['Tempat taruh tas', 'Ada lesehan'], en: ['Bag hooks at tables', 'Floor seating'] },
    note: {
      id: 'Tiap meja ada colokan, cocok buat kerja lama.',
      en: 'Every table has an outlet, which is great for long work sessions.',
    },
    maps: 'https://maps.app.goo.gl/f52J378v6Zn7hWh39',
  },
  {
    name: 'Arrah Coffee', emoji: '☕', color: 'orange',
    address: 'Jl. Sukajadi No.204, Cipedes, Bandung', hours: '08.00–22.00', rating: 4.8, ratingCount: '',
    perks: ['wifi', 'plug', 'outdoor'], custom: { id: [], en: [] },
    note: {
      id: 'Area outdoor-nya adem, cakep juga buat foto-foto.',
      en: 'The outdoor area is shady and nice for photos.',
    },
    maps: 'https://maps.app.goo.gl/Avetc5F7UWaigT4s8',
  },
  {
    name: 'Goffee Doughnut & Coffee', emoji: '🍩', color: 'brown',
    address: 'Jl. Dipati Ukur No.138, Lebakgede, Bandung', hours: '07.00–22.00', rating: 4.8, ratingCount: '',
    perks: ['wifi', 'plug'], custom: { id: ['Bisa print'], en: ['Printing available'] },
    note: {
      id: 'Donatnya enak, terus bisa print dokumen juga.',
      en: 'Great doughnuts, and you can print documents there.',
    },
    maps: 'https://maps.app.goo.gl/i4MUtZrM7BLen2Nv8',
  },
  {
    name: 'Cloudpath Coffee & Space', emoji: '☁️', color: 'indigo',
    address: 'Jl. Siliwangi No.14, Hegarmanah, Bandung', hours: 'open24', rating: 3.4, ratingCount: '',
    perks: ['open24', 'wifi', 'plug', 'cheap'], custom: { id: [], en: [] },
    note: {
      id: 'Buka 24 jam, aman buat yang kerja sampai malam.',
      en: 'Open 24 hours, handy if you work late.',
    },
    maps: 'https://maps.app.goo.gl/PsjSoBxqLyeaH8XXA',
  },
];

// Labelled as an example: the cafes are real, but their hours and ratings date over time.
const SAMPLE_TITLE = { id: 'Contoh: Spot WFC Bandung', en: 'Example: Bandung work-from-cafe spots' };

/**
 * The example list's id. It is the same on every phone, so it is never stored:
 * saving or importing a list with this id gives it a fresh newId() (see store.importList).
 */
export const SAMPLE_ID = 'sample01';

/** The 5 Bandung cafes behind "See an example", in the given language. */
export function sampleList(lang = 'id') {
  const l = lang === 'en' ? 'en' : 'id';
  const now = Date.now();
  return {
    id: SAMPLE_ID,
    title: SAMPLE_TITLE[l],
    from: 'Rani',
    places: SAMPLE_PLACES.map((p) => ({
      ...p,
      id: newId(),
      perks: [...p.perks],
      custom: [...p.custom[l]],
      note: p.note[l],
    })),
    createdAt: now,
    updatedAt: now,
    sharedAt: null,
  };
}
