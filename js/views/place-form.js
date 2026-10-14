// Add or edit a place: #/list/<id>/place/new and #/list/<id>/place/<pid>.
// A Maps link (or the share text) fills in the name and a rough address; rating, hours and perks
// are typed by hand. While typing, only the nodes that change are patched (the preview ticket,
// tags, helpers, chips), so the form never re-renders under the user's fingers.
import { h, icon, toast, openSheet } from '../ui.js';
import { topBar, pageHeader, emptyState, ticket, iconButton } from '../components.js';
import { t, tc, getLang, formatHours, COMMON } from '../i18n.js';
import { PERKS, COLORS, EMOJIS, LIMITS, colorHex } from '../data.js';
import { getList, upsertPlace, removePlace } from '../store.js';
import { parseMapsInput, isSafeMapsUrl } from '../links.js';
import { approxAddress } from '../geo.js';

const S = {
  id: {
    nameLabel: 'Nama tempat',
    namePh: 'Contoh: Kedai Kopi Sebelah',
    nameRequired: 'Nama tempatnya diisi dulu ya.',
    linkLabel: 'Link atau teks share Google Maps',
    linkPh: 'Tempel di sini',
    fetch: 'Ambil info',
    emptyHelp: 'Di Google Maps: buka tempatnya → Bagikan → Salin link.',
    notMaps: 'Ini bukan link Google Maps',
    shortMsg: 'Link pendek ini nggak kebaca otomatis.',
    pasteShare: 'Tempel teks share-nya',
    manual: 'Isi manual aja',
    pasteHint: 'Di Maps, tap Bagikan, salin semua teksnya (nama, alamat, link), terus tempel di sini.',
    filledBoth: 'Nama & alamat udah keisi dari Maps. Cek lagi ya.',
    filledName: 'Nama tempat udah keisi dari Maps. Cek lagi ya.',
    filledAddress: 'Alamat udah keisi dari Maps. Cek lagi ya.',
    linkSaved: 'Link Maps-nya udah masuk.',
    addrLabel: 'Alamat',
    addrPh: 'Jalan, daerah, kota',
    addrHelp: 'Alamat kira-kira, tambahin nomornya ya.',
    addrLoading: 'Lagi nyari alamat kira-kiranya…',
    osmCredit: '© OpenStreetMap',
    manualInfo: 'Rating, jam buka, sama fasilitas isi sendiri ya, datanya nggak boleh diambil dari Google.',
    ratingLabel: 'Rating (opsional)',
    ratingPh: '4.8',
    ratingError: 'Isi angka 0,1 sampai 5 ya.',
    countLabel: 'Ulasan (opsional)',
    countPh: '1146',
    hoursLabel: 'Jam buka (opsional)',
    hoursPh: '09.00–22.00',
    perksHelp: 'Pilih yang ada',
    other: 'Lainnya',
    customLabel: 'Fasilitas lain',
    customPh: 'Contoh: Bisa print',
    customAdd: 'Tambah',
    removeCustom: 'Hapus {name}',
    look: 'Tampilan kartu',
    emojiGroup: 'Pilih emoji',
    colorGroup: 'Pilih warna',
    noteTitle: 'Catatan kamu',
    notePh: 'Contoh: Datang pagi biar kebagian colokan.',
    noteHelp: 'Jangan tulis info pribadi ya. Siapa pun yang punya link bisa baca.',
    noteCount: '{n}/{max}',
    del: 'Hapus tempat',
    delTitle: 'Hapus tempat ini?',
    delBody: '"{name}" bakal hilang dari daftar ini.',
    delConfirm: 'Ya, hapus',
    saved: 'Tempat udah disimpan',
    deleted: 'Tempat udah dihapus',
    full: 'Daftarnya udah penuh, maksimal {n} tempat.',
    placeMissing: 'Tempat ini udah nggak ada di daftar.',
    backToList: 'Balik ke daftar',
  },
  en: {
    nameLabel: 'Place name',
    namePh: 'e.g. The Corner Coffee',
    nameRequired: 'Add the place name first.',
    linkLabel: 'Google Maps link or share text',
    linkPh: 'Paste it here',
    fetch: 'Get details',
    emptyHelp: 'In Google Maps: open the place → Share → Copy link.',
    notMaps: "That's not a Google Maps link",
    shortMsg: "We couldn't read this short link.",
    pasteShare: 'Paste the share text',
    manual: 'Fill in manually',
    pasteHint: 'In Maps, tap Share, copy all the text (name, address, link), then paste it here.',
    filledBoth: 'Name and address filled in from Maps. Give them a quick check.',
    filledName: 'Place name filled in from Maps. Give it a quick check.',
    filledAddress: 'Address filled in from Maps. Give it a quick check.',
    linkSaved: 'Maps link added.',
    addrLabel: 'Address',
    addrPh: 'Street, area, city',
    addrHelp: 'Rough address. Add the street number.',
    addrLoading: 'Looking up a rough address…',
    osmCredit: '© OpenStreetMap',
    manualInfo: "Fill in rating, hours and perks yourself. Google doesn't let us copy them.",
    ratingLabel: 'Rating (optional)',
    ratingPh: '4.8',
    ratingError: 'Use a number from 0.1 to 5.',
    countLabel: 'Reviews (optional)',
    countPh: '1146',
    hoursLabel: 'Hours (optional)',
    hoursPh: '09:00–22:00',
    perksHelp: 'Pick what applies',
    other: 'Other',
    customLabel: 'Other perk',
    customPh: 'e.g. Printing',
    customAdd: 'Add',
    removeCustom: 'Remove {name}',
    look: 'Card look',
    emojiGroup: 'Choose an emoji',
    colorGroup: 'Choose a colour',
    noteTitle: 'Your note',
    notePh: 'e.g. Come early to get a table by an outlet.',
    noteHelp: "Don't add private info. Anyone with the link can read it.",
    noteCount: '{n}/{max}',
    del: 'Delete place',
    delTitle: 'Delete this place?',
    delBody: '"{name}" will be removed from this list.',
    delConfirm: 'Yes, delete',
    saved: 'Place saved',
    deleted: 'Place deleted',
    full: 'This list is full: {n} places max.',
    placeMissing: "This place isn't on the list anymore.",
    backToList: 'Back to the list',
  },
};

