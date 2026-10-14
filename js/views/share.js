// Share screen (#/list/<id>/share): a preview of the group message, how far the link fits
// across chat apps, and the ways to send it. See docs/ARCHITECTURE.md.
import { h, icon, toast, openSheet, copyText, shareText, uid } from '../ui.js';
import { topBar, pageHeader, sendButton, ghostRow, emptyState } from '../components.js';
import { getLang, t, tc } from '../i18n.js';
import { getList, markShared } from '../store.js';
import { encodeList, listUrl } from '../codec.js';
import { waLink, listMessage } from '../links.js';

const S = {
  id: {
    title: 'Bagikan ke grup',
    previewAria: 'Contoh tampilan pesan di grup',
    previewDesc: 'Kumpulin tempat, bahas bareng di grup.',
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
  },
  en: {
    title: 'Share with the group',
    previewAria: 'Preview of the group message',
    previewDesc: 'Collect places, talk them over in the group.',
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
  },
};

// The longest link (in characters) each group of apps still takes. WhatsApp takes longer ones.
const INSTAGRAM_MAX = 1000;
const CHATS_MAX = 4000;

// Characters of the payload shown in the preview bubble before the "…".
const PREVIEW_PAYLOAD_CHARS = 24;

// ---- small helpers ----

const placesLabel = (n) => tc(n === 1 ? 'onePlace' : 'manyPlaces', { n });
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

/** A brand-soft (or danger) note with a leading 14px icon. */
function note(name, text, { danger = false, extra } = {}) {
  return h(
    'p',
    { class: ['note', danger && 'note--danger', extra] },
    icon(name, { size: 14 }),
    h('span', { class: 'note__body' }, text),
  );
}

function screen(back, ...children) {
  return h('div', { class: 'screen screen--nobar' }, topBar({ back }), children);
}

function header(list) {
  const title = list.title || tc('untitled');
  return pageHeader({
    title: t(S, 'title'),
    meta: `${title} · ${placesLabel(list.places.length)}`,
    metaIcon: 'list',
  });
}

// ---- chat preview ----

function previewCard() {
  const host = location.host;
  return h(
    'div',
    { class: 'preview-card' },
    h(
      'div',
      { class: 'preview-card__thumb', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'preview-card__mini preview-card__mini--a' }),
      h('span', { class: 'preview-card__mini preview-card__mini--b' }),
      icon('map-pin', { size: 22 }),
    ),
    h(
      'div',
      { class: 'preview-card__text' },
      h('p', { class: 'preview-card__title' }, tc('appName')),
      h('p', { class: 'preview-card__desc' }, t(S, 'previewDesc')),
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

  if (length <= INSTAGRAM_MAX) return [line('fitsAll')];
  if (length <= CHATS_MAX) return [line('fitsChat'), note('alert-circle', t(S, 'igNote'), { extra: 'mt-12' })];
  // Past LINE and Telegram the danger note replaces the Instagram one; Send (WhatsApp) still works.
  return [line('fitsWhatsApp'), note('alert-triangle', t(S, 'tooLong'), { danger: true, extra: 'mt-12' })];
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

/** Copies text; on success marks the list shared and confirms, otherwise offers a manual copy. */
async function copyAndMark(listId, text, { toastKey, labelKey }) {
  if (await copyText(text)) {
    markShared(listId);
    toast(t(S, toastKey));
  } else {
    copyByHand(text, t(S, labelKey));
  }
}

// shareText() is called before the first await, so the browser still sees the tap.
async function shareMessage(listId, message) {
  const result = await shareText(message);
  if (result === 'shared') markShared(listId);
  else if (result === 'unsupported') {
    await copyAndMark(listId, message, { toastKey: 'toastMessageCopied', labelKey: 'messageLabel' });
  }
}

function actions(listId, { url, message, payload }) {
  const send = sendButton({ href: waLink(message), label: tc('send') });
  send.classList.add('mt-24');
  // The link opens WhatsApp in a new tab; recording the share must not stop it.
  send.addEventListener('click', () => markShared(listId));

  const row = ghostRow([
    {
      icon: 'copy',
      label: tc('copyLink'),
      onClick: () => copyAndMark(listId, url, { toastKey: 'toastCopied', labelKey: 'linkLabel' }),
    },
    { icon: 'share', label: tc('share'), onClick: () => shareMessage(listId, message) },
    { icon: 'eye', label: tc('previewFriend'), href: `#d=${payload}&from=${listId}` },
  ]);
  row.classList.add('mt-8');
  row.lastElementChild.classList.add('ghost-row__btn--wide'); // the long "preview as a friend" label

  return [send, row];
}

// ---- dead ends ----

function notFound() {
  const home = h('a', { class: 'btn btn--ghost', attrs: { href: '#/' } }, tc('goHome'));
  return screen('#/', pageHeader({ title: t(S, 'title') }), emptyState({ icon: 'alert-circle', text: tc('errNotFound'), action: home }));
}

function emptyList(list) {
  const back = h('a', { class: 'btn btn--ghost', attrs: { href: `#/list/${list.id}` } }, t(S, 'backToList'));
  return screen(`#/list/${list.id}`, header(list), emptyState({ icon: 'map-pin', text: t(S, 'emptyText'), action: back }));
}

// ---- view ----

export async function render(ctx) {
  const list = getList(ctx.params.id);
  if (!list) return notFound();
  if (list.places.length < 1) return emptyList(list);

  const lang = getLang();
  const payload = await encodeList(list);
  const url = listUrl(payload);
  const message = listMessage(list, url, lang);

  return screen(
    `#/list/${list.id}`,
    header(list),
    chatPreview(message, url, lang),
    fitNotes(url.length, lang),
    actions(list.id, { url, message, payload }),
    note('bookmark', t(S, 'backup'), { extra: 'mt-24' }),
  );
}
