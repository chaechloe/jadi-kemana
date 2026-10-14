// Friend view (#d=<payload>): what the group sees after opening a shared link.
// One place card at a time with a peek of the next one, pager dots, swipe and arrow keys
// (plus ‹ › buttons with a mouse). The card's head (cover, address, hours) sticks under the top bar
// while the rest scrolls, and a one-time hint says there's more below. On a wide screen the places
// are listed beside the card instead (list + card), with the actions under the list.
// The current card lives in the hash as '&i=' (replaceState), so a reload or Back returns to it.
import { h, icon, toast, copyWithToast, shareOrCopy } from '../ui.js';
import {
  topBar,
  iconButton,
  cover,
  placeMetaLines,
  facilitiesList,
  noteBlock,
  sendButton,
  ghostRow,
  emptyState,
  bottomBar,
  placesLabel,
  listRow,
  placeTile,
} from '../components.js';
import { getLang, t, tc, formatRating } from '../i18n.js';
import { colorHex, newId, SAMPLE_ID } from '../data.js';
import { getList, importList, storageOk } from '../store.js';
import { waLink, placeMessage, isSafeMapsUrl } from '../links.js';
import * as routes from '../routes.js';

const S = {
  id: {
    cards: 'Kartu tempat',
    places: 'Daftar tempat',
    card: '{name}, {i} dari {n}',
    next: 'Tempat berikutnya',
    previous: 'Tempat sebelumnya',
    scrollHint: 'Scroll ke bawah buat lihat fasilitas & catatan',
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
    places: 'Places',
    card: '{name}, {i} of {n}',
    next: 'Next place',
    previous: 'Previous place',
    scrollHint: 'Scroll down for perks & notes',
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
const COMPACT_SHRINK = 88; // px the cover loses when the head is stuck (176 → 88, see .placecard__head)
const HINT_KEY = 'jk.hint.scroll';
const HINT_DELAY_MS = 700;
const HINT_SHOW_MS = 6000;

// ---- card index in the hash ----

/** The card index saved in the hash ('&i='), or 0 when missing or out of range. */
function savedIndex(params, total) {
  const n = Number(params.i);
  return Number.isInteger(n) && n >= 0 && n < total ? n : 0;
}

/** Keeps the current card in this history entry without a hashchange (so no re-render). */
function rememberIndex({ payload, from }, index) {
  try {
    history.replaceState(history.state, '', routes.friend(payload, { from, i: index || null }));
  } catch {
    // History is locked down in some embedded browsers; the card still changes.
  }
}

// ---- pieces ----

/** List name (the screen h1, styled for the bar) and "dari Rani · 5 tempat". */
function listHeading(list) {
  const count = placesLabel(list.places.length);
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
      h('a', { class: 'link link--hit', attrs: { href: routes.list(listId) } }, t(S, 'backToEdit')),
    ),
  );
}