const PREFILL_KEY = 'jk.prefill';
const OSM_CREDIT_URL = 'https://www.openstreetmap.org/copyright';
const HOURS_PRESETS = ['08.00–22.00', '10.00–22.00', 'open24'];
const COUNT_DIGITS = 9;

// The draft on screen. A language switch rebuilds the view while the old one is still mounted;
// the new view picks the draft up, so nothing typed is lost.
let session = null; // { key, state, root, ui }

export async function render(ctx) {
  const { id, pid } = ctx.params;
  const title = tc(pid ? 'editPlace' : 'addPlace');
  const list = getList(id);
  if (!list) return missingScreen({ title, text: tc('errNotFound'), href: '#/', label: tc('goHome') });

  const stored = pid ? list.places.find((p) => p.id === pid) : null;
  if (pid && !stored) {
    return missingScreen({ title, text: t(S, 'placeMissing'), href: editorHash(id), label: t(S, 'backToList') });
  }

  const key = `${id}/${pid || 'new'}`;
  const resume = session?.key === key && session.root.isConnected;
  const state = resume ? session.state : createState(list, stored);
  const prefill = resume || pid ? '' : takePrefill();

  const f = { ctx, list, state, ui: {}, refs: {} };
  const root = buildForm(f);
  session = { key, state, root, ui: f.ui };
  if (prefill) f.ui.prefill(prefill);
  return root;
}

// ---- state ----

function createState(list, stored) {
  const n = list.places.length;
  const place = stored
    ? { ...stored, perks: [...stored.perks], custom: [...stored.custom] }
    : {
        id: '', name: '', address: '', hours: '', rating: null, ratingCount: '',
        perks: [], custom: [], note: '', maps: '',
        // Each new place starts on the next emoji and colour, so a list doesn't look all alike.
        emoji: EMOJIS[n % EMOJIS.length],
        color: COLORS[n % COLORS.length].key,
      };
  return {
    place,
    editing: Boolean(stored),
    originalName: stored?.name ?? '',
    link: place.maps, // the link field, as shown
    pasted: null, // { raw, shown }: the last paste with its line breaks (inputs drop them)
    rating: place.rating == null ? '' : String(place.rating),
    status: 'idle', // idle | filled | short | paste | invalid
    filled: { name: false, address: false }, // what the last link filled in
    auto: { name: false, address: false }, // fields still holding a value from Maps
    approx: 'none', // none | loading | done: a street-level address from OpenStreetMap
    lookup: 0, // id of the latest address lookup; older answers are dropped
    errors: { name: false, rating: false },
    customOpen: false,
    customDraft: '',
  };
}

/** The text the Editor's link input handed over in sessionStorage, read once and removed. */
function takePrefill() {
  try {
    const text = sessionStorage.getItem(PREFILL_KEY) ?? '';
    sessionStorage.removeItem(PREFILL_KEY);
    return text;
  } catch {
    return '';
  }
}

/** What "Ambil info" reads: the pasted text with its line breaks while the field still shows it. */
const linkText = (state) => (state.pasted && state.pasted.shown === state.link ? state.pasted.raw : state.link);

