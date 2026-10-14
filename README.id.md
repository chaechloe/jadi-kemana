# Jadi Kemana?

**Jadi kemana nih?** Web app kecil dan gratis buat bantu geng kamu nentuin mau nongkrong di mana, langsung dari grup chat.

🇬🇧 [Read in English](README.md)

**▶ Coba langsung: [chaechloe.github.io/jadi-kemana](https://chaechloe.github.io/jadi-kemana/)**

> [!NOTE]
> **Masih versi awal.** Udah bisa dipakai, tapi masih baru, jadi ide dan laporan bug boleh banget dikirim lewat [Issues](https://github.com/chaechloe/jadi-kemana/issues).

## Kenapa

Semua grup chat pasti pernah ngalamin. Ada yang nanya "jadi kemana?", semua jawab "terserah", terus rencananya cuma jadi wacana.

Jadi Kemana? ngasih grup kamu bahan obrolan yang jelas: beberapa pilihan tempat yang beneran ada, dan tiap tempat gampang banget dilempar ke chat.

## Cara kerjanya

1. **Kumpulin tempatnya.** Satu orang jadi koordinator dan bikin daftar kafe, resto, atau spot nongkrong. Tempel link Google Maps, nama tempat dan perkiraan alamat jalannya langsung keisi. Kalau link-nya nggak kebaca, kamu tinggal isi sendiri.
2. **Kirim satu link.** Semua isi daftarnya udah ada di link itu. Lempar aja ke grup. Teman-teman tinggal buka, nggak perlu install app atau bikin akun.
3. **Bahas bareng.** Tiap kartu tempat punya tombol **Bahas tempat ini!** yang langsung buka WhatsApp dengan pesan siap kirim soal tempat itu, lengkap sama link Maps-nya. Pilih grupnya, kirim, terus putusin bareng di chat.

Masih bingung? Tombol **Terserah!** bakal milihin satu tempat buat kalian. Galau antara dua tempat? **Bandingin** bakal nampilin keduanya sebelahan.

## Fitur

- Bisa bikin beberapa daftar di satu HP, misalnya "WFC Bandung", "Bukber kantor", dan "Nongkrong Sabtu"
- Kartu tempat berisi alamat, jam buka, rating, fasilitas (WiFi, colokan, AC, mushola, parkir…), catatan dari koordinator, plus emoji dan warna buat tiap tempat
- Tempel link Google Maps, nama tempat dan perkiraan alamatnya langsung keisi
- Bagikan satu daftar utuh (maksimal 20 tempat) lewat satu link. Daftar pendek muat di mana aja, termasuk DM Instagram; yang lebih panjang tetap muat di WhatsApp. Layar bagikan bakal ngasih tahu link kamu muat di app mana aja.
- Tombol WhatsApp **Bahas tempat ini!**, plus **Salin** dan **Bagikan** buat app lain
- Pilih tempat secara acak dan bandingin dua tempat sebelahan
- Bahasa Indonesia dan Inggris, bisa diganti di tiap layar
- Buka lagi daftar dari link-nya, misalnya kalau data browser kamu kehapus

## Privasi: tanpa akun, tanpa database

- **Nggak ada database, nggak perlu bikin akun.** Daftar kamu cuma tersimpan di browser HP kamu dan di dalam link yang kamu bagikan, nggak di tempat lain.
- **Daftarnya ada di dalam link.** Pas kamu bagiin daftarnya, semua tempatnya dimasukin ke bagian link setelah tanda `#`. Browser nggak pernah ngirim bagian itu ke server, jadi GitHub (yang nge-hosting web ini) nggak pernah lihat isi daftar kamu.
- **Cuma pencarian peta yang keluar dari HP kamu.** Pas kamu tempel link Google Maps, app ini bisa nanya ke OpenStreetMap buat nyari perkiraan alamat. Yang dikirim cuma titik lokasi tempatnya (koordinat), bukan daftar kamu.
- **Siapa pun yang punya link-nya bisa lihat daftarnya.** Anggap aja kayak dokumen "siapa pun yang punya link", jadi jangan tulis info pribadi (nomor HP, alamat rumah) di catatan.
- **Link-nya sekaligus cadangan kamu.** Safari di iPhone ngehapus data situs yang udah 7 hari nggak dibuka. App yang dipasang di layar utama aman dari ini, tapi penyimpanannya terpisah dari Safari, jadi daftar yang kamu simpan di Safari nggak bakal muncul di situ. Jadi, simpan link yang udah kamu bagikan, soalnya daftarnya bisa dibuka lagi dari situ kapan aja. Tiap kali daftarnya diubah, link-nya ikut berubah, jadi simpan yang paling baru.

## Kenapa rating dan jam buka nggak keisi otomatis

Google sebenarnya punya datanya. Tapi aturan Google Maps Platform nggak ngebolehin app nyimpen detail tempat dari layanan Places Google, kayak rating dan jam buka, di dalam link atau di HP, walaupun udah kamu edit. Padahal justru di situ app ini nyimpen daftarnya. Data OpenStreetMap gratis dan boleh disimpan asal mencantumkan sumbernya, tapi kafe lokal yang ada di sana masih sedikit: pas dites ke 5 kafe di Bandung, cuma 1 yang ketemu.

Jadi app ini ngisi yang emang boleh aja: nama dari link kamu, dan perkiraan alamat jalan dari OpenStreetMap. Rating, jam buka, dan fasilitas kamu isi sendiri. Ada pilihan cepat dan shortcut buat ngecek tempatnya di Maps, jadi tetap gampang.

## Jadiin template sendiri

1. Klik **Fork** di bagian atas halaman ini (biarin fork-nya tetap publik, soalnya GitHub Pages gratis buat repo publik).
2. Di fork kamu, buka **Settings → Pages**. Di bagian **Build and deployment**, pilih **Deploy from a branch**, pilih `main` dan `/ (root)`, terus klik **Save**.
3. Tunggu semenit-dua, versi kamu udah online di `https://<username-kamu>.github.io/jadi-kemana/`.

Mau diubah sesuai selera? Daftar contohnya ada di `js/data.js` (`sampleList`), warna dan font di `css/tokens.css`, dan teks yang dipakai bareng ada di `js/i18n.js` (tiap layar nyimpen teksnya sendiri di bagian atas file-nya di `js/views/`).

## Jalanin di komputer sendiri

Nggak ada yang perlu di-install atau di-build. Kamu cuma butuh [Node.js](https://nodejs.org/) versi 22 ke atas buat server kecil dan tesnya.

```bash
git clone https://github.com/chaechloe/jadi-kemana.git
cd jadi-kemana
node tools/serve.mjs
```

Terus buka http://localhost:8080. Buat jalanin tes: `node --test "tests/*.test.mjs"`.

Susunan kodenya dijelasin di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Dibuat pakai

- HTML, CSS, dan JavaScript murni (vanilla): tanpa framework, tanpa proses build, tanpa dependency
- Di-hosting di GitHub Pages
- Font disimpan sendiri di repo, jadi buka app-nya nggak perlu ngehubungin layanan font mana pun
- [Tabler Icons](https://tabler.io/icons) (MIT)
- [Fredoka](https://fonts.google.com/specimen/Fredoka) dan [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (SIL Open Font License)
- Saran alamat dari data [OpenStreetMap](https://www.openstreetmap.org/copyright) lewat Nominatim, © kontributor OpenStreetMap (ODbL)

## Rencana ke depan

- [x] Ide, riset, dan mockup
- [x] Versi pertama: daftar, kartu tempat, berbagi, tombol WhatsApp
- [x] Isi otomatis dari link Google Maps (nama tempat + perkiraan alamat)
- [x] Panduan setup buat yang mau pakai sebagai template
- [ ] Dites di HP beneran dan di WhatsApp
- [ ] Tampilan pratinjau link (gambar) yang lebih cakep pas daftar dibagikan di chat
- [ ] Pasang di layar utama dan bisa dipakai offline
- [ ] Baca link pendek `maps.app.goo.gl` secara otomatis

## Ikut berkontribusi

Ide dan laporan bug boleh banget dikirim lewat [Issues](https://github.com/chaechloe/jadi-kemana/issues). Saran kata-kata bahasa Indonesia yang lebih natural juga bakal ngebantu, begitu juga contoh link Google Maps yang datanya nggak keisi dengan benar.

## Lisensi

[MIT](LICENSE) © 2026 chaechloe

Jadi Kemana? adalah proyek independen. Proyek ini nggak berafiliasi dengan, dan nggak didukung oleh, WhatsApp, Meta, Google, LINE, Telegram, GitHub, atau OpenStreetMap Foundation. Semua nama produk dan merek dagang adalah milik pemiliknya masing-masing.
