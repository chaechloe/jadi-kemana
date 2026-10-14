// Editor (#/list/<id>): one of the coordinator's lists. Rename it and the sender name in place,
// open or reorder places, add one (straight from a pasted Maps link while the list is empty),
// then continue to sharing. An unknown id gets a friendly dead end with a way home.
import { h, icon, toast, openSheet, uid } from '../ui.js';
import { topBar, pageHeader, placeTile, listRow, iconButton, emptyState } from '../components.js';
import { t, tc, formatRating } from '../i18n.js';
import { LIMITS } from '../data.js';
import * as store from '../store.js';
import { openListsSheet } from './lists-sheet.js';

const PREFILL_KEY = 'jk.prefill'; // the place form reads this once and clears it
const MIN_TO_SHARE = 2;

const S = {
  id: {
    switchAria: 'Ganti daftar: {title}',
    rename: 'Ganti nama daftar',
    titleLabel: 'Nama daftar',
    from: 'Dari: {name}',
    fromEmpty: 'Tambahin nama kamu',
    fromAria: '{label}, ubah',
    fromLabel: 'Nama kamu',
    fromPlaceholder: 'Misalnya Rani',
    changed: 'Daftarnya udah berubah sejak terakhir kamu bagikan. Bagikan lagi biar teman-teman dapet versi terbaru.',
    listAria: 'Tempat di daftar ini',
    edit: 'Ubah',
    move: 'Geser {name}',
    rating: 'Rating',
    perksOne: '{n} fasilitas',
    perksMany: '{n} fasilitas',
    full: 'Udah penuh, maksimal {max} tempat',
    linkLabel: 'Tempel link Google Maps',
    placeholder: 'https://maps.app.goo.gl/…',
    add: 'Tambah',
    emptyLine: 'Belum ada tempat. Tempel link Google Maps buat mulai.',
    ctaHelper: 'Tambah minimal 2 tempat dulu',
    moveTitle: 'Pindahin {name}',
    position: 'Sekarang di urutan {n} dari {total}',
    moveUp: 'Pindah ke atas',
    moveDown: 'Pindah ke bawah',
    moved: '{name} pindah ke urutan {n}',
    deleteList: 'Hapus daftar ini',
    deleteTitle: 'Hapus daftar ini?',
    deleteBody: 'Yakin? Daftar ini bakal hilang dari HP ini.',
    deleteShared: 'Link yang udah kamu bagikan tetep bisa dibuka.',
    deleteConfirm: 'Hapus',
    deleted: 'Daftar dihapus',
    notFoundTitle: 'Daftarnya nggak ketemu',
    notFoundHint: 'Kalau pernah kamu bagikan, buka lagi dari link-nya ya.',
  },
  en: {
    switchAria: 'Switch list: {title}',
    rename: 'Rename list',
    titleLabel: 'List name',
    from: 'From: {name}',
    fromEmpty: 'Add your name',
    fromAria: '{label}, edit',
    fromLabel: 'Your name',
    fromPlaceholder: 'For example, Rani',
    changed: "You've changed this list since you shared it. Share it again so your friends get the latest version.",
    listAria: 'Places in this list',
    edit: 'Edit',
    move: 'Move {name}',
    rating: 'Rated',
    perksOne: '{n} perk',
    perksMany: '{n} perks',
    full: "It's full: {max} places at most",
    linkLabel: 'Paste a Google Maps link',
    placeholder: 'https://maps.app.goo.gl/…',
    add: 'Add',
    emptyLine: 'No places yet. Start by pasting a Google Maps link.',
    ctaHelper: 'Add at least 2 places first',
    moveTitle: 'Move {name}',
    position: 'Now at position {n} of {total}',
    moveUp: 'Move up',
    moveDown: 'Move down',
    moved: '{name} moved to position {n}',
    deleteList: 'Delete this list',
    deleteTitle: 'Delete this list?',
    deleteBody: 'Sure? This list will be gone from this phone.',
    deleteShared: "Links you've already shared will still open.",
    deleteConfirm: 'Delete',
    deleted: 'List deleted',
    notFoundTitle: "We couldn't find this list",
    notFoundHint: 'If you shared it, open it again from its link.',
  },
};

// ---- small helpers ----