/** The Maps URL in the link field: '' when the field is empty, null when it holds no Maps link. */
function mapsFromLink(state) {
  const text = linkText(state);
  if (!text.trim()) return '';
  const url = parseMapsInput(text)?.url;
  return url && isSafeMapsUrl(url) ? url : null;
}

/**
 * '4,8' or '4.8' → 4.8; '' → null. ok is false for anything outside 0.1–5:
 * a shared link can't carry a 0 rating, so 0 (or anything that rounds to it) is refused.
 */
function parseRating(text) {
  const value = String(text).trim().replace(',', '.');
  if (!value) return { ok: true, value: null };
  const rounded = Math.round(Number(value) * 10) / 10;
  if (!/^\d+(\.\d+)?$/.test(value) || rounded <= 0 || rounded > 5) return { ok: false, value: null };
  return { ok: true, value: rounded };
}

/** Canonical hours: 'open24', or times with dots and an en dash ('09.00–22.00'). */
function normalizeHours(text) {
  const value = String(text ?? '').trim().replace(/\s+/g, ' ');
  const lower = value.toLowerCase();
  if (value === 'open24' || [COMMON.id.open24, COMMON.en.open24].some((l) => l.toLowerCase() === lower)) return 'open24';
  return value.replace(/(\d):(\d)/g, '$1.$2').replace(/(\d)\s*[-–—]\s*(\d)/g, '$1–$2');
}

/** Hours as the field shows them in the current language. */
const hoursText = (hours) => (hours === 'open24' ? tc('open24') : formatHours(hours, getLang()) ?? '');

const editorHash = (listId) => `#/list/${encodeURIComponent(listId)}`;

// ---- Maps auto-fill ----

/** "Ambil info": reads the link field and fills what it can. */
function getDetails(f) {
  const { state, ui, refs } = f;
  const text = linkText(state);
  if (!text.trim()) {
    refs.link.focus();
    return;
  }

  const result = parseMapsInput(text);
  if (!result || !isSafeMapsUrl(result.url)) {
    state.status = 'invalid';
    ui.status();
    refs.link.focus();
    return;
  }

  state.place.maps = result.url;
  ui.mapsLink();
  // A short link alone carries no name; the share text around it does.
  if (result.short && !result.name) {
    // The short link still replaces place.maps, so whatever an earlier link filled in
    // belongs to another place: drop it rather than save place A's name with place B's link.
    clearAutoFilled(state);
    state.filled = { name: false, address: false };
    state.status = 'short';
    ui.name();
    ui.address();
    ui.preview();
    ui.status();
    return;
  }
  fillFromMaps(f, result);
}

/** A new link replaces what an earlier link filled in, never what the user typed. */
function clearAutoFilled(state) {
  cancelLookup(state);
  for (const key of ['name', 'address']) {
    if (!state.auto[key]) continue;
    state.place[key] = '';
    state.auto[key] = false;
  }
  if (!state.place.address) state.approx = 'none';
}

function fillFromMaps(f, result) {
  const { state, ui } = f;
  clearAutoFilled(state);

  state.filled = {
    name: fillAuto(state, 'name', result.name),
    address: fillAuto(state, 'address', result.address),
  };
  if (state.filled.name) state.errors.name = false;
  if (result.lat !== null && !state.place.address) lookupAddress(state, result.lat, result.lng);
  state.status = 'filled';

  ui.name();
  ui.address();
  ui.preview();
  ui.status();
}

/** Puts a value from Maps into an empty field and marks it as auto-filled. */
function fillAuto(state, key, value) {
  if (!value || state.place[key].trim()) return false;
  state.place[key] = value;
  state.auto[key] = true;
  return true;
}

function cancelLookup(state) {
  state.lookup += 1;
  if (state.approx === 'loading') state.approx = 'none';
}

/** Fills the address from the coordinates (OpenStreetMap), unless the user got there first. */
async function lookupAddress(state, lat, lng) {
  const id = ++state.lookup;
  state.approx = 'loading';
  const address = await approxAddress(lat, lng, getLang());
  if (id !== state.lookup) return; // a newer link or an edit took over

  const filled = Boolean(address) && fillAuto(state, 'address', address);
  state.approx = filled ? 'done' : 'none';
  state.filled.address = filled;

  // The view may have been rebuilt (language switch) while waiting: patch the one on screen.
  if (session?.state !== state) return;
  session.ui.address();
  session.ui.preview();
  session.ui.status();
}

// ---- small DOM helpers ----

/** A text input; the value is set as a property, never as markup. */
function textInput(id, value, { cls, attrs = {}, on } = {}) {
  const input = h('input', { class: ['input', cls], id, attrs: { type: 'text', autocomplete: 'off', ...attrs }, on });
  input.value = value;
  return input;
}

