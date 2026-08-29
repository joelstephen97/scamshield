<!-- Translated store listing (id). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Pemblokir Penipuan & Phishing: ScamShield

## Short description

Memblokir situs penipuan, phishing, dan toko palsu. 100% di perangkat — aktivitas browsing Anda tidak pernah keluar dari komputer.

## Full description

Tidak ada server. ScamShield membaca halaman yang sedang Anda buka, pesan yang
Anda tempel, dan toko tempat Anda checkout — sepenuhnya di dalam browser
Anda — dan tidak pernah mengirim apa pun yang Anda jelajahi, ketik, atau
tempel ke tempat lain.

**Mengapa ScamShield**

Sebagian besar ekstensi anti-penipuan mengirim data ke server mereka:
mereka mengirim halaman yang Anda kunjungi, atau hash-nya, ke server
perusahaan dan menerima vonis kembali. ScamShield tidak melakukan itu, karena
tidak perlu — deteksi yang sama yang akan berjalan di cloud, berjalan
secara lokal. Artinya tidak ada akun, tidak ada gangguan server yang
membuat Anda tanpa perlindungan, dan tidak ada apa pun tentang aktivitas
browsing Anda yang bisa bocor, diminta lewat somasi hukum, atau diam-diam
dijual nanti. Ini gratis, tanpa tingkat premium, tanpa uji coba, dan tanpa
"tingkatkan untuk membuka perlindungan real-time" — seluruh produk adalah
produk gratis.

**Apa yang diblokir**

- **Login bank & merek palsu** — ScamShield mencocokkan hash ikon dan logo
  halaman dengan tabel 64 merek (termasuk bank, operator telekomunikasi,
  dan layanan pemerintah UEA, di samping PayPal, Microsoft, Google, dan
  lainnya), serta mendeteksi domain homograf IDN yang mengeja sebuah merek
  menggunakan karakter asing yang mirip. Login palsu dengan logo yang
  benar di domain yang salah tetap terdeteksi meski alamatnya sendiri
  terlihat familiar.
- **Toko palsu** — hitung mundur palsu, tekanan palsu "tinggal 2 lagi",
  lencana kepercayaan hotlink, permintaan pembayaran di luar platform, dan
  informasi kontak yang hilang ditampilkan dalam kartu belanja pop-up
  sebelum Anda checkout.
- **Penguras wallet kripto** — memperingatkan sebelum persetujuan berisiko
  dan tanda tangan buta, termasuk delegasi akun EIP-7702 dan permintaan
  multi-wallet EIP-6963, dan langsung memblokir upaya pencurian frasa
  pemulihan.
- **Penipuan dukungan teknis** — pemblokiran layar penuh untuk halaman
  "PC Anda terinfeksi, telepon nomor ini sekarang", dengan jalan keluar
  satu klik yang terlebih dahulu menonaktifkan jebakan kunci layar dan
  tombol Kembali di halaman tersebut.
- **Serangan ClickFix & clipboard** — trik malware yang paling cepat
  berkembang di tahun 2025: CAPTCHA palsu "verifikasi Anda manusia" yang
  membujuk Anda menempelkan perintah ke Run Windows. ScamShield menimpa muatan
  clipboard berbahaya dan memblokir halaman secara layar penuh sebelum
  bisa dijalankan.
- **Formulir bocor** — memperingatkan begitu sebuah situs mengirim email
  atau nomor telepon yang Anda ketik ke pelacak, *sebelum* Anda menekan
  kirim, dan secara terpisah menyebutkan skrip fingerprinting serta
  jebakan izin notifikasi "klik Izinkan untuk melanjutkan".
- **Hasil pencarian berisiko, ditandai sebelum Anda mengeklik** — di
  Google, Bing, dan DuckDuckGo, titik merah atau kuning kecil menandai
  hasil yang domainnya sudah dikenal berbahaya atau sangat mirip dengan
  sebuah merek, sehingga Anda melihat risikonya sebelum mengeklik, bukan
  sesudahnya.

**Cara kerjanya**

1. ScamShield membaca halaman itu sendiri, di perangkat Anda — kata-kata,
   tata letak, formulir login, dan ikonnya — pada saat Anda membukanya,
   atau pesan yang Anda tempel ke popup untuk pemeriksaan pesan penipuan.
2. Model di perangkat dan seperangkat aturan menilai apa yang ditemukan.
   Satu sinyal lemah tidak pernah menghasilkan lebih dari catatan
   *mencurigakan* yang tenang; vonis *berbahaya* memerlukan kesepakatan
   sinyal independen, sehingga halaman asli jarang salah ditandai.