const hidden = (text) => h('span', { class: 'visually-hidden' }, text);
const listTitle = (list) => list.title || tc('untitled');
const placeCount = (n) => tc(n === 1 ? 'onePlace' : 'manyPlaces', { n });
const fromText = (list) => (list.from ? t(S, 'from', { name: list.from }) : t(S, 'fromEmpty'));
const listHash = (list, rest = '') => `#/list/${list.id}${rest}`;

// Changed since shared, and only worth saying while there is something to share.
const showChanged = (list) =>
  list.places.length > 0 && list.sharedAt !== null && list.updatedAt > list.sharedAt;

/** Hands pasted text to the place form ('' clears it). Blocked storage just means an empty form. */
function setPrefill(text) {
  try {
    if (text) sessionStorage.setItem(PREFILL_KEY, text);
    else sessionStorage.removeItem(PREFILL_KEY);
  } catch {
    // Storage blocked: the form opens without the link.
  }
}

/**
 * Swaps `display` for a labelled text input. Enter or leaving the field saves, Esc cancels.
 * After Enter or Esc focus returns to `trigger`; after a blur it stays wherever the user went.
 * onSave(value) gets the trimmed text and patches the display itself.
 */
function editInline(display, trigger, { label, value, max, placeholder, fieldClass, onSave }) {
  const id = uid('inline');
  const input = h('input', {
    class: 'input',
    id,
    attrs: { type: 'text', maxlength: max, autocomplete: 'off', enterkeyhint: 'done', placeholder },
  });
  input.value = value;
  const field = h(
    'div',
    { class: ['field', fieldClass] },
    h('label', { class: 'visually-hidden', attrs: { for: id } }, label),
    input,
  );

  let open = true;
  const finish = (save, refocus) => {
    if (!open) return;
    open = false;
    field.replaceWith(display);
    if (save) onSave(input.value.trim());
    if (refocus) trigger.focus();
  };

  input.addEventListener('keydown', (event) => {
    if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
    event.preventDefault();
    finish(event.key === 'Enter', true);
  });
  // Switching apps or tabs also blurs the field; keep editing until focus really moves on.
  input.addEventListener('blur', () => {
    if (document.hasFocus()) finish(true, false);
  });

  display.replaceWith(field);
  input.focus();
  input.select();
}

// ---- header: list switcher, rename, meta, sender name ----