const label = (forId, text, { id, cls } = {}) => h('label', { class: ['label', cls], id, attrs: { for: forId } }, text);

const labelRow = (...children) => h('div', { class: 'label-row' }, children);

const mapsTag = (id) =>
  h('span', { class: 'tag-maps', id, attrs: { hidden: true } }, icon('map-pin', { size: 12 }), tc('fromMaps'));

const errorHelper = (id, text) =>
  h('p', { class: 'helper helper--error', id, attrs: { hidden: true } }, icon('alert-circle', { size: 14 }), h('span', {}, text));

const externalLink = (href, ...children) =>
  h('a', { class: 'link link--hit link--plain', attrs: { href, target: '_blank', rel: 'noopener' } }, children);

/** Points aria-describedby at the given ids; falsy ones (hidden helpers) are left out. */
function describe(el, ...ids) {
  const value = ids.filter(Boolean).join(' ');
  if (value) el.setAttribute('aria-describedby', value);
  else el.removeAttribute('aria-describedby');
}

/** Shows or clears an error on an input and its helper. */
function setError(input, helper, on) {
  input.setAttribute('aria-invalid', String(on));
  helper.hidden = !on;
}

/** Replaces an element's content with one optional node. */
const show = (el, node) => el.replaceChildren(...(node ? [node] : []));

// Only touch the value when it changed, so the caret stays put.
function setValue(input, value) {
  if (input.value !== value) input.value = value;
}

const setPressed = (el, on) => el.setAttribute('aria-pressed', String(on));

// ---- screen ----

function buildForm(f) {
  return h(
    'div',
    { class: 'screen' },
    header(f),
    preview(f),
    h(
      'div',
      { class: 'card card--flush' },
      h(
        'div',
        { class: 'card__section' },
        linkField(f),
        nameField(f),
        addressField(f),
        manualInfo(f),
        ratingFields(f),
        hoursField(f),
        perksField(f),
      ),
      h('div', { class: 'card__section' }, lookFields(f), noteField(f)),
    ),
    f.state.editing && deleteRow(f),
    bottomBar(f),
  );
}

function header(f) {
  const close = iconButton({ icon: 'x', label: tc('cancel'), href: editorHash(f.list.id) });
  const title = h('h1', { class: 'topbar__title', attrs: { tabindex: '-1' } }, tc(f.state.editing ? 'editPlace' : 'addPlace'));
  return topBar({ start: [close, title] });
}

/** The S ticket, sticky under the top bar. It repeats the form, so it is hidden from screen readers. */
function preview(f) {
  const { state, ui } = f;
  const box = h('div', { class: 'place-form__preview', attrs: { 'aria-hidden': 'true' } });
  ui.preview = () => {
    const name = state.place.name.trim() || t(S, 'nameLabel');
    box.replaceChildren(ticket({ ...state.place, name }, { size: 's' }));
  };
  ui.preview();
  return box;
}

// ---- Maps link ----

function linkField(f) {
  const { state, ui, refs } = f;
  let pastedText = null;

  const input = textInput('pf-link', state.link, {
    attrs: {
      inputmode: 'url',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
      placeholder: t(S, 'linkPh'),
      'aria-describedby': 'pf-link-status',
    },
    on: {
      // Inputs flatten line breaks, but share text needs them (line 1 = name, line 2 = address),
      // so the clipboard text is kept for the input event that follows the paste.
      paste: (event) => {
        pastedText = event.clipboardData?.getData('text') || null;
        setTimeout(() => {
          pastedText = null;
        });
      },
      input: () => {
        const wasEmpty = !state.link.trim();
        state.link = input.value;
        if (pastedText) state.pasted = { raw: pastedText, shown: input.value };
        linkChanged(f, wasEmpty);
      },
      keydown: (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        getDetails(f);
      },
    },
  });
  refs.link = input;

  const fetchButton = h(
    'button',
    { class: 'btn btn--secondary btn--sm', attrs: { type: 'button' }, on: { click: () => getDetails(f) } },
    h('span', {}, t(S, 'fetch')),
  );
  const status = h('div', { id: 'pf-link-status', attrs: { 'aria-live': 'polite' } });

  ui.status = () => {
    show(status, statusContent(f));
    input.setAttribute('aria-invalid', String(state.status === 'invalid'));
  };
  ui.prefill = (text) => {
    const shown = text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    state.pasted = { raw: text, shown };
    state.link = shown;
    input.value = shown;
    getDetails(f);
  };
  ui.status();

  return h(
    'div',
    { class: 'field' },
    label('pf-link', t(S, 'linkLabel')),
    h(
      'div',
      { class: 'split' },
      h('div', { class: 'input-wrap input-wrap--icon grow' }, icon('link', { size: 18 }), input),
      fetchButton,
    ),
    status,
  );
}

