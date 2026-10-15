// "Daftar kamu": the list switcher sheet. Its rows and the "open a list from a link" form are
// exported too, so the Welcome screen shows the same UI.
import { h, icon, toast, openSheet } from '../ui.js';
import { listRow, placeTile, placesLabel, chooseSheet, decorative } from '../components.js';
import { getLang, t, tc, relativeTime } from '../i18n.js';
import { getLists, createList, importList, compareWithSaved, savedToDevice } from '../store.js';
import { decodeList, CodecError } from '../codec.js';
import * as routes from '../routes.js';

const S = {
  id: {
    listMeta: '{places} · {edited}',
    openFromLink: 'Buka daftar dari link',
    linkLabel: 'Tempel link daftar',
    linkPlaceholder: 'https://…/jadi-kemana/#d=…',
    open: 'Buka',
    footer: 'Daftar cuma disimpan di perangkat ini. Link yang udah kamu bagikan bisa dibuka lagi kapan aja.',
    opened: 'Daftar dibuka',
    updated: 'Daftar udah diganti pakai versi link',
    savedCopy: 'Disimpan sebagai daftar baru',
    conflictTitle: 'Daftar ini udah ada di perangkat ini',
    conflictBody: 'Isi link ini beda sama yang kesimpan. Kalau diganti, perubahan yang belum kamu bagikan bakal hilang.',
    keepBoth: 'Simpan sebagai daftar baru',
    replace: 'Ganti pakai versi link',
    errEmpty: 'Tempel dulu link daftarnya ya.',
    errNotLink: 'Ini bukan link daftar. Coba salin lagi dari chat-nya ya.',
    errBroken: '{title}. Coba salin lagi link lengkapnya ya.',
    errWithHint: '{title}. {hint}',
  },
  en: {
    listMeta: '{places} · {edited}',
    openFromLink: 'Open a list from a link',
    linkLabel: 'Paste the list link',
    linkPlaceholder: 'https://…/jadi-kemana/#d=…',
    open: 'Open',
    footer: "Lists are only saved on this device. Any link you've shared can be opened again anytime.",
    opened: 'List opened',
    updated: 'List replaced with the version from the link',
    savedCopy: 'Saved as a new list',
    conflictTitle: 'This list is already on this device',
    conflictBody: "This link doesn't match the saved list. Replacing it loses any changes you haven't shared yet.",
    keepBoth: 'Save as a new list',
    replace: 'Replace with the link version',
    errEmpty: 'Paste the list link first.',
    errNotLink: "This isn't a list link. Try copying it from the chat again.",
    errBroken: '{title}. Try copying the whole link again.',
    errWithHint: '{title}. {hint}',
  },
};


// ---- rows ----

/** The list's tile: its first place's colour and emoji, or a neutral tile while it's empty. */
function listTile(list) {
  const first = list.places[0];
  if (first) return placeTile(first);
  return h('span', { class: 'tile tile--fill', attrs: decorative }, icon('list'));
}

/** A saved list as a row: tile, title and "5 tempat · diubah 2 hari lalu", linking to the editor. */
export function listItem(list, { current = false, trail = null, onClick } = {}) {
  return listRow({
    tile: listTile(list),
    title: list.title || tc('untitled'),
    meta: t(S, 'listMeta', {
      places: placesLabel(list.places.length),
      edited: relativeTime(list.updatedAt, getLang()),
    }),
    href: routes.list(list.id),
    onClick,
    trail,
    current,
  });
}

/** Creates an empty, unnamed list and opens it in the editor (Share asks for a name later). */
export function startNewList(ctx) {
  const list = createList();
  ctx.nav(routes.list(list.id));
}

/** The "+ Daftar baru" row. `close` closes the sheet it sits in, if any. */
export function newListItem(ctx, { close } = {}) {
  const onClick = () => {
    close?.();
    startNewList(ctx);
  };
  return h(
    'li',
    {},
    h(
      'button',
      { class: 'row row--add', attrs: { type: 'button' }, on: { click: onClick } },
      h('span', { class: 'tile tile--dashed', attrs: decorative }, icon('plus')),
      h('span', {}, tc('newList')),
    ),
  );
}

// ---- open a list from a link ----