function header(state, ctx, saveField, canSave) {
  const { list } = state;

  const titleText = h('span', { class: 'title-switch__text' }, listTitle(list));
  const switchButton = h(
    'button',
    {
      class: 'title-switch',
      id: 'jk-switch-list',
      attrs: { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': t(S, 'switchAria', { title: listTitle(list) }) },
      on: { click: () => openListsSheet(ctx, { currentId: list.id }) },
    },
    titleText,
    icon('chevron-down', { size: 20 }),
  );

  const renameButton = iconButton({
    icon: 'pencil',
    label: t(S, 'rename'),
    variant: 'tonal',
    attrs: { id: 'jk-rename' },
    onClick: () =>
      editInline(titleRow, renameButton, {
        label: t(S, 'titleLabel'),
        value: state.list.title,
        max: LIMITS.title,
        placeholder: tc('untitled'),
        onSave: (value) => {
          // An emptied name keeps the old one.
          if (!value || value === state.list.title || !saveField('title', value)) return;
          const title = listTitle(state.list);
          titleText.textContent = title;
          switchButton.setAttribute('aria-label', t(S, 'switchAria', { title }));
          document.title = `${title} · ${tc('appName')}`;
        },
      }),
  });

  const meta = canSave ? `${placeCount(list.places.length)} · ${tc('savedHere')}` : placeCount(list.places.length);
  const node = pageHeader({ title: switchButton, meta, metaIcon: 'device-mobile', action: renameButton });
  const titleRow = node.querySelector('.page-header__row');

  const fromLabel = h('span', {}, fromText(list));
  const fromButton = h(
    'button',
    {
      class: 'link link--hit link--plain',
      id: 'jk-edit-from',
      attrs: { type: 'button', 'aria-label': t(S, 'fromAria', { label: fromText(list) }) },
      on: {
        click: () =>
          editInline(fromLine, fromButton, {
            label: t(S, 'fromLabel'),
            value: state.list.from,
            max: LIMITS.from,
            placeholder: t(S, 'fromPlaceholder'),
            fieldClass: 'mt-8',
            onSave: (value) => {
              if (value === state.list.from || !saveField('from', value)) return;
              fromLabel.textContent = fromText(state.list);
              fromButton.setAttribute('aria-label', t(S, 'fromAria', { label: fromText(state.list) }));
            },
          }),
      },
    },
    icon('pencil', { size: 14 }),
    fromLabel,
  );
  const fromLine = h('p', { class: 'text-small mt-8' }, fromButton);

  node.append(fromLine);
  return node;
}

// ---- notes above the list ----

function changedNote(list) {
  return h(
    'p',
    { class: 'note', attrs: { hidden: !showChanged(list) } },
    icon('refresh', { size: 18 }),
    h('span', { class: 'note__body' }, t(S, 'changed')),
  );
}

function storageNote() {
  return h(
    'p',
    { class: 'note note--danger' },
    icon('alert-triangle', { size: 18 }),
    h('span', { class: 'note__body' }, tc('errStorage')),
  );
}

// ---- place rows ----

// Street-level parts (Jl./Jalan, Gg., No., RT/RW) and bare numbers are not an area name.
const STREET_PART = /^(?:jl|jln|jalan|gg|gang|no|rt|rw)\b|^\d+$/i;

/** The row's area: the first address part that isn't street-level, or '' when there is none. */
function areaOf(address) {
  return address
    .split(',')
    .map((part) => part.trim())
    .find((part) => part && !STREET_PART.test(part)) ?? '';
}

/** "Lengkong · ★ 4.9 · 5 fasilitas", leaving out whatever the place doesn't have. */
function placeMeta(place) {
  const facilities = place.perks.length + place.custom.length;
  const rating = formatRating(place.rating);
  const parts = [
    areaOf(place.address),
    rating && [icon('star-filled', { size: 12, class: 'star' }), hidden(`${t(S, 'rating')} `), rating],
    facilities > 0 && t(S, facilities === 1 ? 'perksOne' : 'perksMany', { n: facilities }),
  ].filter(Boolean);
  return parts.length ? parts.flatMap((part, i) => (i ? [' · ', part] : [part])) : null;
}

/** Moves a place one step and announces it; main.js puts focus back on its grip (by id). */
function movePlace(ctx, list, from, to) {
  if (to < 0 || to >= list.places.length || to === from) return;
  if (!store.movePlace(list.id, from, to)) return;
  toast(t(S, 'moved', { name: list.places[from].name, n: to + 1 }));
  ctx.rerender();
}

/** The grip's menu: "Pindah ke atas" / "Pindah ke bawah", disabled at the ends. */
function openMoveSheet(ctx, list, index) {
  const place = list.places[index];
  const total = list.places.length;
  let close = () => {};

  const option = (labelKey, iconName, to) =>
    h(
      'button',
      {
        class: 'btn btn--secondary btn--block',
        attrs: { type: 'button', disabled: to < 0 || to >= total },
        on: {
          click: () => {
            close(); // focus goes back to the grip first, so the re-render can find it
            movePlace(ctx, list, index, to);
          },
        },
      },
      icon(iconName, { size: 20 }),
      h('span', {}, t(S, labelKey)),
    );

  close = openSheet(
    [
      h('p', { class: 'hint' }, t(S, 'position', { n: index + 1, total })),
      h(
        'div',
        { class: 'sheet__actions' },
        option('moveUp', 'arrow-up', index - 1),
        option('moveDown', 'arrow-down', index + 1),
      ),
    ],
    { label: t(S, 'moveTitle', { name: place.name }) },
  );
}

/** The drag handle: a tap opens the move menu; ArrowUp/ArrowDown move straight away. */
function moveButton(ctx, list, index) {
  const place = list.places[index];
  const button = iconButton({
    icon: 'grip-vertical',
    label: t(S, 'move', { name: place.name }),
    variant: 'drag',
    attrs: { id: `jk-move-${place.id}`, 'aria-haspopup': 'dialog', 'aria-keyshortcuts': 'ArrowUp ArrowDown' },
    onClick: () => openMoveSheet(ctx, list, index),
  });
  button.addEventListener('keydown', (event) => {
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    movePlace(ctx, list, index, index + step);
  });
  return button;
}

function placeRow(ctx, list, place, index) {
  return listRow({
    tile: placeTile(place),
    title: [hidden(`${t(S, 'edit')} `), place.name],
    meta: placeMeta(place),
    href: listHash(list, `/place/${place.id}`),
    trail: list.places.length > 1 ? moveButton(ctx, list, index) : null,
  });
}

/** "Tambah tempat", or a muted note once the list holds LIMITS.places. */
function addRow(list) {
  const tile = (extra) =>
    h('span', { class: ['tile tile--dashed', extra], attrs: { 'aria-hidden': 'true' } }, icon('plus', { size: 20 }));

  if (list.places.length >= LIMITS.places) {
    return h(
      'li',
      { class: 'row row--add muted' },
      tile('muted'),
      h(
        'span',
        { class: 'row__main' },
        h('span', {}, tc('addPlace')),
        h('span', { class: 'row__meta' }, t(S, 'full', { max: LIMITS.places })),
      ),
    );
  }
  return h(
    'li',
    {},
    h(
      'a',
      { class: 'row row--add', attrs: { href: listHash(list, '/place/new') }, on: { click: () => setPrefill('') } },
      tile(),
      h('span', {}, tc('addPlace')),
    ),
  );
}

function placeList(ctx, list) {
  return h(
    'ul',
    { class: 'list-surface', attrs: { role: 'list', 'aria-label': t(S, 'listAria') } },
    list.places.map((place, index) => placeRow(ctx, list, place, index)),
    addRow(list),
  );
}

// ---- empty list: paste a Maps link ----

// The link field's draft. A language switch rebuilds the editor while the old one is still
// mounted; the new field picks the draft up, so a pasted link (and its line breaks) isn't lost.
// Any other arrival (another list, coming back from the form) starts empty.
let linkDraft = null; // { listId, input, draft: { inputId, value, pasted } }

function emptyAdd(ctx, list) {
  const resume = linkDraft?.listId === list.id && linkDraft.input.isConnected;
  const draft = resume ? linkDraft.draft : { inputId: uid('maps-link'), value: '', pasted: null };
  const inputId = draft.inputId; // kept, so main.js can put focus back on the field
  const input = h('input', {
    class: 'input',
    id: inputId,
    attrs: {
      type: 'url',
      inputmode: 'url',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
      placeholder: t(S, 'placeholder'),
    },
    on: {
      input: () => {
        draft.value = input.value;
      },
    },
  });
  input.value = draft.value;
  linkDraft = { listId: list.id, input, draft };

  // Maps share text is "name / address / link" on separate lines. The one-line field shows it
  // with spaces, but the form gets the original lines so it can still read the name and address.
  input.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    const shown = text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    input.setRangeText(shown, input.selectionStart ?? 0, input.selectionEnd ?? 0, 'end');
    draft.pasted = { raw: text.trim(), shown };
    draft.value = input.value; // setRangeText fires no input event
  });

  // An empty field still opens the form, for adding a place by hand.
  const onSubmit = (event) => {
    event.preventDefault();
    const typed = input.value.trim();
    const { pasted } = draft;
    setPrefill(pasted && typed === pasted.shown ? pasted.raw : typed);
    linkDraft = null; // handed to the form; coming back starts empty
    ctx.nav(listHash(list, '/place/new'));
  };

  return h(
    'div',
    {},
    h(
      'form',
      { attrs: { novalidate: true }, on: { submit: onSubmit } },
      h('label', { class: 'label', attrs: { for: inputId } }, t(S, 'linkLabel')),
      h('div', { class: 'input-wrap input-wrap--icon' }, icon('link', { size: 18 }), input),
      h(
        'div',
        { class: 'mt-8' },
        h(
          'button',
          { class: 'btn btn--secondary btn--sm', attrs: { type: 'submit' } },
          icon('plus', { size: 16 }),
          h('span', {}, t(S, 'add')),
        ),
      ),
    ),
    h(
      'div',
      { class: 'stack stack--8 mt-20', attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'placeholder-row' }),
      h('div', { class: 'placeholder-row' }),
    ),
    h('p', { class: 'hint hint--center mt-16' }, t(S, 'emptyLine')),
  );
}

