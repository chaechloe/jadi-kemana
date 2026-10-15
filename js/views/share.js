// Share screen (#/list/<id>/share): a preview of the group message, how far the link fits
// across chat apps, and the ways to send it. See docs/ARCHITECTURE.md.
import { h, icon, openSheet, copyWithToast, shareOrCopy, uid } from '../ui.js';
import { topBar, pageHeader, sendButton, ghostRow, deadEnd, note, placesLabel } from '../components.js';
import { getLang, t, tc } from '../i18n.js';
import { getList, markShared, saveList } from '../store.js';
import { encodeList, listUrl } from '../codec.js';
import { waLink, listMessage } from '../links.js';
import { LIMITS } from '../data.js';
import * as routes from '../routes.js';

const S = {
  id: {
    title: 'Bagikan ke grup',
    previewAria: 'Contoh tampilan pesan di grup',
    fitsAll: 'Muat di WhatsApp, LINE, Telegram, sampai DM Instagram · {n} karakter',
    fitsChat: 'Muat di WhatsApp, LINE, Telegram · {n} karakter',
    fitsWhatsApp: 'Cuma muat di WhatsApp · {n} karakter',
    igNote: 'Kepanjangan buat DM Instagram, kirim lewat app lain ya.',
    tooLong: 'Daftarnya kepanjangan, kurangin tempat atau catatannya.',
    backup: 'Link ini juga jadi cadangan daftar kamu, simpan ya.',
    toastCopied: 'Link udah disalin',
    toastMessageCopied: 'Pesannya udah disalin, tinggal tempel di grup',
    manualTitle: 'Salin manual',
    manualHint: 'Browser ini nggak bisa nyalin otomatis. Pilih teksnya, terus salin ya.',
    linkLabel: 'Link daftar',
    messageLabel: 'Pesan buat grup',
    emptyText: 'Daftarnya masih kosong. Tambah tempat dulu, baru bagikan ke grup ya.',
    backToList: 'Balik ke daftar',
    namesTitle: 'Biar grupnya tahu ini daftar apa',
    namesHint: 'Boleh dilewati, tapi pesannya jadi lebih jelas.',
    listName: 'Nama daftar',
    listNamePh: 'Contoh: Nongkrong Sabtu',
    yourName: 'Nama kamu',
    yourNamePh: 'Contoh: Rani',
    saveNames: 'Simpan',
  },
  en: {
    title: 'Share with the group',
    previewAria: 'Preview of the group message',
    fitsAll: 'Fits in WhatsApp, LINE, Telegram and Instagram DMs · {n} characters',
    fitsChat: 'Fits in WhatsApp, LINE and Telegram · {n} characters',
    fitsWhatsApp: 'Only fits in WhatsApp · {n} characters',
    igNote: 'Too long for Instagram DMs, so use another app.',
    tooLong: 'This list is too long. Remove some places or shorten notes.',
    backup: "This link is also your list's backup, so keep it.",
    toastCopied: 'Link copied',
    toastMessageCopied: 'Message copied. Paste it in the group',
    manualTitle: 'Copy it yourself',
    manualHint: "This browser can't copy automatically. Select the text and copy it.",
    linkLabel: 'List link',
    messageLabel: 'Message for the group',
    emptyText: 'This list is empty. Add a place first, then share it with the group.',
    backToList: 'Back to the list',
    namesTitle: 'So the group knows what this list is',
    namesHint: 'You can skip this, but it makes the message clearer.',
    listName: 'List name',
    listNamePh: 'e.g. Saturday hangout',
    yourName: 'Your name',
    yourNamePh: 'e.g. Rani',
    saveNames: 'Save',
  },
};

// The longest link (in characters) each group of apps still takes. WhatsApp takes longer ones.
const INSTAGRAM_MAX = 1000;
const CHATS_MAX = 4000;

// Characters of the payload shown in the preview bubble before the "…".
const PREVIEW_PAYLOAD_CHARS = 24;

// ---- small helpers ----

const formatNumber = (n, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'id-ID').format(n);