function placeCard(place, { index, total, from }) {
  const message = placeMessage(place, getLang());
  const meta = placeMetaLines(place);
  const facilities = facilitiesList(place);
  const maps = isSafeMapsUrl(place.maps) ? place.maps : '';
  const toasts = { done: t(S, 'toastCopied'), failed: t(S, 'toastCopyFailed') };

  return h(
    'article',
    {
      class: 'placecard',
      attrs: { tabindex: '-1', 'aria-label': t(S, 'card', { name: place.name, i: index + 1, n: total }) },
    },
    h('div', { class: 'placecard__sentinel', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'placecard__head' }, cover(place), meta && h('div', { class: 'placecard__meta' }, meta)),
    h(
      'div',
      { class: 'placecard__body' },
      facilities && [h('h3', { class: 'placecard__heading' }, tc('perksTitle')), facilities],
      noteBlock(place, from),
      sendButton({ href: waLink(message), label: tc('discuss'), size: 'md' }),
      ghostRow([
        maps && { icon: 'map-pin', label: tc('mapsShort'), ariaLabel: tc('openMaps'), href: maps },
        {
          icon: 'copy',
          label: tc('copyShort'),
          ariaLabel: tc('copyText'),
          onClick: () => copyWithToast(message, toasts),
        },
        { icon: 'share', label: tc('share'), onClick: () => shareOrCopy(message, toasts) },
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

// ---- sticky head ----

let stickWatch = null; // the IntersectionObserver of the card on screen

/**
 * Marks the card's head .is-stuck (compact cover) once it sticks under the top bar. Compacting
 * shortens the page, so it only happens when there's enough scroll room left to stay stuck;
 * otherwise a short card would bounce between the two sizes.
 */
function watchStick(card) {
  stickWatch?.disconnect();
  stickWatch = null;
  const sentinel = card.querySelector('.placecard__sentinel');
  const head = card.querySelector('.placecard__head');
  if (!sentinel || !head || !('IntersectionObserver' in window)) return;

  const bar = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 56;
  stickWatch = new IntersectionObserver(
    ([entry]) => {
      const passed = !entry.isIntersecting && entry.boundingClientRect.top < bar;
      if (!passed) {
        head.classList.remove('is-stuck');
        return;
      }
      // Wide screens have room for the full cover: it stays sticky but doesn't shrink.
      if (head.classList.contains('is-stuck') || matchMedia('(min-width: 960px)').matches) return;
      const page = document.documentElement;
      const room = page.scrollHeight - COMPACT_SHRINK - innerHeight - (scrollY + entry.boundingClientRect.top - bar);
      if (room > 24) head.classList.add('is-stuck');
    },
    { rootMargin: `-${bar}px 0px 0px 0px`, threshold: 0 },
  );
  stickWatch.observe(sentinel);
}

// ---- "scroll for more" hint ----

let hintShown = false; // per page load, for browsers without sessionStorage

function hintSeen() {
  try {
    return hintShown || sessionStorage.getItem(HINT_KEY) === '1';
  } catch {
    return hintShown;
  }
}

function markHintSeen() {
  hintShown = true;
  try {
    sessionStorage.setItem(HINT_KEY, '1');
  } catch {
    // Not remembering is fine: it shows once per page load instead.
  }
}

/**
 * Once per visit, when the card's actions are below the screen and the page hasn't been scrolled,
 * a small pill says there's more below. It fades on the first scroll or after a few seconds.
 * Purely visual (aria-hidden): screen readers reach the content anyway.
 */
function scrollHint(card) {
  const hint = h(
    'div',
    { class: 'scroll-hint', attrs: { 'aria-hidden': 'true' } },
    icon('arrow-down', { size: 16 }),
    h('span', {}, t(S, 'scrollHint')),
  );
  if (hintSeen()) return hint;

  const hide = () => {
    hint.classList.remove('is-visible');
    removeEventListener('scroll', onScroll);
  };
  const onScroll = () => {
    if (scrollY > 24) hide();
  };
  setTimeout(() => {
    if (!hint.isConnected || hintSeen() || scrollY > 24) return;
    const actions = card.isConnected ? card.querySelector('.ghost-row') : null;
    const bar = document.querySelector('.bottom-bar')?.getBoundingClientRect().height ?? 0;
    if (!actions || actions.getBoundingClientRect().bottom <= innerHeight - bar) return; // all visible
    markHintSeen();
    hint.classList.add('is-visible');
    addEventListener('scroll', onScroll, { passive: true });
    setTimeout(hide, HINT_SHOW_MS);
  }, HINT_DELAY_MS);
  return hint;
}

/** The card carousel, its dots and a polite status line. Returns the nodes to place in the screen. */
function placeBrowser(list, params) {
  const { places, from } = list;
  const total = places.length;
  let index = savedIndex(params, total);
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

  // Wide screens: every place as a row beside the card (CSS hides it on phones).
  const rowMeta = (place) => {
    const rating = formatRating(place.rating, '', getLang());
    return [rating && `★ ${rating}`, place.address].filter(Boolean).join(' · ');
  };
  const picks = places.map((place, i) =>
    listRow({ tile: placeTile(place), title: place.name, meta: rowMeta(place), current: i === index, onClick: () => go(i) }),
  );
  const pickButtons = picks.map((row) => row.querySelector('.row__main'));
  const placeList = h(
    'nav',
    { class: 'place-picks', attrs: { 'aria-label': t(S, 'places') } },
    h('ul', { class: 'list-surface', attrs: { role: 'list' } }, picks),
  );

  function go(next) {
    const focusWasInCard = card.contains(document.activeElement);
    index = ((next % total) + total) % total;

    const fresh = placeCard(places[index], { index, total, from });
    card.replaceWith(fresh);
    card = fresh;
    watchStick(card);
    if (peek) peek.replaceChildren(peekCard());
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
    pickButtons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });

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

  // The head can only be watched once the card is in the page.
  requestAnimationFrame(() => card.isConnected && watchStick(card));

  // With a mouse there's no swipe: ‹ › buttons sit beside the dots (CSS shows them for fine pointers).
  const nav =
    total > 1 &&
    h(
      'div',
      { class: 'dots-nav' },
      iconButton({ icon: 'chevron-left', label: t(S, 'previous'), onClick: () => go(index - 1) }),
      h('div', { class: 'dots', attrs: { role: 'group', 'aria-label': t(S, 'dots') } }, dots),
      iconButton({ icon: 'chevron-right', label: t(S, 'next'), onClick: () => go(index + 1) }),
    );

  return { main: [carousel, nav, status, scrollHint(card)], list: placeList };
}

/** "Simpan ke HP ini" for a list this phone doesn't have yet; afterwards (or if it has it) a link to open it. */
function saveArea(list) {
  const area = h('div', { class: 'center-row mt-8' });

  const showOpen = (id) => {
    const open = h('a', { class: 'link link--hit', attrs: { href: routes.list(id) } }, t(S, 'open'));
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
      { class: 'btn btn--ghost', attrs: { href: routes.place(ownList.id, 'new') } },
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

/** "Terserah!" and "Bandingin" (from 2 places), side by side. */
function friendBar({ payload, from }, total) {
  const action = (v, name, key) =>
    h(
      'a',
      { class: 'btn btn--secondary', attrs: { href: routes.friend(payload, { from, v }) } },
      icon(name, { size: 16 }),
      h('span', {}, t(S, key)),
    );
  return bottomBar(
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

  if (!total) {
    return h(
      'div',
      { class: 'screen screen--friend screen--nobar' },
      topBar({ start: listHeading(list) }),
      ownList && previewNote(ownList.id),
      emptyView(ownList),
      credit(),
    );
  }

  // Phones: one column in this order. Wide screens: the aside (list + actions) sits left of the card.
  const browser = placeBrowser(list, params);
  return h(
    'div',
    { class: 'screen screen--friend layout layout--aside-start' },
    topBar({ start: listHeading(list) }),
    h('div', { class: 'l-main' }, ownList && previewNote(ownList.id), browser.main),
    h(
      'div',
      { class: 'l-aside' },
      browser.list,
      friendBar(params, total),
      !ownList && storageOk() && saveArea(list),
      credit(),
    ),
  );
}
