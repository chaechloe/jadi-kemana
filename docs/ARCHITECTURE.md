# Architecture

Jadi Kemana? is a static web app: plain HTML, CSS and JavaScript ES modules. There is no framework, no build step and no runtime dependency. It runs on any static host; GitHub Pages is the reference host.

```
index.html              app shell (meta, CSP, fonts, #app, #toast)
css/tokens.css          design tokens (:root custom properties) and @font-face
css/app.css             every component class, then a few screen-specific rules (last on purpose)
assets/fonts/*.woff2    self-hosted Fredoka + Plus Jakarta Sans (OFL, see LICENSES/)
assets/icons/logo.svg   favicon / brand mark
js/main.js              boot, render loop, per-route screen state
js/routes.js            hash builders + parseRoute
js/ui.js                DOM helpers: h(), icon(), toast(), sheets, copy/share
js/components.js        shared visual building blocks (tile, cover, ticket, top bar, buttons…)
js/icons.js             Tabler icon paths (MIT), static strings only
js/i18n.js              language state, COMMON strings, formatting helpers
js/config.js            settings for a fork (e.g. the OpenStreetMap address lookup on/off)
js/data.js              perk vocabulary, colours, emoji, limits, ids, the example list
js/store.js             lists in localStorage
js/codec.js             list <-> link payload
js/links.js             WhatsApp link, message templates, Google Maps link/text parsing
js/autofill.js          the place form's auto-fill decisions (no DOM, unit-tested)
js/geo.js               approximate address from OpenStreetMap Nominatim
js/views/*.js           one module per screen
tests/*.test.mjs        unit tests for the pure modules: node --test "tests/*.test.mjs"
tools/serve.mjs         zero-dependency local server (localhost only): node tools/serve.mjs
.github/workflows/      runs the syntax check and tests on every pull request
```

## Rules every module follows

1. **No HTML strings with data.** Never `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`. Build DOM with `h()`; text always goes in as text nodes. The one exception is `icon()`, which parses the static strings in `icons.js`.
2. **No inline style strings.** `h()` takes `style` as an object (CSP-safe). Views use classes from `app.css`; inline style is only for the per-place colour (`{ '--place': hex }`) and truly dynamic values.
3. **Every decoded or stored list is untrusted.** It goes through `codec.sanitizeList()`. Maps links must pass `links.isSafeMapsUrl()` and open with `target="_blank" rel="noopener"`. User text in WhatsApp messages can't carry links (schemes are stripped and domain-like dots defanged), so the Maps link stays the first link.
4. **All visible copy is bilingual.** Each view declares `const S = { id: {…}, en: {…} }` with identical keys and reads it through `t(S, key, vars)`; shared labels live in `i18n.COMMON`. User-typed content is never translated.
5. **Accessibility.** Real `<button>`, `<a href>`, `<label for>`; icon-only controls have an `aria-label`; toggles `aria-pressed`, the current item `aria-current`; targets ≥ 44px; focus moves to the screen's `h1` (`tabindex="-1"`) after navigation; `prefers-reduced-motion` is respected.
6. **Storage can fail** (private mode, quota, iOS eviction). Every `localStorage`/`sessionStorage` access is wrapped in try/catch, and the app still works read-only from a shared link.
7. **Errors are friendly and never block,** e.g. a broken link shows "Link-nya rusak atau kepotong" with a way back.

## Data model

```js
List  = { id, title, from, places: Place[], createdAt, updatedAt, sharedAt /* number|null */ }
Place = {
  id,            // 8-char id
  name,          // ≤ 80
  emoji,         // usually one of data.EMOJIS
  color,         // a data.COLORS key: orange purple red brown indigo olive teal plum
  address,       // ≤ 160, may be ''
  hours,         // '' | 'open24' | free text ≤ 40 (e.g. '09.00–22.00')
  rating,        // 0.1–5 with 1 decimal, or null (0 can't be encoded: ratingX10 0 = none)
  ratingCount,   // '' or digits, e.g. '1146'
  perks,         // data.PERKS codes
  custom,        // ≤ 5 free-text perks, each ≤ 30
  note,          // ≤ 200, may be ''
  maps,          // '' or a canonical URL that passes isSafeMapsUrl()
}
```