3. Anda mendapatkan alasan dalam bahasa sederhana, bukan sekadar banner
   merah, dengan solusi satu klik: *Tinggalkan halaman ini* pada
   peringatan berbahaya, *Bawa saya ke situs asli* pada halaman peniruan
   merek — atau, jika ScamShield salah, jeda peringatan pada situs itu selama
   satu jam, satu hari, atau selamanya.

**Statistik & keterjelasan**

Setiap peringatan terbuka ke panel *Mengapa vonis ini?* yang mencantumkan
alasan pasti di baliknya — ikon merek pada domain yang salah, domain yang
mirip, kolom kata sandi yang mengirim ke host asing — alih-alih skor tanpa
penjelasan. Tab Statistik di Pengaturan menampilkan halaman yang diperiksa,
ancaman yang dihentikan, dan temuan privasi, dengan grafik aktivitas harian
yang bisa Anda alihkan antara 7 hari terakhir, 30 hari terakhir, atau total
Anda sejak pemasangan. Setiap angka dihitung dan disimpan di perangkat
Anda; tidak satu pun pernah dikirim ke mana pun.

**Privasi: apa yang dilakukan dan tidak dilakukan ScamShield**

ScamShield meminta akses ke halaman yang Anda kunjungi karena begitulah analisis
di perangkat sebenarnya membacanya — kata-kata, tata letak, formulir
login, dan ikon — pemeriksaan terjadi secara lokal, di browser Anda, bukan
di server di suatu tempat. Satu-satunya hal yang keluar dari perangkat
Anda secara default adalah unduhan file biasa: daftar ancaman publik
berisi domain penipuan yang diketahui, diambil secara berkala dari feed
open-source ScamShield agar pemblokiran tetap berfungsi segera setelah
pemasangan dan saat offline. Tidak ada apa pun tentang Anda atau aktivitas
browsing spesifik Anda yang menyertai unduhan itu. Pelaporan komunitas
yang opsional dan nonaktif secara default dapat mengirim nama host yang
dianonimkan dan sinyal risiko numerik untuk halaman yang ditandai
berbahaya — tidak pernah URL, teks halaman, atau apa pun yang Anda ketik —
dan hanya jika Anda sendiri mengaktifkannya. Pengaturan → Tentang
menunjukkan persis apa yang telah keluar dari perangkat Anda, sehingga
Anda bisa memverifikasi sendiri telemetri nol, bukan sekadar percaya kata
kami.

**Pertanyaan yang sering diajukan**

**Apa bedanya ScamShield dengan Guardio, Malwarebytes, atau Norton?**

Ekstensi-ekstensi itu memeriksa halaman yang Anda kunjungi dengan mengirim
informasi ke server mereka sendiri: Guardio dan Bitdefender TrafficLight
memindai halaman di cloud, Norton Safe Web menjalankan "Remote URL
Reputation Service" dan, menurut pengungkapannya sendiri, mengumpulkan
data pribadi, lokasi, dan riwayat web Anda, sementara Avast Online
Security mengirim URL yang Anda kunjungi bersama ID perangkat dan
informasi perangkat ke servernya. ScamShield tidak memiliki server. Setiap
pemeriksaan — membaca halaman, mencocokkan ikon merek, memindai pesan
yang ditempel — berjalan di perangkat Anda, dan tidak ada yang Anda
jelajahi, ketik, atau periksa yang dikirim ke mana pun. Daftar Guardio
sendiri juga membatasi tingkat gratisnya hanya untuk peringatan situs web;
pemblokiran real-time, perlindungan unduhan, dan pemantauan kebocoran
adalah fitur berbayar ($9,99–$34,99/bulan). Rangkaian fitur lengkap ScamShield —
pemblokiran real-time, deteksi toko palsu, perlindungan penguras wallet
kripto, pemblokiran penipuan dukungan teknis, perlindungan clipboard/
ClickFix, dasbor statistik, dan alasan berbahasa sederhana di setiap
peringatan — gratis tanpa tingkat premium.

**Apakah ScamShield benar-benar gratis? Apa jebakannya?**

Ya, dan tidak ada jebakan: tidak ada tingkat premium, tidak ada uji coba,
tidak ada "tingkatkan untuk membuka perlindungan real-time". ScamShield tidak
menjalankan server untuk menagih Anda, jadi tidak ada yang perlu dijual
lebih lanjut — seluruh produk adalah produk gratis. Itu berbeda dari
sebagian besar kategori ini: beberapa pesaing memberikan tingkat gratis
terbatas dan menagih bulanan untuk perlindungan sesungguhnya (tingkat
gratis Guardio hanya peringatan; pemblokiran penuh $9,99–$34,99/bulan),
sementara yang lain adalah ekstensi gratis yang melakukan cross-sell ke
paket keamanan berbayar. ScamShield menghidupi dirinya dengan cara lain —
dengan tetap kecil, di perangkat, dan cukup berguna sehingga Anda tetap
memasangnya, ditambah donasi opsional. Jika Anda ingin mendukung
pengembangan, ada tautan di ekstensi, tidak pernah ada paywall.