// ---- delete, with a confirm step ----

function openDeleteSheet(ctx, state) {
  const cancel = h('button', { class: 'btn btn--ghost btn--block', attrs: { type: 'button' } }, h('span', {}, tc('cancel')));
  const confirm = h(
    'button',
    { class: 'btn btn--danger btn--block', attrs: { type: 'button' } },
    icon('trash', { size: 18 }),
    h('span', {}, t(S, 'deleteConfirm')),
  );

  const close = openSheet(
    [
      h('p', { class: 'text-body' }, t(S, 'deleteBody')),
      state.list.sharedAt !== null &&
        h('p', { class: 'hint mt-8' }, icon('link', { size: 14 }), h('span', {}, t(S, 'deleteShared'))),
      h('div', { class: 'sheet__actions' }, confirm, cancel),
    ],
    { label: t(S, 'deleteTitle') },
  );

  cancel.addEventListener('click', close);
  confirm.addEventListener('click', () => {
    store.deleteList(state.list.id);
    close();
    toast(t(S, 'deleted'));
    ctx.nav('#/');
  });
  cancel.focus(); // the safe choice starts focused
}

function deleteRow(ctx, state) {
  return h(
    'div',
    { class: 'center-row mt-32' },
    h(
      'button',
      { class: 'btn btn--danger-link', attrs: { type: 'button' }, on: { click: () => openDeleteSheet(ctx, state) } },
      icon('trash', { size: 16 }),
      h('span', {}, t(S, 'deleteList')),
    ),
  );
}