"Changed since shared" means `sharedAt !== null && updatedAt > sharedAt`. The example list has the fixed id `data.SAMPLE_ID` and is never stored under it (saving gives it a fresh id).

## Link payload (codec v1)

- **Shared link:** `<site>#d=<payload>`. The part after `#` is never sent to the server.
- **Payload** = `'1'` (version) + mode + data, where mode `'z'` = base64url(deflate-raw(UTF-8 JSON)) and `'j'` = base64url(UTF-8 JSON), the fallback without `CompressionStream`.
- **Positional JSON** keeps links short:
  ```
  [1, listId, title, from, [ place, … ]]
  place = [name, emoji, colorIndex, address, hours, ratingX10 /*0 = none*/, ratingCount,
           perksBitmask /*bit i = PERKS[i]*/, custom[], note, maps /*'~<id>' = maps.app.goo.gl/<id>*/]
  ```
- **Links people already shared must keep working.** Never reorder or remove `data.PERKS` / `data.COLORS` (only append), and keep `tests/golden.test.mjs` passing: it decodes two frozen real links.
- **Decoding** validates types, truncates to `data.LIMITS`, drops unsafe URLs, caps places at `LIMITS.places` and gives places fresh ids.
- The site address is inside every shared link: renaming the repo or the GitHub user breaks old links.

## Routing and screens

| hash | view |
|---|---|
| `''` or `#/` | `views/welcome.js` |
| `#/list/<id>` | `views/editor.js` |
| `#/list/<id>/place/new` · `#/list/<id>/place/<pid>` | `views/place-form.js` |
| `#/list/<id>/share` | `views/share.js` |
| `#d=<payload>` | `views/friend.js` |
| `#d=<payload>&v=compare` · `&v=random` | `views/compare.js` · `views/random.js` |

`&from=<listId>` marks the coordinator's "Preview as a friend"; `&i=<n>` is the friend view's current card. Build hashes with `routes.js` (`home()`, `list(id)`, `place(id, pid|'new')`, `share(id)`, `friend(payload, { v, from, i })`), never by hand.

**View contract:**

```js
export async function render(ctx) { /* returns an HTMLElement */ }
// ctx = {
//   params,      // route params: { id, pid, payload, v, from, i }
//   list,        // friend/compare/random: the decoded list (memoized per payload)
//   state,       // a plain object kept for this exact hash: the same object across re-renders
//                // (language switch, ctx.rerender()), a fresh {} when the hash changes.
//                // Views keep their screen state (form fields, open panels…) in it.
//   nav(hash),   // go to a hash (re-renders when it's the current one)
//   rerender(),  // re-run render() for the current hash
// }
```

**Layout:** phones get one column with a bottom bar pinned to the screen. From 960px wide, a view that marks its regions `.l-main` and `.l-aside` inside a `.layout` screen (`layout--aside-end` or `layout--aside-start`) gets two columns, with the side panel sticky and bottom bars laid out inline. On phones those regions are plain blocks in reading order, so the DOM order is the phone order. Wide screens also show the logo in every top bar. The friend view becomes a list of places (ticket stubs) beside a horizontal card, with ‹ 2 / 5 › and the actions above it; the editor shows places as a card grid with a share panel; the place form puts fields in two columns with a live preview; the welcome screen is one rounded hero card; bottom sheets become centred dialogs.

`main.js` re-renders on `hashchange` and on the `jk:lang` event, and puts focus back on the control with the same id. Views never re-render while the user types: they update `ctx.state` and patch the nodes that change.

## Module APIs

**ui.js:** `h(tag, props, ...children)` · `icon(name, { size, class })` · `uid(prefix)` · `toast(message, { icon })` · `openSheet(content, { label, onClose }) → close` · `copyText(text)` · `shareText(text)` · `copyWithToast(text, { done, failed })` · `shareOrCopy(text, { done, failed })`

