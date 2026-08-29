<!-- Translated store listing (id). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Pemblokir Penipuan & Phishing: Parry

## Short description

Memblokir situs penipuan, phishing, dan toko palsu. 100% di perangkat — aktivitas browsing Anda tidak pernah keluar dari komputer.

## Full description

Tidak ada server. Parry membaca halaman yang sedang Anda buka, pesan yang
Anda tempel, dan toko tempat Anda checkout — sepenuhnya di dalam browser
Anda — dan tidak pernah mengirim apa pun yang Anda jelajahi, ketik, atau
tempel ke tempat lain.

**Mengapa Parry**

Sebagian besar ekstensi anti-penipuan mengirim data ke server mereka:
mereka mengirim halaman yang Anda kunjungi, atau hash-nya, ke server
perusahaan dan menerima vonis kembali. Parry tidak melakukan itu, karena
tidak perlu — deteksi yang sama yang akan berjalan di cloud, berjalan
secara lokal. Artinya tidak ada akun, tidak ada gangguan server yang
membuat Anda tanpa perlindungan, dan tidak ada apa pun tentang aktivitas
browsing Anda yang bisa bocor, diminta lewat somasi hukum, atau diam-diam
dijual nanti. Ini gratis, tanpa tingkat premium, tanpa uji coba, dan tanpa
"tingkatkan untuk membuka perlindungan real-time" — seluruh produk adalah
produk gratis.

**Apa yang diblokir**

- **Login bank & merek palsu** — Parry mencocokkan hash ikon dan logo
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
  membujuk Anda menempelkan perintah ke Run Windows. Parry menimpa muatan
  clipboard berbahaya dan memblokir halaman secara layar penuh sebelum
  bisa dijalankan.
- **Formulir bocor** — memperingatkan begitu sebuah situs mengirim email
  atau nomor telepon yang Anda ketik ke pelacak, *sebelum* Anda menekan
  kirim, dan secara terpisah menyebutkan skrip fingerprinting serta
  jebakan izin notifikasi "klik Izinkan untuk melanjutkan".

**Cara kerjanya**

1. Parry membaca halaman itu sendiri, di perangkat Anda — kata-kata,
   tata letak, formulir login, dan ikonnya — pada saat Anda membukanya,
   atau pesan yang Anda tempel ke popup untuk pemeriksaan pesan penipuan.
2. Model di perangkat dan seperangkat aturan menilai apa yang ditemukan.
   Satu sinyal lemah tidak pernah menghasilkan lebih dari catatan
   *mencurigakan* yang tenang; vonis *berbahaya* memerlukan kesepakatan
   sinyal independen, sehingga halaman asli jarang salah ditandai.
3. Anda mendapatkan alasan dalam bahasa sederhana, bukan sekadar banner
   merah, dengan solusi satu klik: *Tinggalkan halaman ini* pada
   peringatan berbahaya, *Bawa saya ke situs asli* pada halaman peniruan
   merek — atau, jika Parry salah, jeda peringatan pada situs itu selama
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

**Privasi: apa yang dilakukan dan tidak dilakukan Parry**

Parry meminta akses ke halaman yang Anda kunjungi karena begitulah analisis
di perangkat sebenarnya membacanya — kata-kata, tata letak, formulir
login, dan ikon — pemeriksaan terjadi secara lokal, di browser Anda, bukan
di server di suatu tempat. Satu-satunya hal yang keluar dari perangkat
Anda secara default adalah unduhan file biasa: daftar ancaman publik
berisi domain penipuan yang diketahui, diambil secara berkala dari feed
open-source Parry agar pemblokiran tetap berfungsi segera setelah
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

**Apa bedanya Parry dengan Guardio, Malwarebytes, atau Norton?**

