// Language state, shared strings and locale-aware formatting.

const LANG_KEY = 'jk.lang';
const LANGS = ['id', 'en'];

let current = null;

export const COMMON = {
  id: {
    appName: 'Jadi Kemana?',

    // Fixed labels
    discuss: 'Bahas tempat ini!',
    send: 'Kirim ke grup',
    copyText: 'Salin teks',
    copyLink: 'Salin link',
    share: 'Bagikan',
    openMaps: 'Buka di Maps',
    // Short forms for the tight 3-button row on place cards (full text stays in aria-label)
    mapsShort: 'Maps',
    copyShort: 'Salin',
    addPlace: 'Tambah tempat',
    editPlace: 'Ubah tempat',
    savePlace: 'Simpan tempat',
    continueShare: 'Lanjut bagikan',
    yourLists: 'Daftar kamu',
    newList: 'Daftar baru',
    missingHours: 'Cek jam buka di Maps',
    menu: 'Lihat menu',
    previewFriend: 'Lihat sebagai teman',
    open24: 'Buka 24 jam',

    // Generic controls
    back: 'Balik',
    close: 'Tutup',
    cancel: 'Batal',
    langId: 'ID, Bahasa Indonesia',
    langEn: 'EN, English',

    // List and place words
    onePlace: '{n} tempat',
    manyPlaces: '{n} tempat',
    perksTitle: 'Fasilitas',
    fromName: 'dari {name}',
    savedHere: 'disimpan di perangkat ini',
    fromMaps: 'dari Maps',
    untitled: 'Daftar tanpa nama',

    // Relative time
    editedToday: 'diubah hari ini',
    editedYesterday: 'diubah kemarin',
    editedDays: 'diubah {n} hari lalu',
    editedWeek: 'diubah {n} minggu lalu',
    editedWeeks: 'diubah {n} minggu lalu',
    editedMonth: 'diubah {n} bulan lalu',
    editedMonths: 'diubah {n} bulan lalu',
    editedYear: 'diubah {n} tahun lalu',
    editedYears: 'diubah {n} tahun lalu',

    // Errors
    errBrokenTitle: 'Link-nya rusak atau kepotong',
    errBrokenBody: 'Coba minta link baru ke yang ngirim ya.',
    errVersionTitle: 'Link ini dari versi yang lebih baru',
    errVersionBody: 'Coba muat ulang halamannya, terus buka link-nya lagi.',
    errUnsupportedTitle: 'Browser ini belum bisa buka link ini',
    errUnsupportedBody: 'Coba buka di Chrome atau Safari versi terbaru ya.',
    errLoadTitle: 'Halamannya gagal dibuka',
    errLoadBody: 'Cek koneksi kamu, terus coba lagi ya.',
    errGenericTitle: 'Waduh, ada yang error',
    errGenericBody: 'Coba lagi sebentar ya.',
    errStorage: 'Browser ini nggak bisa nyimpen daftar. Link yang udah dibagikan tetep bisa dibuka.',
    errNotSaved: 'Perubahan terakhir nggak kesimpan di perangkat ini (penyimpanannya penuh atau diblokir). Bagikan link-nya biar nggak hilang.',
    errNotFound: 'Daftar ini nggak ketemu di perangkat ini.',
    goHome: 'Ke halaman awal',

    // Screen names for the document title
    titles: {
      welcome: 'Beranda',
      editor: 'Ubah daftar',
      addPlace: 'Tambah tempat',
      editPlace: 'Ubah tempat',
      share: 'Bagikan ke grup',
      friend: 'Daftar tempat',
      compare: 'Bandingin',
      random: 'Terserah!',
    },

    perks: {
      wifi: 'WiFi kencang',
      plug: 'Colokan banyak',
      ac: 'Ber-AC',
      outdoor: 'Ada outdoor',
      prayer: 'Ada mushola',
      parking: 'Parkir luas',
      open24: 'Buka 24 jam',
      smoking: 'Ada smoking area',
      meeting: 'Ada ruang meeting',
      cheap: 'Harga bersahabat',
    },

    colors: {
      orange: 'Oranye',
      purple: 'Ungu',
      red: 'Merah',
      brown: 'Cokelat',
      indigo: 'Nila',
      olive: 'Zaitun',
      teal: 'Toska',
      plum: 'Plum',
    },
  },

  en: {
    appName: 'Jadi Kemana?',

    discuss: 'Discuss this place!',
    send: 'Send to the group',
    copyText: 'Copy text',
    copyLink: 'Copy link',
    share: 'Share',
    openMaps: 'Open in Maps',
    mapsShort: 'Maps',
    copyShort: 'Copy',
    addPlace: 'Add a place',
    editPlace: 'Edit place',
    savePlace: 'Save place',
    continueShare: 'Continue to share',
    yourLists: 'Your lists',
    newList: 'New list',
    missingHours: 'Check hours on Maps',
    menu: 'See the menu',
    previewFriend: 'Preview as a friend',
    open24: 'Open 24 hours',

    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    langId: 'ID, Bahasa Indonesia',
    langEn: 'EN, English',

    onePlace: '{n} place',
    manyPlaces: '{n} places',
    perksTitle: 'Facilities',
    fromName: 'from {name}',
    savedHere: 'saved on this device',
    fromMaps: 'from Maps',
    untitled: 'Untitled list',

    editedToday: 'edited today',
    editedYesterday: 'edited yesterday',
    editedDays: 'edited {n} days ago',
    editedWeek: 'edited {n} week ago',
    editedWeeks: 'edited {n} weeks ago',
    editedMonth: 'edited {n} month ago',
    editedMonths: 'edited {n} months ago',
    editedYear: 'edited {n} year ago',
    editedYears: 'edited {n} years ago',

    errBrokenTitle: 'This link is broken or cut off',
    errBrokenBody: 'Ask whoever sent it for a fresh link.',
    errVersionTitle: 'This link comes from a newer version',
    errVersionBody: 'Reload the page, then open the link again.',
    errUnsupportedTitle: "This browser can't open this link yet",
    errUnsupportedBody: 'Try the latest Chrome or Safari.',
    errLoadTitle: "This page didn't load",
    errLoadBody: 'Check your connection and try again.',
    errGenericTitle: 'Something went wrong',
    errGenericBody: 'Give it another try in a moment.',
    errStorage: "This browser can't save lists. Shared links still open fine.",
    errNotSaved: "Your last change couldn't be saved on this device (storage is full or blocked). Share the link so it isn't lost.",
    errNotFound: "We couldn't find this list on this device.",
    goHome: 'Go to the home page',

    titles: {
      welcome: 'Home',
      editor: 'Edit list',
      addPlace: 'Add a place',
      editPlace: 'Edit place',
      share: 'Share with the group',
      friend: 'Place list',
      compare: 'Compare',
      random: 'Surprise me',
    },

    perks: {
      wifi: 'Fast WiFi',
      plug: 'Plenty of outlets',
      ac: 'Air-conditioned',
      outdoor: 'Outdoor seating',
      prayer: 'Prayer room',
      parking: 'Easy parking',
      open24: 'Open 24 hours',
      smoking: 'Smoking area',
      meeting: 'Meeting room',
      cheap: 'Affordable',
    },

    colors: {
      orange: 'Orange',
      purple: 'Purple',
      red: 'Red',
      brown: 'Brown',
      indigo: 'Indigo',
      olive: 'Olive',
      teal: 'Teal',
      plum: 'Plum',
    },
  },
};