// Typing in the link field keeps place.maps in step and clears an old result or error.
function linkChanged(f, wasEmpty) {
  const { state, ui } = f;
  state.place.maps = mapsFromLink(state) ?? '';
  ui.mapsLink();
  if (state.approx === 'loading') {
    cancelLookup(state);
    ui.addressMeta();
  }
  if (state.status !== 'idle' || wasEmpty !== !state.link.trim()) {
    state.status = 'idle';
    ui.status();
  }
}

function statusContent(f) {
  const { state } = f;
  switch (state.status) {
    case 'invalid':
      return h('p', { class: 'helper helper--error' }, icon('alert-circle', { size: 14 }), h('span', {}, t(S, 'notMaps')));
    case 'short':
      return shortLinkNote(f);
    case 'paste':
      return h('p', { class: 'helper' }, t(S, 'pasteHint'));
    case 'filled':
      return h('p', { class: 'hint mt-8' }, icon('check', { size: 14 }), h('span', {}, t(S, filledKey(state.filled))));
    default:
      return state.link.trim() ? null : h('p', { class: 'helper' }, t(S, 'emptyHelp'));
  }
}

function filledKey({ name, address }) {
  if (name && address) return 'filledBoth';
  if (name) return 'filledName';
  return address ? 'filledAddress' : 'linkSaved';
}

function shortLinkNote(f) {
  const { state, ui, refs } = f;
  const action = (key, onClick) =>
    h('button', { class: 'btn btn--ghost', attrs: { type: 'button' }, on: { click: onClick } }, h('span', {}, t(S, key)));

  const pasteShare = () => {
    state.status = 'paste';
    ui.status();
    refs.link.focus();
    refs.link.select(); // the paste replaces the short link
  };
  const manual = () => {
    state.status = 'idle';
    ui.status();
    refs.name.focus();
  };

  return h(
    'div',
    { class: 'note mt-8' },
    icon('alert-circle', { size: 16 }),
    h(
      'div',
      { class: 'note__body' },
      h('p', {}, t(S, 'shortMsg')),
      h('div', { class: 'note__actions' }, action('pasteShare', pasteShare), action('manual', manual)),
    ),
  );
}

// ---- name and address ----

function nameField(f) {
  const { state, ui, refs } = f;
  const tag = mapsTag('pf-name-tag');
  const error = errorHelper('pf-name-error', t(S, 'nameRequired'));
  const input = textInput('pf-name', state.place.name, {
    attrs: { maxlength: LIMITS.name, autocapitalize: 'words', placeholder: t(S, 'namePh'), 'aria-required': 'true' },
    on: {
      input: () => {
        state.place.name = input.value;
        state.auto.name = false;
        if (input.value.trim()) state.errors.name = false;
        ui.nameMeta();
        ui.preview();
      },
    },
  });
  refs.name = input;

  ui.nameMeta = () => {
    tag.hidden = !state.auto.name;
    setError(input, error, state.errors.name);
    describe(input, state.auto.name && tag.id, state.errors.name && error.id);
  };
  ui.name = () => {
    setValue(input, state.place.name);
    ui.nameMeta();
  };
  ui.nameMeta();

  return h('div', { class: 'field' }, labelRow(label('pf-name', t(S, 'nameLabel')), tag), input, error);
}

function addressField(f) {
  const { state, ui } = f;
  const tag = mapsTag('pf-address-tag');
  const helper = h('p', { class: 'helper', id: 'pf-address-help', attrs: { hidden: true } });
  const input = textInput('pf-address', state.place.address, {
    attrs: { maxlength: LIMITS.address, placeholder: t(S, 'addrPh') },
    on: {
      input: () => {
        state.place.address = input.value;
        state.auto.address = false;
        // Typing wins over a lookup still on its way; an emptied field drops the OSM credit.
        if (state.approx === 'loading') cancelLookup(state);
        if (!input.value.trim()) state.approx = 'none';
        ui.addressMeta();
        ui.preview();
      },
    },
  });

  ui.addressMeta = () => {
    const note = addressNote(state);
    tag.hidden = !state.auto.address;
    helper.hidden = !note;
    helper.replaceChildren(...(note || []));
    describe(input, state.auto.address && tag.id, note && helper.id);
  };
  ui.address = () => {
    setValue(input, state.place.address);
    ui.addressMeta();
  };
  ui.addressMeta();

  return h('div', { class: 'field' }, labelRow(label('pf-address', t(S, 'addrLabel')), tag), input, helper);
}

