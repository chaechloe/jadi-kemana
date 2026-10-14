# Jadi Kemana?

**So, where are we going?** A small, free web app that helps a friend group pick where to hang out, without leaving the group chat.

🇮🇩 [Baca dalam Bahasa Indonesia](README.id.md)

**▶ Try it: [chaechloe.github.io/jadi-kemana](https://chaechloe.github.io/jadi-kemana/)**

> [!NOTE]
> **Early version.** It works, but it's new, so ideas and bug reports are very welcome in [Issues](https://github.com/chaechloe/jadi-kemana/issues).

## Why

Every group chat has been here. Someone asks *"jadi kemana?"* ("so, where are we going?"). Everyone answers *"terserah"* ("whatever, up to you"). The plan quietly dies.

Jadi Kemana? gives the group something concrete to react to: a short list of real places, each one easy to bring up in the chat.

## How it works

1. **Collect places.** One person, the coordinator, makes a list of cafes, restaurants or hangout spots. Paste a Google Maps link and the place name, plus an approximate street address, fill in for you. If a link can't be read, you type the details in yourself.
2. **Send one link.** The whole list travels inside a single link. Drop it in the group chat. Friends just open it: no app to install, no account to make.
3. **Talk it over.** Every place card has a **Discuss this place!** button. It opens WhatsApp with a ready-made message about that place, including the Maps link. Pick the group, hit send, and decide together in the chat.

Still stuck? **Surprise me** (*Terserah!* in Bahasa Indonesia) lets the app pick one for you. Torn between two? **Compare** puts them side by side.

## Features

- Several lists on one phone, for example *WFC Bandung* (work-from-cafe spots), *Office iftar* and *Saturday hangout*
- Place cards with the address, opening hours, rating, perks (WiFi, power outlets, AC, prayer room, parking…), a note from the coordinator, and an emoji and colour per place
- Paste a Google Maps link to fill in the place name and an approximate address
- Share a whole list (up to 20 places) as one link. Short lists fit everywhere, even Instagram DMs; longer ones still fit WhatsApp. The share screen tells you which apps your link fits.
- **Discuss this place!** WhatsApp button, plus **Copy** and **Share** for other apps
- Random pick and side-by-side compare
- Bahasa Indonesia and English, switchable on every screen
- Reopen a list from its link, for example after your browser cleared its data

## Privacy: no accounts, no database

- **No database, no sign-up.** Your lists are saved in your phone's browser and inside the links you share, nowhere else.
- **The list lives inside the link.** When you share, the places are packed into the part of the link after the `#`. Browsers never send that part to the web server, so the site's host (GitHub) never sees your places.
- **Only map lookups leave your phone.** When you paste a Google Maps link, the app may ask OpenStreetMap for an approximate address. Only the place's map position (its coordinates) is sent, never your list.
- **Anyone with the link can see the list.** Treat it like an "anyone with the link" document, and keep private things (phone numbers, home addresses) out of the notes.
- **The link is also your backup.** iPhone Safari deletes a site's saved data after 7 days without a visit. An app added to the Home Screen is safe from this, but it keeps its own separate storage, so lists saved in Safari won't show up there. Either way, keep the link you shared: you can always reopen a list from it. Each change to a list makes a new link, so keep the newest one.

## Why rating and opening hours aren't filled in automatically

Google has this data, but the Google Maps Platform terms don't allow apps to save details from Google's Places service, such as rating and opening hours, inside a link or on your device, even if you edit them afterwards. That is exactly how this app stores lists. OpenStreetMap data is free and may be saved with credit, but it covers few local cafes: in a test with 5 Bandung cafes, it had only 1.

So the app fills in what it legitimately can: the name from your link, and an approximate street address from OpenStreetMap. You add the rating, hours and perks yourself, with quick presets and a shortcut to check the place on Maps.

## Use it as your own template

1. Click **Fork** at the top of this page (keep the fork public: GitHub Pages is free for public repos).
2. In your fork, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and click **Save**.
3. After a minute or two your copy is live at `https://<your-username>.github.io/jadi-kemana/`.

Want to make it yours? The example list is in `js/data.js` (`sampleList`), the colours and fonts are in `css/tokens.css`, and the shared texts are in `js/i18n.js` (each screen keeps its own texts at the top of its file in `js/views/`).

## Run it locally

There's nothing to install or build. You only need [Node.js](https://nodejs.org/) 22 or newer for the small dev server and the tests.

```bash
git clone https://github.com/chaechloe/jadi-kemana.git
cd jadi-kemana
node tools/serve.mjs
```

Then open http://localhost:8080. To run the tests: `node --test "tests/*.test.mjs"`.

How the code is organised is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Built with

- Plain HTML, CSS and JavaScript: no framework, no build step, no dependencies
- Hosted on GitHub Pages
- Self-hosted fonts, so loading the app doesn't contact any font service
- [Tabler Icons](https://tabler.io/icons) (MIT)
- [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (SIL Open Font License)
- Address suggestions from [OpenStreetMap](https://www.openstreetmap.org/copyright) data via Nominatim, © OpenStreetMap contributors (ODbL)

## Roadmap

- [x] Idea, research and mockups
- [x] First version: lists, place cards, sharing, WhatsApp buttons
- [x] Google Maps link auto-fill (place name + approximate address)
- [x] A setup guide for people using it as a template
- [ ] Testing on real phones and in WhatsApp
- [ ] A nicer link preview (image) when a list is shared in chat
- [ ] Install to Home Screen and offline support
- [ ] Reading short `maps.app.goo.gl` links automatically

## Contributing

Ideas and bug reports are welcome in [Issues](https://github.com/chaechloe/jadi-kemana/issues). Suggestions for more natural Bahasa Indonesia wording are especially helpful, and so are Google Maps links that don't fill in properly.

## License

[MIT](LICENSE) © 2026 chaechloe

Jadi Kemana? is an independent project. It isn't affiliated with or endorsed by WhatsApp, Meta, Google, LINE, Telegram, GitHub or the OpenStreetMap Foundation. All product names and trademarks belong to their owners.