// ---- sticky bottom bar ----

function bottomBar(list) {
  const classes = 'btn btn--primary btn--lg btn--block';
  const label = h('span', {}, tc('continueShare'));
  if (list.places.length >= MIN_TO_SHARE) {
    return h('div', { class: 'bottom-bar' }, h('a', { class: classes, attrs: { href: listHash(list, '/share') } }, label));
  }
  const helpId = uid('share-help');
  return h(
    'div',
    { class: 'bottom-bar' },
    h('button', { class: classes, attrs: { type: 'button', disabled: true, 'aria-describedby': helpId } }, label),
    h('p', { class: 'hint hint--center mt-8', id: helpId }, icon('info-circle', { size: 14 }), h('span', {}, t(S, 'ctaHelper'))),
  );
}

// ---- screens ----

function notFoundScreen() {
  const home = h(
    'a',
    { class: 'btn btn--ghost', attrs: { href: '#/' } },
    icon('home', { size: 18 }),
    h('span', {}, tc('goHome')),
  );
  return h(
    'div',
    { class: 'screen screen--nobar' },
    topBar({ back: '#/', backLabel: tc('back') }),
    pageHeader({ title: t(S, 'notFoundTitle') }),
    emptyState({ icon: 'alert-circle', text: `${tc('errNotFound')} ${t(S, 'notFoundHint')}`, action: home }),
  );
}

export async function render(ctx) {
  // Another list (or none) drops the last list's unsent link.
  if (linkDraft && linkDraft.listId !== ctx.params.id) linkDraft = null;
  const list = store.getList(ctx.params.id);
  if (!list) return notFoundScreen();

  // Inline edits save without a re-render, so they keep the latest copy here.
  const state = { list };
  const canSave = store.storageOk();
  const note = changedNote(list);

  // Saves one text field onto the freshest stored copy. False when the list is gone.
  const saveField = (key, value) => {
    const fresh = store.getList(list.id);
    if (!fresh) return false;
    state.list = store.saveList({ ...fresh, [key]: value });
    note.hidden = !showChanged(state.list);
    return true;
  };

  const hasPlaces = list.places.length > 0;
  return h(
    'div',
    { class: ['screen', list.places.length < MIN_TO_SHARE && 'screen--tall-bar'] },
    topBar({ back: '#/', backLabel: tc('back') }),
    header(state, ctx, saveField, canSave),
    h(
      'div',
      { class: 'stack mt-20' },
      !canSave && storageNote(),
      note,
      hasPlaces ? placeList(ctx, list) : emptyAdd(ctx, list),
    ),
    deleteRow(ctx, state),
    bottomBar(list),
  );
}
