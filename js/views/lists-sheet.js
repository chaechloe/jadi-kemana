// "Daftar kamu": the list switcher sheet. Its rows and the "open a list from a link" form are
// exported too, so the Welcome screen shows the same UI.
import { h, icon, uid, toast, openSheet } from '../ui.js';
import { listRow, placeTile } from '../components.js';
import { getLang, t, tc, relativeTime } from '../i18n.js';
import { getLists, createList, importList } from '../store.js';
import { decodeList, CodecError } from '../codec.js';

const S = {
  id: {
    listMeta: '{places} · {edited}',
    openFromLink: 'Buka daftar dari link',
    linkLabel: 'Tempel link daftar',
    linkPlaceholder: 'https://…/jadi-kemana/#d=…',
    open: 'Buka',
    footer: 'Daftar cuma disimpan di HP ini. Link yang udah kamu bagikan bisa dibuka lagi kapan aja.',
    opened: 'Daftar dibuka',
    updated: 'Daftar udah diperbarui',
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
    footer: "Lists are only saved on this phone. Any link you've shared can be opened again anytime.",
    opened: 'List opened',
    updated: 'List updated',
    errEmpty: 'Paste the list link first.',
    errNotLink: "This isn't a list link. Try copying it from the chat again.",
    errBroken: '{title}. Try copying the whole link again.',
    errWithHint: '{title}. {hint}',
  },
};

const decorative = { 'aria-hidden': 'true' };
const listHash = (id) => `#/list/${id}`;
const placesLabel = (n) => tc(n === 1 ? 'onePlace' : 'manyPlaces', { n });

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
    href: listHash(list.id),
    onClick,
    trail,
    current,
  });
}

/** Creates an empty list and opens it in the editor. */
export function startNewList(ctx) {
  const list = createList({ title: tc('newList'), from: '' });
  ctx.nav(listHash(list.id));
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
export function findPayload(text) {
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

/** Decodes pasted text and saves the list: { list, existed }, or { error } with a friendly message. */
async function importFromText(text) {
  if (!text.trim()) return { error: t(S, 'errEmpty') };
  const payload = findPayload(text);
  if (!payload) return { error: t(S, 'errNotLink') };
  try {
    return importList(await decodeList(payload));
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

// The import form's draft. A language switch rebuilds the screen while the old form is still
// mounted; the new form picks the draft up (open or not, and the pasted link), so nothing is lost.
// Any other arrival (another screen, a fresh sheet) starts closed and empty.
let importDraft = null; // { key, row, draft: { formId, inputId, errorId, open, value } }

/**
 * "Buka daftar dari link": a disclosure row revealing a paste field and a "Buka" button.
 * A good link is saved (replacing a list with the same id) and opened in the editor.
 * `close` closes the sheet it sits in, if any.
 */
export function linkImportItem(ctx, { close } = {}) {
  const key = `${close ? 'sheet' : 'page'}:${location.hash || '#/'}`;
  const resume = importDraft?.key === key && importDraft.row.isConnected;
  // The ids are kept too, so main.js can put focus back on the same control.
  const draft = resume
    ? importDraft.draft
    : { formId: uid('link-import'), inputId: uid('list-link'), errorId: uid('list-link-error'), open: false, value: '' };
  const { formId, inputId, errorId } = draft;
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
  input.value = draft.value;
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

    const result = await importFromText(input.value);
    busy = false;
    submit.removeAttribute('aria-disabled');
    if (result.error) {
      showError(result.error);
      return;
    }
    importDraft = null; // done: coming back starts closed and empty
    close?.();
    toastAfterRender(t(S, result.existed ? 'updated' : 'opened'));
    ctx.nav(listHash(result.list.id));
  }

  if (draft.open) setOpen(true, { focus: false });
  const row = h('li', {}, toggle, form);
  importDraft = { key, row, draft };
  return row;
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
      onClick: rowClick(ctx, closeSheet, listHash(list.id), current),
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
