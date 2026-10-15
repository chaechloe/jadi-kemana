// Compare (#d=…&v=compare): two places side by side, then ask the group "A or B?".
// The table's first row holds the two place heads; each one is also its picker (a native <select>
// laid over it), and the row stays pinned under the top bar while the rows scroll beneath it.
import { h, icon, uid, copyWithToast, shareOrCopy } from '../ui.js';
import { topBar, pageHeader, sendButton, ghostRow, deadEnd, bottomBar, hidden } from '../components.js';
import { getLang, t, tc, formatHours, formatRating } from '../i18n.js';
import { PERKS, EMOJIS, colorHex } from '../data.js';
import { waLink, compareMessage, isSafeMapsUrl, linkInfo } from '../links.js';
import * as routes from '../routes.js';

const S = {
  id: {
    title: 'Bandingin',
    hint: 'Ganti tempatnya lewat nama di tabel',
    placeA: 'Tempat A',
    placeB: 'Tempat B',
    badgeA: 'A',
    badgeB: 'B',
    same: 'Pilih dua tempat yang beda ya',
    tableLabel: 'Perbandingan dua tempat',
    infoCol: 'Info',
    groupInfo: 'Info',
    groupPerks: 'Fasilitas',
    rating: 'Rating',
    hours: 'Jam buka',
    address: 'Alamat',
    note: 'Catatan',
    menu: 'Menu',
    noMenu: 'Nggak ada link menu',
    higher: 'lebih tinggi',
    yes: 'Ada',
    no: 'Nggak ada',
    unknown: 'Belum ada info',
    send: 'Tanya grup: A atau B?',
    copied: 'Teks udah disalin',
    copyFailed: 'Teksnya gagal disalin, coba lagi ya',
    needTwo: 'Perlu minimal 2 tempat biar bisa dibandingin.',
    toList: 'Balik ke daftar',
  },
  en: {
    title: 'Compare',
    hint: 'Switch places with the names in the table',
    placeA: 'Place A',
    placeB: 'Place B',
    badgeA: 'A',
    badgeB: 'B',
    same: 'Pick two different places',
    tableLabel: 'Comparing two places',
    infoCol: 'Info',
    groupInfo: 'Info',
    groupPerks: 'Perks',
    rating: 'Rating',
    hours: 'Hours',
    address: 'Address',
    note: 'Note',
    menu: 'Menu',
    noMenu: 'No menu link',
    higher: 'higher',
    yes: 'Yes',
    no: 'No',
    unknown: 'No info yet',
    send: 'Ask the group: A or B?',
    copied: 'Text copied',
    copyFailed: "Couldn't copy the text, try again",
    needTwo: 'You need at least 2 places to compare.',
    toList: 'Back to the list',
  },
};

// The A/B choice lives in this history entry, so a language switch (which re-renders) keeps it.
const STATE_KEY = 'jkComparePair';

const decorative = { 'aria-hidden': 'true' };

// ---- remembered choice ----

function recallPair(count) {
  try {
    const pair = history.state?.[STATE_KEY];
    const valid = (i) => Number.isInteger(i) && i >= 0 && i < count;
    if (Array.isArray(pair) && pair.length === 2 && pair.every(valid)) return pair;
  } catch {
    // History unavailable: fall back to the default pair.
  }
  return [0, 1];
}

function rememberPair(pair) {
  try {
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState({ ...state, [STATE_KEY]: pair }, '');
  } catch {
    // Not remembered; only a re-render would reset the choice.
  }
}

// ---- column heads (also the pickers) ----

/**
 * A column head in the place's colour: badge, emoji, name and a chevron, with an invisible <select>
 * stretched over it, so a tap opens the phone's own list. set(i) shows place i. The head stays in
 * the page while the table changes, so the select never loses focus.
 */
function headPicker({ badge, label, places, value, onChange }) {
  const id = uid('cmp-pick');
  const tile = h('span', { class: 'tile tile--glass cmp-pick__tile', attrs: decorative });
  const name = h('span', { class: 'cmp-pick__name' });
  const select = h(
    'select',
    { class: 'cmp-pick__select', id, on: { change: onChange } },
    places.map((place, i) => h('option', { attrs: { value: String(i) } }, place.name)),
  );
  const node = h(
    'div',
    { class: 'cmp-pick', attrs: { role: 'columnheader' } },
    h('span', { class: 'cmp-pick__badge', attrs: decorative }, badge),
    tile,
    name,
    icon('chevron-down', { size: 16 }),
    h('label', { class: 'visually-hidden', attrs: { for: id } }, label),
    select,
  );

  function set(index) {
    const place = places[index];
    select.value = String(index);
    node.style.setProperty('--place', colorHex(place.color));
    tile.textContent = place.emoji || EMOJIS[0];
    name.textContent = place.name;
  }

  set(value);
  return { node, select, set };
}

