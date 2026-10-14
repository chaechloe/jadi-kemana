// Friend view (#d=<payload>): what the group sees after opening a shared link.
// One place card at a time with a peek of the next one, pager dots, swipe and arrow keys.
// The current card lives in the hash as '&i=' (replaceState), so a reload or Back returns to it.
import { h, icon, toast, copyText, shareText } from '../ui.js';
import {
  topBar,
  cover,
  placeMetaLines,
  facilitiesList,
  noteBlock,
  sendButton,
  ghostRow,
  emptyState,
} from '../components.js';
import { getLang, t, tc } from '../i18n.js';
import { colorHex, newId, SAMPLE_ID } from '../data.js';
import { getList, importList, storageOk } from '../store.js';
import { waLink, placeMessage, isSafeMapsUrl } from '../links.js';

const S = {
  id: {
    cards: 'Kartu tempat',
    card: '{name}, {i} dari {n}',
    next: 'Tempat berikutnya',
    dots: 'Pilih tempat',
    dot: 'Tempat {i}: {name}',
    random: 'Terserah!',
    compare: 'Bandingin',
    toastCopied: 'Teks disalin, tinggal tempel di grup',
    toastCopyFailed: 'Teksnya gagal disalin, coba lagi ya',
    preview: 'Ini tampilan teman',
    backToEdit: 'Balik ngedit',
    save: 'Simpan ke HP ini',
    toastSaved: 'Daftar disimpan di HP ini',
    onPhone: 'Daftar ini udah ada di HP ini.',
    open: 'Buka',
    empty: 'Daftar ini belum ada tempatnya. Coba tanya yang ngirim link-nya ya.',
    emptyOwn: 'Daftar ini belum ada tempatnya. Tambahin dulu, baru bagikan ya.',
    madeWith: 'Dibuat pakai {app}',
  },
  en: {
    cards: 'Place cards',
    card: '{name}, {i} of {n}',
    next: 'Next place',
    dots: 'Choose a place',
    dot: 'Place {i}: {name}',
    random: 'Surprise me',
    compare: 'Compare',
    toastCopied: 'Text copied. Paste it in the group chat.',
    toastCopyFailed: "Couldn't copy the text. Try again.",
    preview: 'This is what friends see',
    backToEdit: 'Back to editing',
    save: 'Save to this phone',
    toastSaved: 'List saved on this phone',
    onPhone: 'This list is saved on this phone.',
    open: 'Open',
    empty: "This list doesn't have any places yet. Try asking whoever sent the link.",
    emptyOwn: "This list doesn't have any places yet. Add some before you share it.",
    madeWith: 'Made with {app}',
  },
};

const SWIPE_PX = 40;
const ARROW_STEPS = { ArrowLeft: -1, ArrowRight: 1 };

// ---- hashes ----

/** '#d=<payload>', then `from` (preview mode) and any `extra` params. 'd=' stays first for the router. */
function friendHash({ payload, from }, extra = {}) {
  const query = new URLSearchParams({ d: payload });
  if (from) query.set('from', from);
  for (const [key, value] of Object.entries(extra)) {
    if (value != null && value !== '') query.set(key, String(value));
  }
  return `#${query}`;
}

const listHash = (id) => `#/list/${encodeURIComponent(id)}`;

/** The card index saved in the hash ('&i='), or 0 when missing or out of range. */
function savedIndex(total) {
  const n = Number(new URLSearchParams(location.hash.slice(1)).get('i'));
  return Number.isInteger(n) && n >= 0 && n < total ? n : 0;
}

/** Keeps the current card in this history entry without a hashchange (so no re-render). */
function rememberIndex(params, index) {
  try {
    history.replaceState(history.state, '', friendHash(params, { i: index || null }));
  } catch {
    // History is locked down in some embedded browsers; the card still changes.
  }
}

// ---- copy and share ----

async function copyMessage(text) {
  const copied = await copyText(text);
  if (copied) toast(t(S, 'toastCopied'));
  else toast(t(S, 'toastCopyFailed'), { icon: 'alert-circle' });
}

function shareMessage(text) {
  // shareText() has to start synchronously inside the click; without a share sheet, copy instead.
  shareText(text).then((result) => {
    if (result === 'unsupported') copyMessage(text);
  });
}

// ---- pieces ----

