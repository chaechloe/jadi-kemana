// Welcome (#/): the brand band, the sample ticket stack and the two CTAs. Returning coordinators
// also get "Daftar kamu"; anyone can re-open a list from its link here.
import { h, icon, uid } from '../ui.js';
import { topBar, ticket, squiggleWord } from '../components.js';
import { getLang, t, tc } from '../i18n.js';
import { sampleList } from '../data.js';
import { getLists, storageOk } from '../store.js';
import { encodeList } from '../codec.js';
import { listItem, newListItem, linkImportItem, startNewList } from './lists-sheet.js';

const S = {
  id: {
    headLead: 'Biar rencana nongkrong nggak cuma',
    headLast: 'wacana.',
    body: 'Kumpulin tempat, kirim satu link ke grup, bahas bareng. Nggak perlu install, nggak perlu akun.',
    cta: 'Bikin daftar',
    example: 'Lihat contoh dulu',
    deviceNote: 'Disimpan di HP ini. Link yang udah kamu bagikan jadi cadangannya.',
  },
  en: {
    headLead: 'Make the hangout plan actually',
    headLast: 'happen.',
    body: 'Collect places, send one link to the group, talk it over. Nothing to install, no account.',
    cta: 'Make a list',
    example: 'See an example first',
    deviceNote: 'Saved on this phone. The links you share are the backup.',
  },
};

function band() {
  return h(
    'div',
    { class: 'band' },
    topBar({ band: true }),
    h('h1', { class: 'band__title', attrs: { tabindex: '-1' } }, t(S, 'headLead'), ' ', squiggleWord(t(S, 'headLast'))),
    h('p', { class: 'band__lead' }, t(S, 'body')),
  );
}

/** Three sample tickets fanned over the band's edge, back to front. Decoration only. */
function ticketStack(places) {
  const [back, middle, front] = places;
  const goPill = h('span', { class: 'go-pill' }, icon('message-circle', { size: 14 }), h('span', {}, tc('discuss')));
  return h(
    'div',
    { class: 'ticket-stack', attrs: { 'aria-hidden': 'true' } },
    ticket(back),
    ticket(middle),
    ticket(front, { trail: goPill }),
  );
}

/** The sample list as a friend's link (#d=…), or null if it can't be encoded. */
async function exampleHash(sample) {
  try {
    return `#d=${await encodeList(sample)}`;
  } catch {
    return null;
  }
}

function actions(ctx, exampleHref) {
  return h(
    'div',
    { class: 'mt-32' },
    h(
      'button',
      { class: 'btn btn--primary btn--lg btn--block', attrs: { type: 'button' }, on: { click: () => startNewList(ctx) } },
      h('span', {}, t(S, 'cta')),
    ),
    exampleHref &&
      h('div', { class: 'center-row mt-8' }, h('a', { class: 'btn btn--ghost', attrs: { href: exampleHref } }, h('span', {}, t(S, 'example')))),
  );
}

/** Only when this browser can't save: lists made now won't survive a reload. */
function storageNote() {
  if (storageOk()) return null;
  return h('p', { class: 'note mt-24' }, icon('alert-triangle', { size: 16 }), h('span', { class: 'note__body' }, tc('errStorage')));
}

function yourLists(ctx, lists) {
  const headingId = uid('your-lists');
  const chevron = () => h('span', { class: 'row__trail' }, icon('chevron-right'));
  return h(
    'section',
    { class: 'section', attrs: { 'aria-labelledby': headingId } },
    h('div', { class: 'section__head' }, h('h2', { class: 'section__title', id: headingId }, tc('yourLists'))),
    h(
      'ul',
      { class: 'list-surface', attrs: { role: 'list' } },
      lists.map((list) => listItem(list, { trail: chevron() })),
      newListItem(ctx),
      linkImportItem(ctx),
    ),
    h('p', { class: 'hint mt-12' }, icon('device-mobile', { size: 14 }), h('span', {}, t(S, 'deviceNote'))),
  );
}

// First visit (or after the browser cleared its data): just the way back in from a shared link.
function openFromLink(ctx) {
  return h('div', { class: 'section' }, h('ul', { class: 'list-surface', attrs: { role: 'list' } }, linkImportItem(ctx)));
}

export async function render(ctx) {
  const sample = sampleList(getLang());
  const lists = getLists();
  const exampleHref = await exampleHash(sample);

  return h(
    'div',
    { class: 'screen screen--nobar' },
    band(),
    ticketStack(sample.places),
    actions(ctx, exampleHref),
    storageNote(),
    lists.length ? yourLists(ctx, lists) : openFromLink(ctx),
  );
}
