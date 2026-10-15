// Shared visual building blocks. Everything is built with h(); classes come from css/app.css.
// See docs/ARCHITECTURE.md ("Modules", components.js).
import { h, icon, openSheet } from './ui.js';
import { getLang, setLang, t, tc, formatHours, formatRating } from './i18n.js';
import { PERKS, EMOJIS, colorHex } from './data.js';
import { isSafeMapsUrl, linkInfo } from './links.js';

const S = {
  id: {
    language: 'Bahasa',
    address: 'Alamat',
    ratedLabel: 'Rating',
    perksOne: '{n} fasilitas',
    perksMany: '{n} fasilitas',
    hours: 'Jam buka',
    rating: 'Rating {r}',
    ratingCount: 'Rating {r}, {n} ulasan',
    note: 'Catatan',
    noteFrom: 'Catatan dari {name}',
  },
  en: {
    language: 'Language',
    address: 'Address',
    ratedLabel: 'Rated',
    perksOne: '{n} facility',
    perksMany: '{n} facilities',
    hours: 'Hours',
    rating: 'Rated {r}',
    ratingCount: 'Rated {r} across {n} reviews',
    note: 'Note',
    noteFrom: 'Note from {name}',
  },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- small helpers ----

const placeStyle = (place) => ({ '--place': colorHex(place.color) });
const emojiOf = (place) => place.emoji || EMOJIS[0];
/** attrs for a purely visual element that screen readers skip. */
export const decorative = { 'aria-hidden': 'true' };

/** Text for screen readers only. */
export const hidden = (text) => h('span', { class: 'visually-hidden' }, text);

/** '1 tempat' / '5 places'. */
export const placesLabel = (n) => tc(n === 1 ? 'onePlace' : 'manyPlaces', { n });

/** "Lengkong · Bandung": the last two parts of a "street, area, city" address ('' if it can't tell). */
function placeOverline(place) {
  const parts = String(place.address ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^\d+$/.test(part) && part.toLowerCase() !== 'indonesia');
  if (parts.length >= 3) return parts.slice(-2).join(' · ');
  return parts.length === 2 ? parts[1] : '';
}

/** Splits formatRating() output: '4,9 (1.146)' → { value: '4,9', count: '(1.146)', label }. */
function ratingParts(place) {
  const text = formatRating(place.rating, place.ratingCount, getLang());
  if (!text) return null;
  const space = text.indexOf(' ');
  const value = space < 0 ? text : text.slice(0, space);
  const count = space < 0 ? '' : text.slice(space + 1);
  const label = count ? t(S, 'ratingCount', { r: value, n: count.slice(1, -1) }) : t(S, 'rating', { r: value });
  return { value, count, label };
}

function mapsLink(url, label, extraClass) {
  return h(
    'a',
    { class: ['link', 'link--hit', extraClass], attrs: { href: url, target: '_blank', rel: 'noopener' } },
    label,
  );
}

// ---- top of the screen ----

/** ID/EN segmented control. Switching calls setLang(); main.js re-renders and restores focus. */
export function langToggle({ band = false } = {}) {
  const current = getLang();
  const option = (lang, code, labelKey) =>
    h(
      'button',
      {
        class: 'seg__btn',
        attrs: { type: 'button', lang, 'aria-label': tc(labelKey), 'aria-pressed': lang === current },
        on: { click: () => lang !== getLang() && setLang(lang) },
      },
      h('span', { class: 'seg__pill', attrs: decorative }, code),
    );

  return h(
    'div',
    { class: ['seg', band && 'seg--band'], attrs: { role: 'group', 'aria-label': t(S, 'language') } },
    option('id', 'ID', 'langId'),
    option('en', 'EN', 'langEn'),
  );
}

let watchingScroll = false;

function syncTopbars() {
  const scrolled = window.scrollY > 0;
  for (const bar of document.querySelectorAll('.topbar:not(.topbar--band)')) {
    bar.classList.toggle('is-scrolled', scrolled);
  }
}

// One shared listener gives every sticky top bar its hairline once the page scrolls.
function watchScroll(bar) {
  bar.classList.toggle('is-scrolled', window.scrollY > 0);
  if (watchingScroll) return;
  watchingScroll = true;
  window.addEventListener('scroll', syncTopbars, { passive: true });
}

/**
 * 56px top app bar. Left: a back button (when `back` is a hash), then `start`; with neither, the
 * wordmark. Right: `end`, or the language toggle when `end` is left out (pass null for nothing).
 */
export function topBar({ back = null, start, end, band = false } = {}) {
  const lead = [];
  // Wide screens show the logo on every screen (a link home); CSS hides it on phones.
  if (back || start) {
    lead.push(
      h(
        'a',
        { class: 'topbar__brand', attrs: { href: '#/' } },
        h('img', { attrs: { src: 'assets/icons/logo.svg', alt: '', width: 28, height: 28 } }),
        h('span', { class: 'wordmark' }, tc('appName')),
      ),
    );
  }
  if (back) lead.push(iconButton({ icon: 'arrow-left', label: tc('back'), href: back }));
  if (start) lead.push(start);
  else if (!back) lead.push(h('span', { class: 'wordmark' }, tc('appName')));

  const bar = h(
    'header',
    { class: ['topbar', band && 'topbar--band'] },
    h('div', { class: 'topbar__start' }, lead),
    h('div', { class: 'topbar__end' }, end === undefined ? langToggle({ band }) : end),
  );
  if (!band) watchScroll(bar);
  return bar;
}

/** h1 (tabindex=-1, focused after navigation), an optional meta line and a trailing action. */
export function pageHeader({ title, meta, metaIcon, action } = {}) {
  const hasMeta = meta != null && meta !== '';
  return h(
    'div',
    { class: 'page-header' },
    h('div', { class: 'page-header__row' }, h('h1', { class: 'page-header__title', attrs: { tabindex: '-1' } }, title), action),
    hasMeta &&
      h(
        'p',
        { class: 'page-header__meta' },
        metaIcon && icon(metaIcon, { size: 14 }),
        typeof meta === 'string' ? h('span', {}, meta) : meta,
      ),
  );
}

/**
 * A screen (no bottom bar) that can only say why it can't go on: the back button, the h1 with an
 * optional meta line, and an empty state whose ghost link `label` leads to `back` as well.
 */
export function deadEnd({ back, title, meta, metaIcon, icon: name, text, label }) {
  return h(
    'div',
    { class: 'screen screen--nobar' },
    topBar({ back }),
    pageHeader({ title, meta, metaIcon }),
    emptyState({ icon: name, text, action: h('a', { class: 'btn btn--ghost', attrs: { href: back } }, label) }),
  );
}

// ---- place visuals ----

/** Rounded-square tile in the place colour with its emoji. Sizes: 32, 40, 48, 56. */
export function placeTile(place) {
  return h('span', { class: 'tile', style: placeStyle(place), attrs: decorative }, emojiOf(place));
}

/** Star + value + (count) on a cover; null without a rating. */
function ratingChip(place) {
  const rating = ratingParts(place);
  if (!rating) return null;
  return h(
    'span',
    { class: 'rating-chip', attrs: { role: 'img', 'aria-label': rating.label } },
    icon('star-filled', { size: 14 }),
    h('span', { class: 'rating-chip__value' }, rating.value),
    rating.count && h('span', { class: 'rating-chip__count' }, rating.count),
  );
}

/** The Friend card's "photo": place colour + dots, emoji tile, rating chip, area overline and name. */
export function cover(place) {
  const overline = placeOverline(place);
  return h(
    'div',
    { class: 'cover', style: placeStyle(place) },
    h('span', { class: 'tile tile--56 tile--glass cover__emoji', attrs: decorative }, emojiOf(place)),
    ratingChip(place),
    h(
      'div',
      { class: 'cover__text' },
      overline && h('span', { class: 'cover__overline' }, overline),
      h('h2', { class: 'cover__name' }, place.name),
    ),
  );
}

function ticketRating(place) {
  const rating = ratingParts(place);
  if (!rating) return null;
  return h(
    'span',
    { class: 'ticket__fact' },
    icon('star-filled', { size: 14 }),
    hidden(rating.label),
    h('span', { class: 'ticket__value', attrs: decorative }, rating.value),
    rating.count && h('span', { class: 'ticket__count', attrs: decorative }, rating.count),
  );
}

function ticketHours(place, size) {
  const clock = icon('clock', { size: 14 });
  if (place.hours === 'open24') {
    return h('span', { class: ['ticket__fact', size === 'l' && 'tag tag--on-color'] }, clock, h('span', {}, tc('open24')));
  }
  const text = formatHours(place.hours, getLang());
  if (text) return h('span', { class: 'ticket__fact' }, clock, hidden(`${t(S, 'hours')}: `), h('span', {}, text));
  if (!isSafeMapsUrl(place.maps)) return null;
  // Only the large ticket is real content; smaller ones are decorative, so no link there.
  if (size === 'l') return mapsLink(place.maps, [clock, h('span', {}, tc('missingHours'))], 'link--on-color ticket__fact');
  return h('span', { class: 'ticket__fact' }, clock, h('span', {}, tc('missingHours')));
}

/**
 * The signature ticket. size 's' (72px live preview), 'm' (300x112: the Welcome stack and the place
 * form's showcase) or 'l' (350x320, Random). Its notches are cut out, so its shadow comes from a
 * wrapper (see .ticket in app.css).
 * trail: an optional node at the end of the bottom row (e.g. a .go-pill); it replaces the hours.
 * Random adds the classes ticket--tilt and ticket--deal to the returned node.
 */
export function ticket(place, { size = 'm', trail } = {}) {
  const style = placeStyle(place);
  const overline = placeOverline(place);

  const emoji = h('span', { class: 'tile tile--48 tile--glass', attrs: decorative }, emojiOf(place));
  const text = h(
    'div',
    { class: 'ticket__text' },
    overline && h('div', { class: 'ticket__overline' }, overline),
    h(size === 'l' ? 'h2' : 'div', { class: 'ticket__name' }, place.name),
  );
  const classes = ['ticket', `ticket--${size}`];

  if (size === 's') return h('div', { class: classes, style }, emoji, text);

  const facts = [ticketRating(place), !trail && ticketHours(place, size)];
  return h(
    'div',
    { class: classes, style },
    h('div', { class: 'ticket__top' }, size === 'l' ? [emoji, text] : [text, emoji]),
    h('div', { class: 'ticket__bottom' }, h('div', { class: 'ticket__facts' }, facts), trail),
  );
}

function hoursLine(place) {
  const clock = icon('clock', { size: 14 });
  if (place.hours === 'open24') {
    return h('p', { class: 'meta-line' }, clock, hidden(`${t(S, 'hours')}: `), h('span', { class: 'tag' }, tc('open24')));
  }
  const text = formatHours(place.hours, getLang());
  if (text) {
    return h('p', { class: 'meta-line' }, clock, hidden(`${t(S, 'hours')}: `), h('span', { class: 'meta-line__text' }, text));
  }
  if (!isSafeMapsUrl(place.maps)) return null;
  return h('p', { class: 'meta-line' }, clock, mapsLink(place.maps, tc('missingHours')));
}

/** The address as a meta line (pin icon, "Alamat:" for screen readers); null without one. */
export function addressLine(place, { clamp = false } = {}) {
  if (!place.address) return null;
  return h(
    'p',
    { class: 'meta-line' },
    icon('map-pin', { size: 14 }),
    hidden(`${t(S, 'address')}: `),
    h('span', { class: ['meta-line__text', clamp && 'meta-line__text--clamp'] }, place.address),
  );
}

// Street-level parts (Jl./Jalan, Gg., No., RT/RW) and bare numbers are not an area name.
const STREET_PART = /^(?:jl|jln|jalan|gg|gang|no|rt|rw)\b|^\d+$/i;

/** A place's area: the first address part that isn't street-level, or '' when there is none. */
function areaOf(address) {
  return address
    .split(',')
    .map((part) => part.trim())
    .find((part) => part && !STREET_PART.test(part)) ?? '';
}

/**
 * A place row's meta line, "Lengkong · ★ 4.9 · 5 fasilitas", leaving out whatever the place
 * doesn't have (null when that's everything). The star is a picture; screen readers hear "Rating".
 */
export function placeRowMeta(place) {
  const facilities = place.perks.length + place.custom.length;
  const rating = formatRating(place.rating, '', getLang());
  const parts = [
    areaOf(place.address),
    rating && [icon('star-filled', { size: 12, class: 'star' }), hidden(`${t(S, 'ratedLabel')} `), rating],
    facilities > 0 && t(S, facilities === 1 ? 'perksOne' : 'perksMany', { n: facilities }),
  ].filter(Boolean);
  return parts.length ? parts.flatMap((part, i) => (i ? [' · ', part] : [part])) : null;
}

/** Address (2 lines max) and hours lines; missing hours link to Maps. Null when there is neither. */
export function placeMetaLines(place) {
  const lines = [addressLine(place, { clamp: true })];
  lines.push(hoursLine(place));
  const shown = lines.filter(Boolean);
  return shown.length ? h('div', { class: 'meta-lines' }, shown) : null;
}

/** 2-column icon + label list: fixed perks in the place's order, then custom perks. Null when empty. */
export function facilitiesList(place) {
  const perks = (place.perks || [])
    .map((code) => PERKS.find((perk) => perk.code === code))
    .filter(Boolean)
    .map((perk) => [perk.icon, tc(`perks.${perk.code}`)]);
  const custom = (place.custom || []).filter(Boolean).map((text) => ['circle-check', text]);
  const items = [...perks, ...custom];
  if (!items.length) return null;

  return h(
    'ul',
    { class: 'facilities', attrs: { role: 'list' } },
    items.map(([name, label]) => h('li', { class: 'facilities__item' }, icon(name, { size: 18 }), h('span', {}, label))),
  );
}

/** The coordinator's note: brand-soft block with an initial avatar. Null without a note. */
export function noteBlock(place, from) {
  const note = String(place.note ?? '').trim();
  if (!note) return null;
  const name = String(from ?? '').trim();
  const initial = name ? Array.from(name)[0].toLocaleUpperCase() : '';

  return h(
    'div',
    { class: 'note-block' },
    h(
      'div',
      { class: 'note-block__head' },
      initial && h('span', { class: 'avatar', attrs: decorative }, initial),
      h('span', { class: 'note-block__from' }, name ? t(S, 'noteFrom', { name }) : t(S, 'note')),
    ),
    h('p', { class: 'note-block__text' }, note),
  );
}

// ---- actions ----

/**
 * The green send pill (one per screen). size 'lg' is 56px on a screen, 'md' is 52px inside a card.
 * Without an href it renders a disabled button.
 */
export function sendButton({ href, label, size = 'lg' } = {}) {
  const classes = ['btn', 'btn--go', 'btn--block', size === 'md' ? 'btn--md' : 'btn--lg'];
  // These buttons always open WhatsApp: its glyph says so, and screen readers hear it.
  const content = [icon('brand-whatsapp', { size: 22 }), h('span', {}, label), hidden(' (WhatsApp)')];
  if (!href) return h('button', { class: classes, attrs: { type: 'button', disabled: true } }, content);
  return h('a', { class: classes, attrs: { href, target: '_blank', rel: 'noopener' } }, content);
}

/**
 * "Lihat menu" for a place's menu link (a PDF on Google Drive, Instagram, a web page). It says where
 * it leads ("drive.google.com", "PDF · example.com") so nobody taps into the unknown. Null without
 * a safe link.
 */
export function menuButton(url) {
  const info = url ? linkInfo(url) : null;
  if (!info) return null;
  return h(
    'a',
    {
      class: 'btn btn--secondary btn--block menu-link',
      attrs: { href: info.href, target: '_blank', rel: 'noopener noreferrer' },
    },
    icon('book', { size: 18 }),
    h('span', {}, tc('menu')),
    h('span', { class: 'menu-link__host' }, info.pdf ? `PDF · ${info.host}` : info.host),
  );
}

/** The 56px primary button: an <a> with `href`, else a <button>; `attrs` may add e.g. disabled. */
export function primaryButton({ label, href, onClick, attrs = {} } = {}) {
  return h(
    href ? 'a' : 'button',
    {
      class: 'btn btn--primary btn--lg btn--block',
      attrs: { ...(href ? { href } : { type: 'button' }), ...attrs },
      on: { click: onClick },
    },
    h('span', {}, label),
  );
}

/** The fixed bar at the bottom of the screen with its main action (and an optional hint). */
export const bottomBar = (...children) => h('div', { class: 'bottom-bar' }, children);

function ghostItem({ icon: name, label, onClick, href, ariaLabel }) {
  const external = Boolean(href) && !href.startsWith('#');
  const attrs = href
    ? { href, target: external ? '_blank' : null, rel: external ? 'noopener' : null }
    : { type: 'button' };
  attrs['aria-label'] = ariaLabel || null;
  return h(
    href ? 'a' : 'button',
    { class: 'btn btn--ghost ghost-row__btn', attrs, on: { click: onClick } },
    name && icon(name, { size: 16 }),
    h('span', {}, label),
  );
}

/** Equal ghost buttons divided by hairlines. items: [{ icon, label, onClick | href, ariaLabel }]. */
export function ghostRow(items) {
  const nodes = [];
  items.filter(Boolean).forEach((item, i) => {
    if (i > 0) nodes.push(h('span', { class: 'ghost-row__divider', attrs: decorative }));
    nodes.push(ghostItem(item));
  });
  return h('div', { class: 'ghost-row' }, nodes);
}

/** Centred 32px icon, one short line and an optional action node (usually a ghost button). */
export function emptyState({ icon: name = 'info-circle', text, action } = {}) {
  return h('div', { class: 'empty' }, icon(name, { size: 32 }), h('p', { class: 'empty__text' }, text), action);
}

// Apps that open links in their own browser, whose storage is separate and often short-lived
// (Instagram, Facebook, LINE, TikTok, Snapchat, X), plus Android web views in general.
const IN_APP_UA = /Instagram|FBAN|FBAV|FB_IAB|\bLine\/|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|; wv\)/i;