/** List name (the screen h1, styled for the bar) and "dari Rani · 5 tempat". */
function listHeading(list) {
  const n = list.places.length;
  const count = tc(n === 1 ? 'onePlace' : 'manyPlaces', { n });
  const caption = list.from ? `${tc('fromName', { name: list.from })} · ${count}` : count;
  return h(
    'div',
    { class: 'topbar__heading' },
    h('h1', { class: 'topbar__name', attrs: { tabindex: '-1' } }, list.title || tc('untitled')),
    h('p', { class: 'topbar__caption' }, caption),
  );
}

/** Shown when the coordinator previews their own list: a way back to the editor. */
function previewNote(listId) {
  return h(
    'div',
    { class: 'note mt-8' },
    icon('eye', { size: 16 }),
    h(
      'p',
      { class: 'note__body split' },
      h('span', {}, t(S, 'preview')),
      h('a', { class: 'link link--hit', attrs: { href: listHash(listId) } }, t(S, 'backToEdit')),
    ),
  );
}

function placeCard(place, { index, total, from }) {
  const message = placeMessage(place, getLang());
  const meta = placeMetaLines(place);
  const facilities = facilitiesList(place);
  const maps = isSafeMapsUrl(place.maps) ? place.maps : '';

  return h(
    'article',
    {
      class: 'placecard',
      attrs: { tabindex: '-1', 'aria-label': t(S, 'card', { name: place.name, i: index + 1, n: total }) },
    },
    cover(place),
    h(
      'div',
      { class: 'placecard__body' },
      meta,
      facilities && [
        meta && h('hr', { class: 'divider' }),
        h('h3', { class: 'placecard__heading' }, tc('perksTitle')),
        facilities,
      ],
      noteBlock(place, from),
      sendButton({ href: waLink(message), label: tc('discuss'), size: 'md' }),
      ghostRow([
        maps && { icon: 'map-pin', label: tc('mapsShort'), ariaLabel: tc('openMaps'), href: maps },
        { icon: 'copy', label: tc('copyShort'), ariaLabel: tc('copyText'), onClick: () => copyMessage(message) },
        { icon: 'share', label: tc('share'), onClick: () => shareMessage(message) },
      ]),
    ),
  );
}