function addressNote(state) {
  if (state.approx === 'loading') return [icon('loader-2', { size: 14, class: 'spin' }), ' ', t(S, 'addrLoading')];
  if (state.approx === 'done') return [t(S, 'addrHelp'), ' ', externalLink(OSM_CREDIT_URL, t(S, 'osmCredit'))];
  return null;
}

/** Why rating, hours and perks are manual, with a shortcut to look them up. */
function manualInfo(f) {
  const { state, ui } = f;
  const slot = h('span');
  ui.mapsLink = () => {
    const url = state.place.maps;
    show(slot, isSafeMapsUrl(url) ? externalLink(url, tc('openMaps'), icon('external-link', { size: 14 })) : null);
  };
  ui.mapsLink();
  return h('p', { class: 'hint mt-20' }, icon('info-circle', { size: 14 }), h('span', {}, t(S, 'manualInfo'), ' ', slot));
}

// ---- rating and hours ----

function ratingFields(f) {
  const { state, ui, refs } = f;
  const error = errorHelper('pf-rating-error', t(S, 'ratingError'));
  const check = () => {
    state.errors.rating = !parseRating(state.rating).ok;
    ui.ratingMeta();
  };
  const rating = textInput('pf-rating', state.rating, {
    cls: 'input--num',
    attrs: { inputmode: 'decimal', maxlength: 4, placeholder: t(S, 'ratingPh') },
    on: {
      input: () => {
        state.rating = rating.value;
        if (state.errors.rating) check();
      },
      blur: check,
    },
  });
  refs.rating = rating;

  ui.ratingMeta = () => {
    setError(rating, error, state.errors.rating);
    describe(rating, state.errors.rating && error.id);
  };
  ui.ratingMeta();

  const count = textInput('pf-count', state.place.ratingCount, {
    cls: 'input--num',
    attrs: { inputmode: 'numeric', maxlength: COUNT_DIGITS, placeholder: t(S, 'countPh') },
    on: {
      input: () => {
        const digits = count.value.replace(/\D/g, '').slice(0, COUNT_DIGITS);
        setValue(count, digits);
        state.place.ratingCount = digits;
      },
    },
  });

  return h(
    'div',
    { class: 'field-pair mt-8' },
    h(
      'div',
      {},
      label('pf-rating', t(S, 'ratingLabel'), { cls: 'truncate' }),
      h('div', { class: 'input-wrap input-wrap--icon' }, icon('star-filled', { size: 18, class: 'star' }), rating),
      error,
    ),
    h('div', {}, label('pf-count', t(S, 'countLabel'), { cls: 'truncate' }), count),
  );
}

function hoursField(f) {
  const { state, ui } = f;
  const input = textInput('pf-hours', hoursText(state.place.hours), {
    cls: 'input--num',
    attrs: { maxlength: LIMITS.hours, placeholder: t(S, 'hoursPh') },
    on: {
      input: () => {
        state.place.hours = input.value;
        ui.hoursChips();
      },
    },
  });

  // Picking a preset fills the field; picking it again clears it.
  const pick = (preset) => {
    state.place.hours = normalizeHours(state.place.hours) === preset ? '' : preset;
    input.value = hoursText(state.place.hours);
    ui.hoursChips();
  };
  const chips = HOURS_PRESETS.map((preset) =>
    h(
      'button',
      { class: 'chip chip--sm', attrs: { type: 'button' }, on: { click: () => pick(preset) } },
      icon('check', { size: 14, class: 'chip__check' }),
      h('span', {}, hoursText(preset)),
    ),
  );
  ui.hoursChips = () => {
    const current = normalizeHours(state.place.hours);
    chips.forEach((chip, i) => setPressed(chip, current === HOURS_PRESETS[i]));
  };
  ui.hoursChips();

  return h(
    'div',
    { class: 'field mt-20' },
    label('pf-hours', t(S, 'hoursLabel'), { id: 'pf-hours-label' }),
    input,
    h('div', { class: 'chips mt-8', attrs: { role: 'group', 'aria-labelledby': 'pf-hours-label' } }, chips),
  );
}

// ---- perks ----

function perksField(f) {
  const { state, ui, refs } = f;
  const chips = h('div', { class: 'chips', attrs: { role: 'group', 'aria-labelledby': 'pf-perks-label' } });
  const perkChips = PERKS.map((perk) => perkChip(state, perk));
  refs.perks = chips;

  // The fixed chips keep their nodes; custom chips and the add control are rebuilt.
  ui.custom = () => {
    const custom = state.place.custom.map((text, i) => customChip(f, text, i));
    chips.replaceChildren(...perkChips, ...custom, ...customAdder(f));
  };
  ui.custom();

  return h(
    'div',
    { class: 'field' },
    labelRow(
      h('span', { class: 'label', id: 'pf-perks-label' }, tc('perksTitle')),
      h('span', { class: 'label-row__hint' }, t(S, 'perksHelp')),
    ),
    chips,
  );
}