/** True inside another app's built-in browser, where saved lists may not last. */
export const inAppBrowser = () => IN_APP_UA.test(globalThis.navigator?.userAgent ?? '');

/** "Open this in your browser", shown only inside another app's browser; null elsewhere. */
export function inAppBrowserNote({ class: extra } = {}) {
  return inAppBrowser() ? note('external-link', tc('inAppBrowser'), { class: extra }) : null;
}

/** A brand-soft note (the danger one with `danger`) with a leading icon; `class` adds e.g. a margin. */
export function note(name, text, { danger = false, size = 16, class: extra } = {}) {
  return h(
    'p',
    { class: ['note', danger && 'note--danger', extra] },
    icon(name, { size }),
    h('span', { class: 'note__body' }, text),
  );
}

// ---- deleting, with a confirm step ----

/** The centred "Hapus …" danger link at the end of a screen; `class` sets its top margin. */
export function deleteRow({ label, onClick, class: extra } = {}) {
  return h(
    'div',
    { class: ['center-row', extra] },
    h(
      'button',
      { class: 'btn btn--danger-link', attrs: { type: 'button' }, on: { click: onClick } },
      icon('trash', { size: 16 }),
      h('span', {}, label),
    ),
  );
}

/**
 * The "delete this?" sheet: `body`, then the danger button `confirm` and Cancel. Cancel starts
 * focused (the safe choice). Confirming closes the sheet, then calls onConfirm(). Returns close().
 */