// ---- table cells ----

function cell(content, tone) {
  return h('div', { class: ['cmp-row__cell', tone && `cmp-row__cell--${tone}`], attrs: { role: 'cell' } }, content);
}

/** "–" for a value the place doesn't have; `spoken` is what a screen reader hears instead. */
function dashCell(spoken) {
  return cell([h('span', { class: 'cmp-dash', attrs: decorative }, '–'), hidden(spoken)]);
}

function ratingCell(place, other) {
  const text = formatRating(place.rating, place.ratingCount, getLang());
  if (!text) return dashCell(t(S, 'unknown'));
  if (other.rating == null || place.rating === other.rating) return cell(text, 'plain');
  if (place.rating < other.rating) return cell(text);
  return cell([icon('arrow-up', { size: 14 }), h('span', {}, text), hidden(t(S, 'higher'))], 'better');
}

function hoursCell(place) {
  if (place.hours === 'open24') return cell(h('span', { class: 'tag' }, tc('open24')), 'plain');
  const text = formatHours(place.hours, getLang());
  if (text) return cell(text, 'plain');
  if (!isSafeMapsUrl(place.maps)) return dashCell(t(S, 'unknown'));
  return cell(
    h('a', { class: 'link link--hit', attrs: { href: place.maps, target: '_blank', rel: 'noopener' } }, tc('missingHours')),
    'plain',
  );
}

function textCell(text, { clamp = false } = {}) {
  if (!text) return dashCell(t(S, 'unknown'));
  return cell(h('span', { class: clamp ? 'clamp-3' : 'cmp-row__text' }, text), 'plain');
}

/** 'Lihat menu' when the place has a (safe) menu link. */
function menuCell(place) {
  const info = linkInfo(place.menu);
  if (!info) return dashCell(t(S, 'noMenu'));
  const attrs = { href: info.href, target: '_blank', rel: 'noopener noreferrer', title: info.host };
  return cell(h('a', { class: 'link link--hit', attrs }, tc('menu')), 'plain');
}

function hasCell(has) {
  return has ? cell([icon('check', { size: 18 }), hidden(t(S, 'yes'))], 'plain') : dashCell(t(S, 'no'));
}

// ---- table rows ----

function row(label, cells, variant) {
  return h(
    'div',
    { class: ['cmp-row', variant && `cmp-row--${variant}`], attrs: { role: 'row' } },
    h('div', { class: 'cmp-row__label', attrs: { role: 'rowheader' } }, label),
    cells,
  );
}

/** A facility label: an icon flowing inline with the text. */
function perkLabel(iconName, text) {
  return h('span', { class: 'cmp-row__label-text' }, icon(iconName, { size: 16 }), text);
}

function perkRows(a, b) {
  return PERKS.filter(({ code }) => a.perks.includes(code) || b.perks.includes(code)).map(({ code, icon: name }) =>
    row(
      perkLabel(name, tc(`perks.${code}`)),
      [hasCell(a.perks.includes(code)), hasCell(b.perks.includes(code))],
      'compact',
    ),
  );
}

// Custom perks from both places, matched without regard to case; the first spelling wins.
function customRows(a, b) {
  const key = (text) => text.toLocaleLowerCase();
  const has = (place, k) => (place.custom || []).some((text) => key(text) === k);
  const labels = new Map();
  for (const text of [...(a.custom || []), ...(b.custom || [])]) {
    if (!labels.has(key(text))) labels.set(key(text), text);
  }
  return [...labels].map(([k, text]) =>
    row(perkLabel('circle-check', text), [hasCell(has(a, k)), hasCell(has(b, k))], 'compact'),
  );
}

/** A titled group of rows ("Info", "Fasilitas"); null when it has no rows. */
function group(title, rows) {
  if (!rows.length) return null;
  return h(
    'div',
    { class: 'cmp-group', attrs: { role: 'rowgroup' } },
    h(
      'div',
      { class: 'cmp-group__title', attrs: { role: 'row' } },
      h('span', { attrs: { role: 'cell', 'aria-colspan': '3' } }, title),
    ),
    rows,
  );
}

