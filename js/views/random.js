// Random pick (#d=…&v=random): "can't decide? I'll pick", dealt as a large ticket.
import { h, icon } from '../ui.js';
import { topBar, pageHeader, ticket, sendButton, emptyState } from '../components.js';
import { getLang, t, tc } from '../i18n.js';
import { waLink, randomMessage } from '../links.js';

const S = {
  id: {
    title: 'Terserah? Oke, aku yang milih!',
    from: 'Dipilih dari {n} tempat di "{title}"',
    fromOne: 'Cuma ada 1 tempat di "{title}"',
    address: 'Alamat',
    another: 'Pilih yang lain',
    details: 'Lihat detailnya',
    picked: 'Pilihan baru: {name}',
    empty: 'Daftar ini belum ada tempatnya.',
    toList: 'Balik ke daftar',
  },
  en: {
    title: "Can't decide? Fine, I'll pick!",
    from: 'Picked from the {n} places in "{title}"',
    fromOne: 'There\'s only 1 place in "{title}"',
    address: 'Address',
    another: 'Pick another',
    details: 'See details',
    picked: 'New pick: {name}',
    empty: 'This list has no places yet.',
    toList: 'Back to the list',
  },
};

// The pick lives in this history entry, so a language switch (which re-renders) keeps it,
// while every new visit to this screen starts with a fresh random pick.
const STATE_KEY = 'jkRandomPick';

// ---- navigation and remembered pick ----

/** The friend view's hash for this list, keeping `from` (preview mode) and adding `extra`. */
function friendHash({ payload, from }, extra = {}) {
  const query = new URLSearchParams({ d: payload });
  if (from) query.set('from', from);
  for (const [key, value] of Object.entries(extra)) query.set(key, String(value));
  return `#${query}`;
}

function recallPick(count) {
  try {
    const index = history.state?.[STATE_KEY];
    if (Number.isInteger(index) && index >= 0 && index < count) return index;
  } catch {
    // History unavailable: pick afresh.
  }
  return null;
}

function rememberPick(index) {
  try {
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState({ ...state, [STATE_KEY]: index }, '');
  } catch {
    // Not remembered; only a re-render would pick again.
  }
}

// ---- picking ----

/** A uniform random index in [0, count), never `exclude` (when count > 1). Uses the CSPRNG. */
function randomIndex(count, exclude = -1) {
  if (count < 2) return 0;
  const skip = exclude >= 0 && exclude < count;
  const range = skip ? count - 1 : count;
  // Rejection sampling: drop the top sliver of 32-bit values so every index is equally likely.
  const limit = Math.floor(0x100000000 / range) * range;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  const index = buffer[0] % range;
  return skip && index >= exclude ? index + 1 : index;
}

// ---- pieces ----

function pickTicket(place) {
  const node = ticket(place, { size: 'l' });
  node.classList.add('ticket--tilt', 'mt-24');
  return node;
}

/** Restarts the deal-in animation (the CSS skips it under reduced motion). */
function dealIn(node) {
  node.classList.remove('ticket--deal');
  void node.offsetWidth; // flush styles so adding the class again starts a new animation
  node.classList.add('ticket--deal');
}

function addressLine(place) {
  if (!place.address) return null;
  return h(
    'p',
    { class: 'meta-line meta-line--ground mt-24' },
    icon('map-pin', { size: 14 }),
    h('span', { class: 'visually-hidden' }, `${t(S, 'address')}: `),
    h('span', { class: 'meta-line__text' }, place.address),
  );
}

function sourceLine(list) {
  const title = list.title || tc('untitled');
  const count = list.places.length;
  return count === 1 ? t(S, 'fromOne', { title }) : t(S, 'from', { n: count, title });
}

function noPlaces(back) {
  return h(
    'div',
    { class: 'screen screen--nobar' },
    topBar({ back }),
    pageHeader({ title: t(S, 'title') }),
    emptyState({
      icon: 'map-pin',
      text: t(S, 'empty'),
      action: h('a', { class: 'btn btn--ghost', attrs: { href: back } }, t(S, 'toList')),
    }),
  );
}

// ---- screen ----

export async function render(ctx) {
  const list = ctx.list;
  const places = list?.places ?? [];
  const back = friendHash(ctx.params);
  if (!places.length) return noPlaces(back);

  let index = recallPick(places.length) ?? randomIndex(places.length);
  rememberPick(index);

  const sendHref = (place) => waLink(randomMessage(place, getLang()));
  const detailsHref = (i) => friendHash(ctx.params, { i });

  let card = pickTicket(places[index]);
  card.classList.add('ticket--deal'); // not in the document yet: it deals in once inserted
  const addressSlot = h('div', {}, addressLine(places[index]));
  const status = h('p', { class: 'visually-hidden', attrs: { role: 'status', 'aria-live': 'polite' } });
  const details = h('a', { class: 'btn btn--ghost', attrs: { href: detailsHref(index) } }, t(S, 'details'));
  const send = sendButton({ href: sendHref(places[index]), label: tc('send') });

  function show(next) {
    index = next;
    rememberPick(index);
    const place = places[index];

    const fresh = pickTicket(place);
    card.replaceWith(fresh);
    card = fresh;
    dealIn(card);

    addressSlot.replaceChildren(...[addressLine(place)].filter(Boolean));
    send.setAttribute('href', sendHref(place));
    details.setAttribute('href', detailsHref(index));
    status.textContent = t(S, 'picked', { name: place.name });
  }

  const another =
    places.length > 1 &&
    h(
      'button',
      {
        class: 'btn btn--secondary btn--block',
        attrs: { type: 'button' },
        on: { click: () => show(randomIndex(places.length, index)) },
      },
      icon('refresh', { size: 16 }),
      h('span', {}, t(S, 'another')),
    );

  return h(
    'div',
    { class: 'screen' },
    topBar({ back }),
    pageHeader({ title: t(S, 'title'), meta: sourceLine(list), metaIcon: 'list' }),
    card,
    addressSlot,
    h('div', { class: 'stack stack--8 mt-24' }, another, h('div', { class: 'center-row' }, details)),
    status,
    h('div', { class: 'bottom-bar' }, send),
  );
}
