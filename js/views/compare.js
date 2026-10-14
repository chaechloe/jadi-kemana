// Compare (#d=…&v=compare): two places side by side, then ask the group "A or B?".
import { h, icon, uid, toast, copyText, shareText } from '../ui.js';
import { topBar, pageHeader, sendButton, ghostRow, emptyState } from '../components.js';
import { getLang, t, tc, formatHours, formatRating } from '../i18n.js';
import { PERKS, EMOJIS, colorHex } from '../data.js';
import { waLink, compareMessage, isSafeMapsUrl } from '../links.js';

const S = {
  id: {
    title: 'Bandingin',
    placeA: 'Tempat A',
    placeB: 'Tempat B',
    badgeA: 'A',
    badgeB: 'B',
    same: 'Pilih dua tempat yang beda ya',
    tableLabel: 'Perbandingan dua tempat',
    infoCol: 'Info',
    rating: 'Rating',
    hours: 'Jam buka',
    address: 'Alamat',
    note: 'Catatan',
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
    placeA: 'Place A',
    placeB: 'Place B',
    badgeA: 'A',
    badgeB: 'B',
    same: 'Pick two different places',
    tableLabel: 'Comparing two places',
    infoCol: 'Info',
    rating: 'Rating',
    hours: 'Hours',
    address: 'Address',
    note: 'Note',
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

const hidden = (text) => h('span', { class: 'visually-hidden' }, text);
const decorative = { 'aria-hidden': 'true' };

// ---- navigation and remembered choice ----

/** The friend view's hash for this list, keeping `from` (preview mode). */
function friendHash({ payload, from }) {
  const query = new URLSearchParams({ d: payload });
  if (from) query.set('from', from);
  return `#${query}`;
}

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

// ---- pickers ----

function placePicker({ id, label, places, value, onChange }) {
  const select = h(
    'select',
    { class: 'select', id, on: { change: onChange } },
    places.map((place, i) => h('option', { attrs: { value: String(i) } }, place.name)),
  );
  select.value = String(value);
  const node = h(
    'div',
    {},
    h('label', { class: 'label', attrs: { for: id } }, label),
    h('div', { class: 'input-wrap input-wrap--select' }, select, icon('chevron-down', { size: 18 })),
  );
  return { node, select };
}

// ---- place headers ----

function placeHead(place, badge, label) {
  return h(
    'div',
    { class: 'cmp-head', style: { '--place': colorHex(place.color) } },
    h('span', { class: 'tile tile--glass', attrs: decorative }, place.emoji || EMOJIS[0]),
    h('span', { class: 'badge cmp-head__badge', attrs: decorative }, badge),
    h('h2', { class: 'cmp-head__name' }, hidden(`${label}: `), place.name),
  );
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
  return cell(clamp ? h('span', { class: 'clamp-3' }, text) : text, 'plain');
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

/** A facility label: an 18px icon flowing inline with the text. */
function perkLabel(iconName, text) {
  return h('span', { class: 'cmp-row__label-text' }, icon(iconName, { size: 18 }), text);
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

function comparisonTable(a, b) {
  return h(
    'div',
    { class: 'cmp-table mt-12', attrs: { role: 'table', 'aria-label': t(S, 'tableLabel') } },
    // Column headers for screen readers; the coloured headers above show them visually.
    h(
      'div',
      { class: 'visually-hidden', attrs: { role: 'row' } },
      h('span', { attrs: { role: 'columnheader' } }, t(S, 'infoCol')),
      h('span', { attrs: { role: 'columnheader' } }, `${t(S, 'placeA')}: ${a.name}`),
      h('span', { attrs: { role: 'columnheader' } }, `${t(S, 'placeB')}: ${b.name}`),
    ),
    row(t(S, 'rating'), [ratingCell(a, b), ratingCell(b, a)]),
    row(t(S, 'hours'), [hoursCell(a), hoursCell(b)]),
    row(t(S, 'address'), [textCell(a.address, { clamp: true }), textCell(b.address, { clamp: true })], 'top'),
    perkRows(a, b),
    customRows(a, b),
    row(t(S, 'note'), [textCell(a.note), textCell(b.note)], 'top'),
  );
}

// ---- screen ----

function notEnoughPlaces(back) {
  return h(
    'div',
    { class: 'screen screen--nobar' },
    topBar({ back }),
    pageHeader({ title: t(S, 'title') }),
    emptyState({
      icon: 'columns-2',
      text: t(S, 'needTwo'),
      action: h('a', { class: 'btn btn--ghost', attrs: { href: back } }, t(S, 'toList')),
    }),
  );
}

export async function render(ctx) {
  const places = ctx.list?.places ?? [];
  const back = friendHash(ctx.params);
  if (places.length < 2) return notEnoughPlaces(back);

  let [indexA, indexB] = recallPair(places.length);
  const errorId = uid('cmp-error');
  const message = () => compareMessage(places[indexA], places[indexB], getLang());

  const pickerA = placePicker({
    id: uid('cmp-a'),
    label: t(S, 'placeA'),
    places,
    value: indexA,
    onChange: (event) => choose(Number(event.target.value), indexB),
  });
  const pickerB = placePicker({
    id: uid('cmp-b'),
    label: t(S, 'placeB'),
    places,
    value: indexB,
    onChange: (event) => choose(indexA, Number(event.target.value)),
  });

  const content = h('div');
  const bar = h('div', { class: 'bottom-bar' });

  function copyMessage() {
    // A failed copy shows the alert glyph instead of the success check.
    copyText(message()).then((ok) => toast(t(S, ok ? 'copied' : 'copyFailed'), { icon: ok ? 'check' : 'alert-circle' }));
  }

  function shareMessage() {
    // shareText() must run synchronously inside the click; fall back to copying.
    shareText(message()).then((result) => {
      if (result === 'unsupported') copyMessage();
    });
  }

  function actions(same) {
    const ghosts = ghostRow([
      { icon: 'copy', label: tc('copyText'), onClick: copyMessage },
      { icon: 'share', label: tc('share'), onClick: shareMessage },
    ]);
    ghosts.classList.add('mt-16');
    for (const button of ghosts.querySelectorAll('button')) button.disabled = same;
    return ghosts;
  }

  // Rebuilds everything below the pickers; the pickers stay put so focus is never lost.
  function update() {
    const a = places[indexA];
    const b = places[indexB];
    const same = indexA === indexB;

    for (const { select } of [pickerA, pickerB]) {
      select.setAttribute('aria-invalid', String(same));
      if (same) select.setAttribute('aria-describedby', errorId);
      else select.removeAttribute('aria-describedby');
    }

    content.replaceChildren(
      ...[
        same &&
          h(
            'p',
            { class: 'helper helper--error', id: errorId, attrs: { role: 'alert' } },
            icon('alert-circle', { size: 14 }),
            h('span', {}, t(S, 'same')),
          ),
        h('div', { class: 'cmp-heads mt-12' }, placeHead(a, t(S, 'badgeA'), t(S, 'placeA')), placeHead(b, t(S, 'badgeB'), t(S, 'placeB'))),
        comparisonTable(a, b),
        actions(same),
      ].filter(Boolean),
    );

    bar.replaceChildren(sendButton({ href: same ? null : waLink(message()), label: t(S, 'send') }));
  }

  function choose(nextA, nextB) {
    indexA = nextA;
    indexB = nextB;
    rememberPair([indexA, indexB]);
    update();
  }

  update();

  return h(
    'div',
    { class: 'screen' },
    topBar({ back }),
    pageHeader({ title: t(S, 'title') }),
    h('div', { class: 'cmp-pickers mt-20' }, pickerA.node, pickerB.node),
    content,
    bar,
  );
}