function perkChip(state, { code, icon: glyph }) {
  const toggle = () => {
    const on = !state.place.perks.includes(code);
    const picked = new Set(state.place.perks);
    if (on) picked.add(code);
    else picked.delete(code);
    state.place.perks = PERKS.map((p) => p.code).filter((c) => picked.has(c));
    setPressed(chip, on);
  };
  const chip = h(
    'button',
    { class: 'chip', attrs: { type: 'button', 'aria-pressed': state.place.perks.includes(code) }, on: { click: toggle } },
    icon(glyph, { size: 16, class: 'chip__icon' }),
    icon('check', { size: 16, class: 'chip__check' }),
    h('span', {}, tc(`perks.${code}`)),
  );
  return chip;
}

function customChip(f, text, index) {
  const remove = () => {
    f.state.place.custom.splice(index, 1);
    f.ui.custom();
    // Focus the chip that took its place, else the one before it, else the add control.
    const removes = f.refs.perks.querySelectorAll('.chip__remove');
    (removes[Math.min(index, removes.length - 1)] ?? f.refs.perks.querySelector('.chip--dashed'))?.focus();
  };
  return h(
    'div',
    { class: 'chip chip--custom' },
    icon('circle-check', { size: 16 }),
    h('span', {}, text),
    h(
      'button',
      { class: 'chip__remove', attrs: { type: 'button', 'aria-label': t(S, 'removeCustom', { name: text }) }, on: { click: remove } },
      icon('x', { size: 16 }),
    ),
  );
}

/** "+ Lainnya", or the small inline input that replaces it. Nothing once there are 5 custom perks. */
function customAdder(f) {
  const { state, ui, refs } = f;
  if (state.place.custom.length >= LIMITS.custom) return [];

  if (!state.customOpen) {
    const open = () => {
      state.customOpen = true;
      ui.custom();
      refs.perks.querySelector('.chip-input')?.focus();
    };
    return [
      h(
        'button',
        { class: 'chip chip--dashed', attrs: { type: 'button' }, on: { click: open } },
        icon('plus', { size: 16 }),
        h('span', {}, t(S, 'other')),
      ),
    ];
  }

  const input = textInput('pf-custom', state.customDraft, {
    cls: 'chip-input',
    attrs: { maxlength: LIMITS.customLen, enterkeyhint: 'done', placeholder: t(S, 'customPh'), 'aria-label': t(S, 'customLabel') },
    on: {
      input: () => {
        state.customDraft = input.value;
      },
      keydown: (event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        closeCustom(f, event.key === 'Enter');
      },
    },
  });
  const add = h(
    'button',
    { class: 'btn btn--secondary btn--sm', attrs: { type: 'button' }, on: { click: () => closeCustom(f, true) } },
    h('span', {}, t(S, 'customAdd')),
  );
  return [input, add];
}

/** Closes the inline input, adding its text as a custom perk when `keep` is true. */
function closeCustom(f, keep) {
  const { state, ui, refs } = f;
  const text = state.customDraft.replace(/\s+/g, ' ').trim();
  const custom = state.place.custom;
  const duplicate = custom.some((item) => item.toLowerCase() === text.toLowerCase());
  if (keep && text && !duplicate) custom.push(text);

  state.customOpen = false;
  state.customDraft = '';
  ui.custom();
  // Back to "+ Lainnya", or to the newest chip when the list just filled up.
  const removes = refs.perks.querySelectorAll('.chip__remove');
  (refs.perks.querySelector('.chip--dashed') ?? removes[removes.length - 1])?.focus();
}

// ---- card look and note ----

/** Buttons where exactly one value is picked (aria-pressed); picking updates the preview. */
function choiceButtons(f, key, values, build) {
  const buttons = values.map((value) =>
    build(value, () => {
      f.state.place[key] = value;
      buttons.forEach((button, i) => setPressed(button, values[i] === value));
      f.ui.preview();
    }),
  );
  buttons.forEach((button, i) => setPressed(button, values[i] === f.state.place[key]));
  return buttons;
}

function lookFields(f) {
  const emojis = choiceButtons(f, 'emoji', EMOJIS, (emoji, pick) =>
    h('button', { class: 'emoji-opt', attrs: { type: 'button' }, on: { click: pick } }, emoji),
  );
  const colorKeys = COLORS.map((c) => c.key);
  const swatches = choiceButtons(f, 'color', colorKeys, (key, pick) =>
    h(
      'button',
      {
        class: 'swatch',
        style: { '--place': colorHex(key) },
        attrs: { type: 'button', 'aria-label': tc(`colors.${key}`) },
        on: { click: pick },
      },
      icon('check', { size: 18 }),
    ),
  );

  return [
    h('h3', { class: 'card__title' }, t(S, 'look')),
    h('div', { class: 'emoji-grid mt-8', attrs: { role: 'group', 'aria-label': t(S, 'emojiGroup') } }, emojis),
    h('div', { class: 'swatch-grid mt-4', attrs: { role: 'group', 'aria-label': t(S, 'colorGroup') } }, swatches),
  ];
}