const LINK_PAYLOAD = /(?:^|[#&])d=([A-Za-z0-9_-]+)/;
const BARE_PAYLOAD = /^\d[a-z][A-Za-z0-9_-]+$/; // version digit, mode letter, base64url data

/** The payload inside a pasted link or share message, or a pasted bare payload; '' when there is none. */
function findPayload(text) {
  const value = String(text ?? '').trim();
  const match = value.match(LINK_PAYLOAD);
  if (match) return match[1];
  return BARE_PAYLOAD.test(value) ? value : '';
}

function decodeErrorMessage(err) {
  const code = err instanceof CodecError ? err.code : 'corrupt';
  if (code === 'version') {
    return t(S, 'errWithHint', { title: tc('errVersionTitle'), hint: tc('errVersionBody') });
  }
  if (code === 'unsupported') {
    return t(S, 'errWithHint', { title: tc('errUnsupportedTitle'), hint: tc('errUnsupportedBody') });
  }
  return t(S, 'errBroken', { title: tc('errBrokenTitle') });
}

/** Decodes pasted text: { list }, or { error } with a friendly message. Nothing is saved yet. */
async function listFromText(text) {
  if (!text.trim()) return { error: t(S, 'errEmpty') };
  const payload = findPayload(text);
  if (!payload) return { error: t(S, 'errNotLink') };
  try {
    return { list: await decodeList(payload) };
  } catch (err) {
    return { error: decodeErrorMessage(err) };
  }
}

const TOAST_FALLBACK_MS = 2000;

// Waits for the next screen to land in #app before toasting, so the toast sits above that
// screen's bottom bar rather than the one being left.
function toastAfterRender(message) {
  const app = document.getElementById('app');
  if (!app || typeof MutationObserver !== 'function') {
    toast(message);
    return;
  }
  let timer = 0;
  const observer = new MutationObserver(() => show());
  function show() {
    observer.disconnect();
    clearTimeout(timer);
    toast(message);
  }
  observer.observe(app, { childList: true });
  timer = setTimeout(show, TOAST_FALLBACK_MS);
}

/**
 * "Buka daftar dari link": a disclosure row revealing a paste field and a "Buka" button.
 * A good link is saved and opened in the editor. When the same list is already saved with other
 * content (an older link from the chat, say), it asks first: save as a new list, or replace.
 * `close` closes the sheet it sits in, if any. On a page the draft (open or not, the pasted link)
 * lives in ctx.state, so a language switch keeps it; a sheet starts closed and empty every time.
 */
export function linkImportItem(ctx, { close } = {}) {
  const draft = close ? {} : (ctx.state.linkImport ??= {}); // { open, value }
  // Stable ids, so main.js can put focus back on the same control after a re-render.
  const formId = close ? 'jk-sheet-link-import' : 'jk-link-import';
  const inputId = `${formId}-input`;
  const errorId = `${formId}-error`;
  let busy = false;

  const chevron = h('span', { class: 'row__trail' }, icon('chevron-down'));
  const toggle = h(
    'button',
    {
      class: 'row row--add link-import__toggle',
      id: `${formId}-toggle`,
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': formId },
      on: { click: () => setOpen(form.hidden) },
    },
    h('span', { class: 'tile tile--fill', attrs: decorative }, icon('link')),
    h('span', { class: 'grow' }, t(S, 'openFromLink')),
    chevron,
  );

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
      placeholder: t(S, 'linkPlaceholder'),
    },
    on: { input: onInput },
  });
  input.value = draft.value ?? '';
  const error = h('p', { class: 'helper helper--error', id: errorId, attrs: { role: 'alert', hidden: true } });
  const submit = h('button', { class: 'btn btn--secondary btn--sm', attrs: { type: 'submit' } }, h('span', {}, t(S, 'open')));

  // novalidate: a bare payload is not a URL, and errors are shown in our own words.
  const form = h(
    'form',
    { class: 'link-import', id: formId, attrs: { hidden: true, novalidate: true }, on: { submit: onSubmit } },
    h('label', { class: 'label', attrs: { for: inputId } }, t(S, 'linkLabel')),
    input,
    error,
    h('div', { class: 'mt-12' }, submit),
  );

  // `focus: false` when restoring a draft: main.js puts focus back itself.
  function setOpen(open, { focus = true } = {}) {
    draft.open = open;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    chevron.replaceChildren(icon(open ? 'chevron-up' : 'chevron-down'));
    if (open && focus) input.focus();
  }

  function onInput() {
    draft.value = input.value;
    clearError();
  }

  function showError(message) {
    error.replaceChildren(icon('alert-circle', { size: 14 }), h('span', {}, message));
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorId);
    input.focus();
  }

  function clearError() {
    if (error.hidden) return;
    error.hidden = true;
    error.replaceChildren();
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    submit.setAttribute('aria-disabled', 'true');
    clearError();

    const result = await listFromText(input.value);
    busy = false;
    submit.removeAttribute('aria-disabled');
    if (result.error) {
      showError(result.error);
      return;
    }

    const open = (list, message) => {
      close?.();
      toastAfterRender(savedToDevice() ? message : tc('errNotSaved'));
      ctx.nav(routes.list(list.id));
    };
    const { status } = compareWithSaved(result.list);
    if (status === 'same') open(result.list, t(S, 'opened'));
    else if (status === 'new') open(importList(result.list).list, t(S, 'opened'));
    else {
      chooseSheet({
        title: t(S, 'conflictTitle'),
        body: h('p', { class: 'muted' }, t(S, 'conflictBody')),
        choices: [
          { label: t(S, 'keepBoth'), icon: 'copy', onChoose: () => open(importList(result.list, { asCopy: true }).list, t(S, 'savedCopy')) },
          { label: t(S, 'replace'), icon: 'refresh', variant: 'btn--danger', onChoose: () => open(importList(result.list).list, t(S, 'updated')) },
        ],
      });
    }
  }

  if (draft.open) setOpen(true, { focus: false });
  return h('li', {}, toggle, form);
}

// ---- the sheet ----

// A plain click closes the sheet and opens the list; a modified click keeps the browser's default.
function rowClick(ctx, close, hash, current) {
  return (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
    if (!current) ctx.nav(hash);
  };
}

/** Opens the "Daftar kamu" sheet. `currentId` marks the list being edited. Returns close(). */
export function openListsSheet(ctx, { currentId = null } = {}) {
  let close = () => {};
  const closeSheet = () => close();

  const rows = getLists().map((list) => {
    const current = list.id === currentId;
    return listItem(list, {
      current,
      trail: current ? h('span', { class: 'row__trail row__trail--check' }, icon('check')) : null,
      onClick: rowClick(ctx, closeSheet, routes.list(list.id), current),
    });
  });

  const content = [
    h(
      'ul',
      { class: 'list-surface list-surface--flat', attrs: { role: 'list' } },
      rows,
      newListItem(ctx, { close: closeSheet }),
      h('li', { class: 'divider divider--8', attrs: decorative }),
      linkImportItem(ctx, { close: closeSheet }),
    ),
    h('p', { class: 'hint mt-16' }, icon('device-mobile', { size: 14 }), h('span', {}, t(S, 'footer'))),
  ];

  close = openSheet(content, { label: tc('yourLists') });
  return close;
}