/** "19.02" in Bahasa, "19:02" in English. */
function clockTime(date, lang) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}${lang === 'en' ? ':' : '.'}${pad(date.getMinutes())}`;
}

/** The link as the bubble shows it: the base, '#d=' and the start of the payload. */
function shortLink(url) {
  const marker = url.indexOf('#d=');
  const cut = (marker < 0 ? 0 : marker + 3) + PREVIEW_PAYLOAD_CHARS;
  return url.length > cut ? `${url.slice(0, cut)}…` : url;
}

/** The screen's h1 and its "Spot WFC Bandung · 5 tempat" meta line (pageHeader props). */
function heading(list) {
  return {
    title: t(S, 'title'),
    meta: `${list.title || tc('untitled')} · ${placesLabel(list.places.length)}`,
    metaIcon: 'list',
  };
}

// ---- chat preview ----

// The preview chat apps build from index.html's og: tags, so this mock can't drift from it: the
// same image (from this site, which the CSP allows) and the same title and description.
const ogTag = (name) => document.querySelector(`meta[property="og:${name}"]`)?.content ?? '';

function previewCard() {
  const host = location.host;
  return h(
    'div',
    { class: 'preview-card' },
    h('img', {
      class: 'preview-card__image',
      attrs: { src: 'assets/og-image.png', alt: '', width: 1200, height: 630, decoding: 'async' },
    }),
    h(
      'div',
      { class: 'preview-card__text' },
      h('p', { class: 'preview-card__title' }, ogTag('title') || tc('appName')),
      h('p', { class: 'preview-card__desc' }, ogTag('description')),
      host ? h('p', { class: 'preview-card__domain' }, host) : null,
    ),
  );
}

/** The real message text, with its link line styled as a link. */
function messageText(message, url) {
  const at = message.indexOf(url);
  if (at < 0) return h('p', { class: 'bubble__text' }, message);
  return h(
    'p',
    { class: 'bubble__text' },
    message.slice(0, at),
    h('span', { class: 'bubble__link' }, shortLink(url)),
    message.slice(at + url.length),
  );
}

function chatPreview(message, url, lang) {
  return h(
    'section',
    { class: 'chat-wall mt-24', attrs: { 'aria-label': t(S, 'previewAria') } },
    h(
      'div',
      { class: 'bubble bubble--out' },
      previewCard(),
      messageText(message, url),
      h('div', { class: 'bubble__time' }, clockTime(new Date(), lang)),
    ),
  );
}

// ---- where the link fits ----

/** The compatibility line, plus a note when the link is too long for some apps. */
function fitNotes(length, lang) {
  const n = formatNumber(length, lang);
  const line = (key) => h('p', { class: 'hint mt-12' }, icon('check', { size: 14 }), h('span', {}, t(S, key, { n })));

  const small = { size: 14, class: 'mt-12' };

  if (length <= INSTAGRAM_MAX) return [line('fitsAll')];
  if (length <= CHATS_MAX) return [line('fitsChat'), note('alert-circle', t(S, 'igNote'), small)];
  // Past LINE and Telegram the danger note replaces the Instagram one; Send (WhatsApp) still works.
  return [line('fitsWhatsApp'), note('alert-triangle', t(S, 'tooLong'), { ...small, danger: true })];
}

// ---- copy and share ----

/** Last resort when the clipboard is blocked: the text in a sheet, selected, to copy by hand. */
function copyByHand(text, label) {
  const fieldId = uid('share-copy');
  const hintId = uid('share-copy-hint');
  const area = h('textarea', {
    class: 'textarea',
    id: fieldId,
    attrs: { readonly: true, rows: 5, 'aria-describedby': hintId },
    on: { focus: (event) => event.target.select() },
  });
  area.value = text;

  openSheet(
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'label', attrs: { for: fieldId } }, label),
      area,
      h('p', { class: 'helper', id: hintId }, t(S, 'manualHint')),
    ),
    { label: t(S, 'manualTitle') },
  );
}

function actions(listId, { url, message, payload }) {
  const send = sendButton({ href: waLink(message), label: tc('send') });
  send.classList.add('mt-24');
  // The link opens WhatsApp in a new tab; recording the share must not stop it.
  send.addEventListener('click', () => markShared(listId));

  // Copied or shared (a copy stands in where there is no share sheet): the list counts as shared.
  // A failed copy offers to copy by hand instead of an error toast.
  const markIfDone = (ok) => ok && markShared(listId);
  const toasts = (text, toastKey, labelKey) => ({
    done: t(S, toastKey),
    failed: () => copyByHand(text, t(S, labelKey)),
  });
  const copyLink = () => copyWithToast(url, toasts(url, 'toastCopied', 'linkLabel')).then(markIfDone);
  const share = () => shareOrCopy(message, toasts(message, 'toastMessageCopied', 'messageLabel')).then(markIfDone);

  const row = ghostRow([
    { icon: 'copy', label: tc('copyLink'), onClick: copyLink },
    { icon: 'share', label: tc('share'), onClick: share },
    { icon: 'eye', label: tc('previewFriend'), href: routes.friend(payload, { from: listId }) },
  ]);
  row.classList.add('mt-8');
  row.lastElementChild.classList.add('ghost-row__btn--wide'); // the long "preview as a friend" label

  return [send, row];
}

// ---- names ----

/**
 * Shown while the list has no name or no sender: fields for whichever is missing, so the message
 * doesn't say "Daftar tanpa nama" and friends see who sent it. Saving rebuilds the link.
 */
function namesCard(ctx, list) {
  const fields = [];
  const field = (key, label, placeholder, max) => {
    const id = uid(`share-${key}`);
    const input = h('input', {
      class: 'input',
      id,
      attrs: { type: 'text', maxlength: max, autocomplete: key === 'from' ? 'given-name' : 'off', placeholder },
    });
    fields.push([key, input]);
    return h('div', { class: 'field mt-12' }, h('label', { class: 'label', attrs: { for: id } }, label), input);
  };
  const save = (event) => {
    event.preventDefault();
    const changes = Object.fromEntries(fields.map(([key, input]) => [key, input.value.trim()]).filter(([, value]) => value));
    if (!Object.keys(changes).length) return;
    saveList({ ...list, ...changes });
    ctx.rerender();
  };
  return h(
    'form',
    { class: 'names-card', attrs: { novalidate: true }, on: { submit: save } },
    h('h2', { class: 'names-card__title' }, t(S, 'namesTitle')),
    h('p', { class: 'hint mt-4' }, t(S, 'namesHint')),
    !list.title && field('title', t(S, 'listName'), t(S, 'listNamePh'), LIMITS.title),
    !list.from && field('from', t(S, 'yourName'), t(S, 'yourNamePh'), LIMITS.from),
    h('button', { class: 'btn btn--secondary btn--block mt-12', attrs: { type: 'submit' } }, t(S, 'saveNames')),
  );
}

// ---- view ----

export async function render(ctx) {
  const list = getList(ctx.params.id);
  if (!list) {
    const title = t(S, 'title');
    return deadEnd({ back: routes.home(), title, icon: 'alert-circle', text: tc('errNotFound'), label: tc('goHome') });
  }
  const back = routes.list(list.id);
  if (list.places.length < 1) {
    return deadEnd({ back, ...heading(list), icon: 'map-pin', text: t(S, 'emptyText'), label: t(S, 'backToList') });
  }

  const lang = getLang();
  const payload = await encodeList(list);
  const url = listUrl(payload);
  const message = listMessage(list, url, lang);

  // Wide screens: the chat preview on the left, what fits where and the buttons beside it.
  return h(
    'div',
    { class: 'screen screen--nobar layout layout--aside-end' },
    topBar({ back }),
    h('div', { class: 'l-main' }, pageHeader(heading(list)), chatPreview(message, url, lang)),
    h(
      'div',
      { class: 'l-aside' },
      (!list.title || !list.from) && namesCard(ctx, list),
      // What actually travels is the whole message, link included, so that's what has to fit.
      fitNotes(message.length, lang),
      actions(list.id, { url, message, payload }),
      note('bookmark', t(S, 'backup'), { size: 14, class: 'mt-24' }),
    ),
  );
}