function noteField(f) {
  const { state } = f;
  const counter = h('span', { class: 'counter', id: 'pf-note-count' });
  const count = () => {
    const n = Array.from(state.place.note).length;
    counter.textContent = t(S, 'noteCount', { n, max: LIMITS.note });
    counter.classList.toggle('counter--over', n >= LIMITS.note);
  };
  const area = h('textarea', {
    class: 'textarea mt-8',
    id: 'pf-note',
    attrs: { maxlength: LIMITS.note, placeholder: t(S, 'notePh'), 'aria-describedby': 'pf-note-help pf-note-count' },
    on: {
      input: () => {
        state.place.note = area.value;
        count();
      },
    },
  });
  area.value = state.place.note;
  count();

  return [
    h('h3', { class: 'card__title mt-16' }, h('label', { attrs: { for: 'pf-note' } }, t(S, 'noteTitle'))),
    area,
    h('div', { class: 'helper-row' }, h('p', { class: 'helper', id: 'pf-note-help' }, t(S, 'noteHelp')), counter),
  ];
}

// ---- save and delete ----

function bottomBar(f) {
  return h(
    'div',
    { class: 'bottom-bar' },
    h(
      'button',
      { class: 'btn btn--primary btn--lg btn--block', attrs: { type: 'button' }, on: { click: () => save(f) } },
      h('span', {}, tc('savePlace')),
    ),
  );
}

function save(f) {
  const { ctx, list, state, ui, refs } = f;
  const name = state.place.name.trim();
  const rating = parseRating(state.rating);
  const maps = mapsFromLink(state);

  state.errors.name = !name;
  state.errors.rating = !rating.ok;
  ui.nameMeta();
  ui.ratingMeta();
  if (maps === null) {
    state.status = 'invalid';
    ui.status();
  }

  // Focus the first problem, top to bottom.
  const problem = (maps === null && refs.link) || (!name && refs.name) || (!rating.ok && refs.rating);
  if (problem) {
    problem.focus();
    return;
  }

  const saved = upsertPlace(list.id, {
    ...state.place,
    name,
    address: state.place.address.trim(),
    hours: normalizeHours(state.place.hours),
    rating: rating.value,
    note: state.place.note.trim(),
    maps,
  });
  if (!saved) {
    toast(getList(list.id) ? t(S, 'full', { n: LIMITS.places }) : tc('errNotFound'), { icon: 'alert-circle' });
    return;
  }
  session = null;
  ctx.nav(editorHash(list.id));
  toast(t(S, 'saved'));
}

function deleteRow(f) {
  return h(
    'div',
    { class: 'center-row mt-24' },
    h(
      'button',
      { class: 'btn btn--danger-link', attrs: { type: 'button' }, on: { click: () => confirmDelete(f) } },
      icon('trash', { size: 16 }),
      h('span', {}, t(S, 'del')),
    ),
  );
}

function confirmDelete(f) {
  const { ctx, list, state } = f;
  let close = () => {};
  const remove = () => {
    close();
    removePlace(list.id, state.place.id);
    session = null;
    ctx.nav(editorHash(list.id));
    toast(t(S, 'deleted'));
  };
  const button = (cls, content, onClick) =>
    h('button', { class: ['btn', cls, 'btn--block'], attrs: { type: 'button' }, on: { click: onClick } }, content);
  const cancel = button('btn--ghost', h('span', {}, tc('cancel')), () => close());

  close = openSheet(
    [
      h('p', { class: 'muted' }, t(S, 'delBody', { name: state.originalName })),
      h(
        'div',
        { class: 'sheet__actions' },
        button('btn--danger', [icon('trash', { size: 16 }), h('span', {}, t(S, 'delConfirm'))], remove),
        cancel,
      ),
    ],
    { label: t(S, 'delTitle') },
  );
  cancel.focus(); // the safe choice starts focused
}

// ---- dead ends ----

function missingScreen({ title, text, href, label: actionLabel }) {
  return h(
    'div',
    { class: 'screen screen--nobar' },
    topBar({ back: href }),
    pageHeader({ title }),
    emptyState({ icon: 'alert-circle', text, action: h('a', { class: 'btn btn--ghost', attrs: { href } }, actionLabel) }),
  );
}