export function confirmDelete({ title, body, confirm, onConfirm, iconSize = 16 } = {}) {
  return chooseSheet({
    title,
    body,
    choices: [{ label: confirm, icon: 'trash', iconSize, variant: 'btn--danger', onChoose: onConfirm }],
  });
}

/**
 * A sheet asking the user to pick one of `choices` ({ label, icon, iconSize, variant, onChoose }),
 * with "Batal" last. Focus starts on "Batal", so Enter never does something by accident.
 */
export function chooseSheet({ title, body, choices }) {
  const button = (variant, content, onClick) =>
    h('button', { class: ['btn', variant, 'btn--block'], attrs: { type: 'button' }, on: { click: onClick } }, content);
  const buttons = choices.map(({ label, icon: name, iconSize = 16, variant = 'btn--secondary', onChoose }) =>
    button(variant, [name && icon(name, { size: iconSize }), h('span', {}, label)], () => {
      close();
      onChoose();
    }),
  );
  const cancel = button('btn--ghost', h('span', {}, tc('cancel')), () => close());
  const close = openSheet([body, h('div', { class: 'sheet__actions' }, buttons, cancel)], { label: title });
  cancel.focus();
  return close;
}

// ---- extras used by several screens ----

/**
 * 44px icon button (<a> with href, else <button>). variant: 'tonal' (a filled circle) or 'drag'.
 * The glyph is 22px, 18px for tonal and 20px for drag.
 */