const isLang = (lang) => LANGS.includes(lang);

function savedLang() {
  try {
    const value = globalThis.localStorage?.getItem(LANG_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

function browserLang() {
  const tag = globalThis.navigator?.language || '';
  return tag.toLowerCase().startsWith('en') ? 'en' : 'id';
}

/** The saved choice, else the browser language ('en*' → en), else Bahasa. */
export function getLang() {
  if (!current) current = savedLang() || browserLang();
  return current;
}

export function setLang(lang) {
  if (!isLang(lang)) return;
  current = lang;
  try {
    globalThis.localStorage?.setItem(LANG_KEY, lang);
  } catch {
    // Not persisted; the choice still holds for this session.
  }
  if (globalThis.document) document.documentElement.lang = lang;
  if (globalThis.window) window.dispatchEvent(new CustomEvent('jk:lang', { detail: { lang } }));
}

// Supports dotted keys such as 'perks.wifi'.
function lookup(table, key) {
  if (!table) return undefined;
  if (key in table) return table[key];
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), table);
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** dict[lang][key], falling back to dict.id[key]; replaces {var} placeholders. */
export function t(dict, key, vars) {
  const value = lookup(dict[getLang()], key) ?? lookup(dict.id, key);
  if (value === undefined) return key;
  return typeof value === 'string' ? fill(value, vars) : value;
}

export const tc = (key, vars) => t(COMMON, key, vars);

const pick = (lang) => (isLang(lang) ? lang : getLang());

/** '' → null; 'open24' → label; times use '09.00' in Bahasa and '09:00' in English. */
export function formatHours(hours, lang) {
  if (!hours) return null;
  const l = pick(lang);
  if (hours === 'open24') return COMMON[l].open24;
  return l === 'en'
    ? hours.replace(/(\d)\.(\d)/g, '$1:$2')
    : hours.replace(/(\d):(\d)/g, '$1.$2');
}

function formatCount(count, lang) {
  const digits = String(count ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const sep = lang === 'en' ? ',' : '.';
  return String(Number(digits)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** '4,9 (1.146)' in Bahasa (as Google Maps shows it), '4.9 (1,146)' in English, '4,9' without a count, null without a rating. */
export function formatRating(rating, count, lang) {
  if (rating === null || rating === undefined || rating === '') return null;
  const value = Number(rating);
  if (!Number.isFinite(value)) return null;
  const l = pick(lang);
  const text = l === 'id' ? value.toFixed(1).replace('.', ',') : value.toFixed(1);
  const n = formatCount(count, l);
  return n ? `${text} (${n})` : text;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 'diubah hari ini' / 'edited 2 days ago', counted in calendar days. */
export function relativeTime(ts, lang, now = Date.now()) {
  const l = pick(lang);
  const say = (key, n) => fill(COMMON[l][key], { n });
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(ts)) / DAY));
  if (days === 0) return say('editedToday');
  if (days === 1) return say('editedYesterday');
  if (days < 7) return say('editedDays', days);
  if (days < 30) {
    const n = Math.floor(days / 7);
    return say(n === 1 ? 'editedWeek' : 'editedWeeks', n);
  }
  if (days < 365) {
    const n = Math.floor(days / 30);
    return say(n === 1 ? 'editedMonth' : 'editedMonths', n);
  }
  const n = Math.floor(days / 365);
  return say(n === 1 ? 'editedYear' : 'editedYears', n);
}