Ekstensi-ekstensi itu memeriksa halaman yang Anda kunjungi dengan mengirim
informasi ke server mereka sendiri: Guardio dan Bitdefender TrafficLight
memindai halaman di cloud, Norton Safe Web menjalankan "Remote URL
Reputation Service" dan, menurut pengungkapannya sendiri, mengumpulkan
data pribadi, lokasi, dan riwayat web Anda, sementara Avast Online
Security mengirim URL yang Anda kunjungi bersama ID perangkat dan
informasi perangkat ke servernya. Parry tidak memiliki server. Setiap
pemeriksaan — membaca halaman, mencocokkan ikon merek, memindai pesan
yang ditempel — berjalan di perangkat Anda, dan tidak ada yang Anda
jelajahi, ketik, atau periksa yang dikirim ke mana pun. Daftar Guardio
sendiri juga membatasi tingkat gratisnya hanya untuk peringatan situs web;
pemblokiran real-time, perlindungan unduhan, dan pemantauan kebocoran
adalah fitur berbayar ($9,99–$34,99/bulan). Rangkaian fitur lengkap Parry —
pemblokiran real-time, deteksi toko palsu, perlindungan penguras wallet
kripto, pemblokiran penipuan dukungan teknis, perlindungan clipboard/
ClickFix, dasbor statistik, dan alasan berbahasa sederhana di setiap
peringatan — gratis tanpa tingkat premium.

**Apakah Parry benar-benar gratis? Apa jebakannya?**

Ya, dan tidak ada jebakan: tidak ada tingkat premium, tidak ada uji coba,
tidak ada "tingkatkan untuk membuka perlindungan real-time". Parry tidak
menjalankan server untuk menagih Anda, jadi tidak ada yang perlu dijual
lebih lanjut — seluruh produk adalah produk gratis. Itu berbeda dari
sebagian besar kategori ini: beberapa pesaing memberikan tingkat gratis
terbatas dan menagih bulanan untuk perlindungan sesungguhnya (tingkat
gratis Guardio hanya peringatan; pemblokiran penuh $9,99–$34,99/bulan),
sementara yang lain adalah ekstensi gratis yang melakukan cross-sell ke
paket keamanan berbayar. Parry menghidupi dirinya dengan cara lain —
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
  Parry.
- Mode gelap, riwayat perlindungan, dan tautan penyelamatan satu klik,
  konten hadiah/undian palsu yang disembunyikan.

Angka pasti, bukan kata sifat: tersedia dalam **20 bahasa** dengan
terjemahan lengkap menu, peringatan, dan pengaturan (bukan hanya daftar
toko yang diterjemahkan); sekitar **630 pengujian otomatis**; daftar
blokir berisi ribuan domain penipuan, diperbarui terus-menerus dari feed
open-source; dan pemasangan di bawah 1 MB — sekitar 450 KB terkompresi,
tanpa runtime berat.

## What's new (0.8.0)

- **ScamShield kini menjadi Parry.** Dua produk yang sudah sangat dikenal
  memakai nama "ScamShield" — pemerintah Singapura menjalankan aplikasi
  anti-penipuan nasionalnya sendiri bernama ScamShield, dan Scam Shield
  dari T-Mobile adalah layanan pemblokiran penipuan operator AS yang
  banyak digunakan — sehingga ekstensi ini berganti nama untuk menghindari
  kebingungan dengan keduanya. Tidak ada yang berubah dalam cara
  melindungi Anda, apa yang dikumpulkan (tidak ada), atau pengaturan Anda.
- **Popup yang dirancang ulang:** menu *Jeda perlindungan* berbatas waktu
  (1 jam, 1 hari, atau Selalu) menggantikan kata-kata kepercayaan yang
  lama, penghitung utama menunjukkan sekilas ancaman yang dihentikan sejak
  pemasangan dan minggu ini, setiap peringatan terbuka ke panel *Mengapa
  vonis ini?* dengan alasan pastinya, dan footer berputar yang lebih rapi
  bergantian antara pengingat privasi, permintaan ulasan yang layak, dan
  tautan dukungan.
- **Ikon baru** — tanda tangkisan sederhana yang lebih cocok dengan nama
  baru.

Tidak ada izin baru. Tetap `storage`, `declarativeNetRequest`, `alarms`,
dan akses http/https, persis seperti 0.3.1.