**Juga termasuk**

- Pemeriksa pesan penipuan — tempel teks SMS/WhatsApp/email apa pun untuk
  vonis instan yang sepenuhnya privat.
- Pemeriksaan hasil bersponsor di Google/Bing/DuckDuckGo — menandai iklan
  yang mengarah ke tempat lain selain situs yang ditampilkan.
- Mode ketat — satu sakelar memblokir layar penuh bahkan halaman
  "mencurigakan" dengan bahasa yang lebih sederhana, untuk anggota
  keluarga yang kurang percaya diri dengan teknologi.
- Pilih bahasa Anda: semua 20 bahasa, dapat dipilih dari popup atau
  Pengaturan, terlepas dari bahasa browser Anda.
- Ekspor/impor pengaturan dan sinkronisasi antar-perangkat opsional —
  sinkronisasi bawaan browser Anda sendiri, tetap tanpa akun atau server
  ScamShield.
- Mode gelap, riwayat perlindungan, dan tautan penyelamatan satu klik,
  konten hadiah/undian palsu yang disembunyikan.

Angka pasti, bukan kata sifat: tersedia dalam **20 bahasa** dengan
terjemahan lengkap menu, peringatan, dan pengaturan (bukan hanya daftar
toko yang diterjemahkan); sekitar **875 pengujian otomatis**; daftar
blokir berisi lebih dari 425.000 domain penipuan yang dikonfirmasi
(ditambah daftar pantauan sejuta domain), diperbarui terus-menerus dari
feed open-source; dan pemasangan di bawah 1 MB — sekitar 450 KB
terkompresi, tanpa runtime berat.

## What's new (0.10.0)

- **Hasil pencarian berisiko, ditandai sebelum Anda mengeklik.** Di
  Google, Bing, dan DuckDuckGo, titik merah atau kuning kecil kini
  menandai hasil pencarian yang domainnya sudah ada di daftar blokir,
  daftar pantauan, atau sangat mirip dengan sebuah merek — terlihat
  langsung di halaman hasil, sebelum Anda mengeklik. Hasil yang bersih
  tidak mendapat lencana sama sekali.
- **Memperingatkan sebelum nomor kartu atau kata sandi menuju situs lain.**
  Formulir nomor kartu atau login yang mengirim data ke domain yang
  berbeda dari yang sedang Anda kunjungi (dan bukan pemroses pembayaran
  atau penyedia SSO yang dikenal) kini menampilkan peringatan sebelum
  terkirim, sama seperti perlindungan formulir bocor yang sudah ada
  menangkap kolom formulir yang dikirim diam-diam.
- **Menandai domain yang benar-benar baru.** Pemeriksaan domain yang baru
  didaftarkan (di perangkat, diperbarui mingguan, model privasi yang sama
  dengan sisa daftar ancaman) menambahkan catatan kewaspadaan saat domain
  sebuah halaman baru saja didaftarkan — trik favorit situs penipuan yang
  ditutup lalu dibangun kembali dengan nama baru — dan mengendur setelah
  Anda mengunjungi domain itu dengan aman selama beberapa waktu.
- **Laporan temuan yang siap dibagikan.** Setiap peringatan berbahaya atau
  mencurigakan kini memiliki tombol "Salin laporan" yang menaruh ringkasan
  singkat berupa teks biasa — situs, vonis, alasan utama — ke clipboard
  Anda, siap ditempel ke obrolan grup atau forum untuk memperingatkan
  orang lain.
- **Disiplin anti-positif-palsu yang lebih tajam.** Sinyal untuk risiko
  hosting domain (TLD yang disalahgunakan, penyedia hosting gratis/DNS
  dinamis) tidak lagi bisa sendirian mendorong sebuah halaman sampai ke
  vonis *berbahaya* — hanya bukti yang benar-benar independen yang bisa.
  Dalam uji tolok ukur terhadap 1,09 juta URL, tingkat halaman biasa yang
  aman namun salah ditandai berbahaya turun dari 0,17% menjadi 0,05%,
  tanpa penurunan pada ancaman nyata yang terdeteksi.
- **Halaman masukan saat dicopot.** Jika Anda tetap mencopot ScamShield,
  sebuah halaman statis kecil terbuka dengan tautan untuk memberi tahu
  kami alasannya dan tautan langsung ke alur laporan positif-palsu — tanpa
  formulir, tanpa analitik, tidak ada yang dikumpulkan.

Tidak ada izin baru. Tetap `storage`, `declarativeNetRequest`, `alarms`,
dan akses http/https, persis seperti 0.3.1.