export function iconButton({ icon: name, label, href, onClick, variant, attrs = {} } = {}) {
  const glyph = variant === 'tonal' ? 18 : variant === 'drag' ? 20 : 22;
  const base = href ? { href } : { type: 'button' };
  return h(
    href ? 'a' : 'button',
    {
      class: ['iconbtn', variant && `iconbtn--${variant}`],
      attrs: { ...base, 'aria-label': label, ...attrs },
      on: { click: onClick },
    },
    icon(name, { size: glyph }),
  );
}

/**
 * A list row for a .list-surface: tile, title, meta and an optional trailing node.
 * With href or onClick the title/meta become a stretched link (or button) covering the whole row,
 * so a trailing control (drag handle, chevron) can sit beside it. `current` sets aria-current.
 */
export function listRow({ tile, title, meta, href, onClick, trail, current = false, as = 'li' } = {}) {
  const text = [
    h('span', { class: 'row__title' }, title),
    meta != null && meta !== '' && h('span', { class: 'row__meta' }, meta),
  ];
  const interactive = Boolean(href || onClick);
  const main = interactive
    ? h(
        href ? 'a' : 'button',
        {
          class: 'row__main row__link',
          attrs: { ...(href ? { href } : { type: 'button' }), 'aria-current': current ? 'true' : null },
          on: { click: onClick },
        },
        text,
      )
    : h('div', { class: 'row__main' }, text);
  return h(as, { class: 'row' }, tile, main, trail);
}

/** The headline's last word with the hand-drawn brand-soft squiggle under it (Welcome band). */
export function squiggleWord(word) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const path = document.createElementNS(SVG_NS, 'path');
  const set = (el, attrs) => Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  set(svg, { class: 'squiggle__line', viewBox: '0 0 100 12', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  set(path, {
    d: 'M2 8C12 3 20 11 30 7S48 3 58 7S76 11 86 6S96 4 98 6',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '3',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
  });
  svg.append(path);
  return h('span', { class: 'squiggle' }, word, svg);
}