/** Calls onSwipe(1) on a left swipe and onSwipe(-1) on a right one. Vertical drags stay page scrolls. */
function onHorizontalSwipe(el, onSwipe) {
  let start = null;
  el.addEventListener('pointerdown', (event) => {
    // A second finger (pinch) or a non-primary mouse button cancels the gesture.
    start = event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  el.addEventListener('pointercancel', () => {
    start = null;
  });
  el.addEventListener('pointerup', (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (event.pointerType === 'mouse') swallowNextClick(el);
    onSwipe(dx < 0 ? 1 : -1);
  });
}

// A mouse drag that ends on the control it started on (e.g. the peek) would also click it.
function swallowNextClick(el) {
  const swallow = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  el.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0);
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** After a card change, scrolls back up to the new cover if the page was scrolled past it. */
function revealCard(carousel) {
  const bar = document.querySelector('.topbar');
  const top = carousel.getBoundingClientRect().top - (bar ? bar.getBoundingClientRect().height : 0);
  if (top < 0) window.scrollBy({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** The card carousel, its dots and a polite status line. Returns the nodes to place in the screen. */
function placeBrowser(list, params) {
  const { places, from } = list;
  const total = places.length;
  let index = savedIndex(total);
  let card = placeCard(places[index], { index, total, from });

  const peekCard = () =>
    h('span', { class: 'peek__card', style: { '--place': colorHex(places[(index + 1) % total].color) } });
  const peek =
    total > 1 &&
    h(
      'button',
      { class: 'peek', attrs: { type: 'button', 'aria-label': t(S, 'next') }, on: { click: () => go(index + 1) } },
      peekCard(),
    );
  const carousel = h('section', { class: 'carousel carousel--swipe', attrs: { 'aria-label': t(S, 'cards') } }, card, peek);

  const dots = places.map((place, i) =>
    h('button', {
      class: 'dot',
      attrs: { type: 'button', 'aria-label': t(S, 'dot', { i: i + 1, name: place.name }), 'aria-current': i === index },
      on: { click: () => go(i) },
    }),
  );
  const status = h('p', { class: 'visually-hidden', attrs: { role: 'status' } });

  function go(next) {
    const focusWasInCard = card.contains(document.activeElement);
    index = ((next % total) + total) % total;

    const fresh = placeCard(places[index], { index, total, from });
    card.replaceWith(fresh);
    card = fresh;
    if (peek) peek.replaceChildren(peekCard());
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));

    rememberIndex(params, index);
    revealCard(carousel);
    // Focus follows a card that was in use (arrow keys); otherwise announce the change.
    if (focusWasInCard) card.focus({ preventScroll: true });
    else status.textContent = fresh.getAttribute('aria-label');
  }

  if (total > 1) {
    onHorizontalSwipe(carousel, (step) => go(index + step));
    carousel.addEventListener('keydown', (event) => {
      const step = ARROW_STEPS[event.key];
      if (!step || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      go(index + step);
    });
  }

  return [
    carousel,
    total > 1 && h('div', { class: 'dots', attrs: { role: 'group', 'aria-label': t(S, 'dots') } }, dots),
    status,
  ];
}

/** "Simpan ke HP ini" for a list this phone doesn't have yet; afterwards (or if it has it) a link to open it. */
function saveArea(list) {
  const area = h('div', { class: 'center-row mt-8' });

  const showOpen = (id) => {
    const open = h('a', { class: 'link link--hit', attrs: { href: listHash(id) } }, t(S, 'open'));
    area.replaceChildren(
      h('p', { class: 'hint hint--center' }, icon('check', { size: 14 }), h('span', {}, t(S, 'onPhone')), open),
    );
    return open;
  };

  const save = () => {
    if (!storageOk()) {
      toast(tc('errStorage'), { icon: 'alert-circle' });
      return;
    }
    // The example's id is the same on every phone, so a saved copy gets its own id
    // (otherwise it would later collide with someone else's list made from the example).
    const { list: saved } = importList(list.id === SAMPLE_ID ? { ...list, id: newId() } : list);
    toast(t(S, 'toastSaved'));
    showOpen(saved.id).focus();
  };

  // A list already on this phone may be newer than the link (the coordinator's own), so never overwrite it here.
  // The example is never "already on this phone": each saved copy has its own id (an old 'sample01' copy is ignored).
  if (list.id !== SAMPLE_ID && getList(list.id)) showOpen(list.id);
  else {
    area.append(
      h(
        'button',
        { class: 'btn btn--ghost', attrs: { type: 'button' }, on: { click: save } },
        icon('device-mobile', { size: 16 }),
        h('span', {}, t(S, 'save')),
      ),
    );
  }
  return area;
}

function emptyView(ownList) {
  const action =
    ownList &&
    h(
      'a',
      { class: 'btn btn--ghost', attrs: { href: `${listHash(ownList.id)}/place/new` } },
      icon('plus', { size: 16 }),
      h('span', {}, tc('addPlace')),
    );
  return emptyState({ icon: 'map-pin', text: t(S, ownList ? 'emptyOwn' : 'empty'), action });
}

/** "Dibuat pakai Jadi Kemana?": the page without the hash, i.e. a fresh start of the app. */
function credit() {
  return h(
    'footer',
    { class: 'center text-small mt-24' },
    h('a', { class: 'link link--hit', attrs: { href: location.pathname } }, t(S, 'madeWith', { app: tc('appName') })),
  );
}

function bottomBar(params, total) {
  const action = (v, name, key) =>
    h(
      'a',
      { class: 'btn btn--secondary', attrs: { href: friendHash(params, { v }) } },
      icon(name, { size: 16 }),
      h('span', {}, t(S, key)),
    );
  return h(
    'div',
    { class: 'bottom-bar' },
    h(
      'div',
      { class: 'bottom-bar__row' },
      action('random', 'arrows-shuffle', 'random'),
      total >= 2 && action('compare', 'columns-2', 'compare'),
    ),
  );
}

// ---- view ----

export async function render(ctx) {
  const { list, params } = ctx;
  const ownList = params.from ? getList(params.from) : null;
  const total = list.places.length;

  return h(
    'div',
    { class: ['screen', !total && 'screen--nobar'] },
    topBar({ start: listHeading(list) }),
    ownList && previewNote(ownList.id),
    total ? placeBrowser(list, params) : emptyView(ownList),
    total > 0 && !ownList && storageOk() && saveArea(list),
    credit(),
    total > 0 && bottomBar(params, total),
  );
}
