// Random pick (#d=…&v=random): "can't decide? I'll pick", dealt as a large ticket onto a little
// stage, with the place's address, perks and note under it (phones) or beside it (wide screens).
import { h, icon } from '../ui.js';
import {
  topBar,
  pageHeader,
  ticket,
  facilitiesList,
  noteBlock,
  menuButton,
  sendButton,
  deadEnd,
  bottomBar,
  addressLine,
  decorative,
} from '../components.js';
import { getLang, t, tc } from '../i18n.js';
import { waLink, randomMessage } from '../links.js';
import * as routes from '../routes.js';

const S = {
  id: {
    title: 'Terserah? Oke, aku yang milih!',
    from: 'Dipilih dari {n} tempat di "{title}"',
    fromOne: 'Cuma ada 1 tempat di "{title}"',
    sticker: 'Pilihanku!',
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
    sticker: 'My pick!',
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


// ---- remembered pick ----

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
  node.classList.add('ticket--tilt');
  return node;
}

/** Restarts a one-off CSS animation (the CSS skips them under reduced motion). */
function replay(node, className) {
  node.classList.remove(className);
  void node.offsetWidth; // flush styles so adding the class again starts a new animation
  node.classList.add(className);
}

/** Address, perks, the coordinator's note and the menu in one card; null when the place has none. */
function pickDetails(place, from) {
  const facilities = facilitiesList(place);
  const parts = [
    addressLine(place),
    facilities && h('div', {}, h('h3', { class: 'pick__heading' }, tc('perksTitle')), facilities),
    noteBlock(place, from),
    menuButton(place.menu),
  ].filter(Boolean);
  return parts.length ? h('div', { class: 'pick__details' }, parts) : null;
}

function sourceLine(list) {
  const title = list.title || tc('untitled');
  const count = list.places.length;
  return count === 1 ? t(S, 'fromOne', { title }) : t(S, 'from', { n: count, title });
}

// ---- screen ----

export async function render(ctx) {
  const list = ctx.list;
  const places = list?.places ?? [];
  const { payload, from } = ctx.params;
  const back = routes.friend(payload, { from });
  if (!places.length) {
    return deadEnd({ back, title: t(S, 'title'), icon: 'map-pin', text: t(S, 'empty'), label: t(S, 'toList') });
  }

  let index = recallPick(places.length) ?? randomIndex(places.length);
  rememberPick(index);

  const sendHref = (place) => waLink(randomMessage(place, getLang()));
  const detailsHref = (i) => routes.friend(payload, { from, i });
  const detailsOf = (place) => [pickDetails(place, list.from)].filter(Boolean);

  let card = pickTicket(places[index]);
  card.classList.add('ticket--deal'); // not in the document yet: it deals in once inserted
  const sticker = h('span', { class: 'pick__sticker', attrs: decorative }, icon('star-filled', { size: 14 }), t(S, 'sticker'));
  const detailsSlot = h('div', { class: 'pick__slot' }, detailsOf(places[index]));
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
    replay(card, 'ticket--deal');
    replay(sticker, 'pick__sticker--pop');

    detailsSlot.replaceChildren(...detailsOf(place));
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

  // The bottom bar sits with the other actions: pinned to the bottom on phones (fixed), and an
  // ordinary block in the side column on wide screens.
  return h(
    'div',
    { class: 'screen screen--medium screen--random' },
    topBar({ back }),
    pageHeader({ title: t(S, 'title'), meta: sourceLine(list), metaIcon: 'list' }),
    h(
      'div',
      { class: 'pick mt-20' },
      // The wrapper casts the ticket's shadow (its notches are cut out of the ticket itself).
      h('div', { class: 'pick__stage' }, h('div', { class: 'pick__ticket' }, card), sticker),
      h(
        'div',
        { class: 'pick__side' },
        detailsSlot,
        h('div', { class: 'pick__actions' }, bottomBar(send), another, h('div', { class: 'center-row' }, details)),
      ),
    ),
    status,
  );
}