function tableGroups(a, b) {
  const info = [
    row(t(S, 'rating'), [ratingCell(a, b), ratingCell(b, a)]),
    row(t(S, 'hours'), [hoursCell(a), hoursCell(b)]),
    row(t(S, 'address'), [textCell(a.address, { clamp: true }), textCell(b.address, { clamp: true })], 'top'),
    (a.note || b.note) && row(t(S, 'note'), [textCell(a.note), textCell(b.note)], 'top'),
    (a.menu || b.menu) && row(t(S, 'menu'), [menuCell(a), menuCell(b)]),
  ].filter(Boolean);
  return [group(t(S, 'groupInfo'), info), group(t(S, 'groupPerks'), [...perkRows(a, b), ...customRows(a, b)])].filter(
    Boolean,
  );
}

// ---- screen ----

export async function render(ctx) {
  const places = ctx.list?.places ?? [];
  const back = routes.friend(ctx.params.payload, { from: ctx.params.from });
  if (places.length < 2) {
    return deadEnd({ back, title: t(S, 'title'), icon: 'columns-2', text: t(S, 'needTwo'), label: t(S, 'toList') });
  }

  let [indexA, indexB] = recallPair(places.length);
  const errorId = uid('cmp-error');
  const message = () => compareMessage(places[indexA], places[indexB], getLang());

  const heads = [
    headPicker({
      badge: t(S, 'badgeA'),
      label: t(S, 'placeA'),
      places,
      value: indexA,
      onChange: (event) => choose(Number(event.target.value), indexB),
    }),
    headPicker({
      badge: t(S, 'badgeB'),
      label: t(S, 'placeB'),
      places,
      value: indexB,
      onChange: (event) => choose(indexA, Number(event.target.value)),
    }),
  ];

  // The corner cell names the label column for screen readers; on screen it stays empty.
  const headRow = h(
    'div',
    { class: 'cmp-row cmp-row--head', attrs: { role: 'row' } },
    h('div', { class: 'cmp-row__label cmp-corner', attrs: { role: 'columnheader' } }, hidden(t(S, 'infoCol'))),
    heads.map((head) => head.node),
  );
  const body = h('div', { class: 'cmp-body' });
  const table = h(
    'div',
    { class: 'cmp-table mt-16', attrs: { role: 'table', 'aria-label': t(S, 'tableLabel') } },
    headRow,
    body,
  );

  const errorSlot = h('div');
  const actionsSlot = h('div');
  const bar = bottomBar();
  const toasts = { done: t(S, 'copied'), failed: t(S, 'copyFailed') };

  function actions(same) {
    const ghosts = ghostRow([
      { icon: 'copy', label: tc('copyText'), onClick: () => copyWithToast(message(), toasts) },
      { icon: 'share', label: tc('share'), onClick: () => shareOrCopy(message(), toasts) },
    ]);
    ghosts.classList.add('mt-16');
    for (const button of ghosts.querySelectorAll('button')) button.disabled = same;
    return ghosts;
  }

  // Rebuilds the rows, the error and the actions; the heads (and their selects) stay put.
  function update() {
    const same = indexA === indexB;

    for (const { select } of heads) {
      select.setAttribute('aria-invalid', String(same));
      if (same) select.setAttribute('aria-describedby', errorId);
      else select.removeAttribute('aria-describedby');
    }

    errorSlot.replaceChildren(
      ...(same
        ? [
            h(
              'p',
              { class: 'helper helper--error mt-12', id: errorId, attrs: { role: 'alert' } },
              icon('alert-circle', { size: 14 }),
              h('span', {}, t(S, 'same')),
            ),
          ]
        : []),
    );
    body.replaceChildren(...tableGroups(places[indexA], places[indexB]));
    actionsSlot.replaceChildren(actions(same));
    bar.replaceChildren(sendButton({ href: same ? null : waLink(message()), label: t(S, 'send') }));
  }

  function choose(nextA, nextB) {
    indexA = nextA;
    indexB = nextB;
    heads[0].set(indexA);
    heads[1].set(indexB);
    rememberPair([indexA, indexB]);
    update();
  }

  update();

  return h(
    'div',
    { class: 'screen screen--medium screen--compare' },
    topBar({ back }),
    pageHeader({ title: t(S, 'title'), meta: t(S, 'hint'), metaIcon: 'arrows-shuffle' }),
    errorSlot,
    table,
    actionsSlot,
    bar,
  );
}