**components.js:** `langToggle` · `topBar` · `pageHeader` · `deadEnd` · `placeTile` · `cover` · `ticket` · `placeMetaLines` · `facilitiesList` · `noteBlock` · `sendButton` · `primaryButton` · `bottomBar` · `ghostRow` · `emptyState` · `note` · `deleteRow` · `confirmDelete` (Cancel starts focused) · `iconButton` · `listRow` · `squiggleWord` · `hidden` (visually hidden text) · `placesLabel(n)`

**i18n.js:** `getLang()` (saved choice > browser language > `'id'`) · `setLang(lang)` (dispatches `jk:lang`) · `t(dict, key, vars)` · `tc(key, vars)` · `COMMON` · `formatHours` · `formatRating` · `relativeTime`

**store.js:** `getLists` · `getList` · `createList` · `saveList` · `deleteList` · `upsertPlace` (a no-op when nothing changed) · `removePlace` · `movePlace` · `markShared` · `importList` · `storageOk`

**codec.js:** `encodeList(list) → payload` · `decodeList(payload) → List` (throws `CodecError`: `version` | `corrupt` | `unsupported`) · `sanitizeList` · `listUrl(payload)`

**links.js:** `waLink(text)` (always `api.whatsapp.com/send?text=`, never `wa.me`, whose redirect breaks emoji) · `placeMessage` · `randomMessage` · `compareMessage` · `listMessage` · `isSafeMapsUrl` · `isShortMapsUrl` · `canonicalMapsUrl` (drops tracking parameters) · `parseMapsInput(text)`

`parseMapsInput` understands everything people paste from Google Maps:
- a full link (`google.<tld>/maps/place/<name>/…!3d<lat>!4d<lng>`, `?q=`, `/search/`): name and pin;
- a short link (`maps.app.goo.gl`, `share.google`, `goo.gl/maps`): only redirects, so `short: true` and nothing else (a browser can't follow it);
- share text ("name / address / link", or "name, address link" on one line);
- a **place panel copied from the Google Maps website** (no link): name, rating, review count, address, "open 24 hours", plus a Google Maps search link for the place.

**autofill.js:** the place form's decisions, without DOM: `autofillState` · `pasteLink` · `editLink` · `editField` · `readLink → { status, coords }` · `lookupAddress` · `holdLink` (keep a short link while its panel text is pasted) · `mapsFromLink` · `statusMessage`. A value from Maps only fills an empty field and stays "auto" until the user edits it; a new link clears the auto values, never typed ones.

**geo.js:** `approxAddress(lat, lng, lang) → string|null`. Nominatim reverse geocoding: at most 1 request per second, 8 s timeout, cached by rounded coordinates, off when `CONFIG.addressLookup` is false. Data © OpenStreetMap contributors (ODbL); the form shows the credit when it's used.

## Message templates

| message | ID | EN |
|---|---|---|
| place | `*{name}*\n📍 {address}\nKayaknya oke nih, gimana menurut kalian?\n{maps}` | `*{name}*\n📍 {address}\nLooks good, what do you think?\n{maps}` |
| random | `Pada jawab "terserah", yaudah aku yang pilihin: *{name}*!\n📍 {address}\nGas nggak nih?\n{maps}` | `Everyone said "whatever", so I picked: *{name}*!\n📍 {address}\nShall we go?\n{maps}` |
| compare | `*{A}* atau *{B}*? 🤔\n\nA: {addrA}\n{mapsA}\n\nB: {addrB}\n{mapsB}\n\nPilih yang mana nih?` | `*{A}* or *{B}*? 🤔\n\nA: {addrA}\n{mapsA}\n\nB: {addrB}\n{mapsB}\n\nWhich one?` |
| list | `Jadi kemana? 👀 Aku udah kumpulin {n} tempat buat "{title}":\n{link}\nBuka, terus bahas yang kalian suka ya!` | `So, where are we going? 👀 I put together {n} places for "{title}":\n{link}\nOpen it and bring up the ones you like!` |

A line whose value is empty is left out. The Maps link is always the first link in a place message.

## Testing

`node --test "tests/*.test.mjs"` covers the pure modules: codec (incl. the golden links and hostile payloads), links and Maps parsing, autofill, routes, i18n and storage. The same runs on every pull request (`.github/workflows/tests.yml`). Screens are checked by hand in a browser at phone (360–375px) and desktop widths.
