<!--
  Canonical English store listing. This is the source text Task 4's
  translation agents work from to produce the other 19 locale listings.

  NOTE: two of our _locales directory names differ from the locale codes the
  Chrome Web Store developer dashboard expects when uploading a translated
  listing: `pt_BR` must be entered as `pt-BR`, and `zh_CN` must be entered as
  `zh-CN` (hyphen, not underscore, and the dashboard is case-sensitive about
  the region suffix). Every other locale code matches its directory name.
-->

## Name

ScamShield — Dolandırıcılık ve Kimlik Avı Koruması

## Short description

Cihazda dolandırıcılık ve kimlik avı koruması: uyarır, marka taklitlerini yakalar. Hiçbir şey cihazınızdan çıkmaz.

## Full description

ScamShield, bir dolandırıcılık veya kimlik avı sayfası sizi kandırmadan önce
sizi uyarır — tamamen cihazınızda. Yalnızca adres çubuğuna bakmaz: sayfanın
metnini, düzenini ve giriş formunu inceler ve bir sayfanın yanlış bir alan
adında bir markanın simgesini veya logosunu taşıdığını fark eder, böylece
yalnızca URL'ye bakan bir denetleyicinin kaçıracağı ikna edici taklitleri
yakalar. Şüpheli bir WhatsApp, SMS veya e-posta mı aldınız? Anında, gizli bir
karar için popup'a yapıştırın.

Tek bir tıklama sizi güvene geri götürür: tehlikeli bir uyarıda *Bu sayfadan
ayrıl*, marka taklidi bir sayfada *Beni gerçek siteye götür*. ScamShield
yanılırsa, bir saatliğine, yarına kadar veya her zaman için *Bu siteye
güven* diyebilir, tek dokunuşla *Hata bildir* diyebilirsiniz.

Tasarım gereği gizli: gezindiğiniz, yazdığınız veya kontrol ettiğiniz hiçbir
şey cihazınızdan çıkmaz. Tek ağ etkinliği, herkese açık tehdit listesi
dosyasını indirmek ve — yalnızca siz izin verirseniz — işaretlenmiş bir sayfa
için anonimleştirilmiş bir ana bilgisayar adı ve risk sinyali göndermektir.
Bir Ayarlar sayfası, sıfır telemetriyi kendiniz doğrulayabilmeniz için
cihazınızdan tam olarak neyin çıktığını gösterir.

Yalnızca çevrilmiş bir mağaza listesi değil, tam menü, uyarı ve ayar
çevirileri dahil 20 dilde mevcuttur.

Özellikler:
• Sade dilde nedenler içeren gerçek zamanlı kimlik avı ve dolandırıcılık
  uyarıları
• Sayfa analizi: cihaz üzerindeki bir model, henüz hiçbir listede olmayan
  yepyeni kimlik avı sayfalarını yakalamak için sayfanın metnini, düzenini
  ve giriş formlarını okur — sadece bilinen kötü URL'leri değil
• Marka taklidi tespiti: simgeler ve logolar, BAE bankaları, operatörleri ve
  devlet hizmetleri dahil (Emirates NBD, ADCB, FAB, Mashreq, e&, du, Noon,
  UAE PASS, MOHRE, Dubai Polisi…) 64 markalık bir tabloya (49'unda simge
  hash'i bulunur) göre hash ile eşleştirilir; ayrıca Latin harflerin yerine
  geçen benzer yabancı karakterlerden oluşan IDN homograf alan adları da
  tespit edilir
• Dolandırıcılık mesajı denetleyicisi: anında ve tamamen gizli bir karar
  için herhangi bir SMS/WhatsApp/e-posta metnini yapıştırın
• Şifrenizi başka bir siteye gönderen sahte giriş formlarını tespit eder
  (Google/Microsoft/Okta üzerinden tek oturum açma girişleri güvenli olarak
  tanınır)
• Gizlilik paketi: gönder'e basmadan önce bir sitenin e-posta/telefon
  bilginizi bir izleyiciye gönderdiğinde uyarır, parmak izi alan betikleri
  adlandırır ve "devam etmek için İzin Ver'e tıklayın" bildirim izni
  tuzaklarını işaretler
• Alışveriş kontrolleri: sahte geri sayımlar, sahte "sadece 2 tane kaldı"
  baskısı, hiçbir yere bağlantısı olmayan güven rozetleri, platform dışı
  ödeme istekleri ve eksik iletişim bilgileri, popup alışveriş kartında
  gösterilir
• Google/Bing/DuckDuckGo'da sponsorlu sonuç kontrolü — gösterdiği siteden
  başka bir yere giden bir reklamı işaretler
• Neredeyse kesin dolandırıcılıklar için tam ekran ara sayfa (ClickFix sahte
  CAPTCHA pano saldırıları, sahte tarayıcı güncelleme istemleri, teslimat
  ücreti kimlik avı, teknik destek korkutma sayfaları), zorunlu bir duraklama
  ve gerçek-sahte alan adı karşılaştırmasıyla birlikte; yalnızca neredeyse
  sıfır yanlış pozitifli tespitler için kullanılır
• Katı mod: kendine daha az güvenen bir aile bireyi için, "şüpheli" sayfaları
  bile daha basit ifadelerle tam ekran engelleyen tek bir düğme
• Tek tıkla kurtarma: marka taklidi sayfalarda *Beni gerçek siteye götür*,
  herhangi bir tehlikeli uyarıda *Bu sayfadan ayrıl*
• Bir siteye 1 saatliğine, yarına kadar veya her zaman güvenin — ve tek
  dokunuşla bir hata bildirin
• Bilinen dolandırıcılık alan adlarını engeller — açık kaynaklı bir
  beslemeden (OpenPhish + URLhaus, yanlış pozitiflere karşı yoğun şekilde
  filtrelenmiş) günlük olarak yenilenir
• Kripto cüzdan koruması: riskli onaylardan ve körlemesine imzalardan önce
  uyarır (EIP-7702 hesap devri ve çoklu cüzdan EIP-6963 desteği dahil);
  kurtarma ifadesi hırsızlığını engeller
• Pano ele geçirme koruması: bir site panonuza bir komut kopyaladığında
  uyarır
• Sahte ödül/hediye dolandırıcılık içeriğini gizler
• Ayarları dışa/içe aktarma ve isteğe bağlı cihazlar arası senkronizasyon
  (tarayıcınızın kendi senkronizasyonu — yine de ScamShield hesabı veya
  sunucusu yok)
• Yalnızca cihazınızda saklanan koruma geçmişi ve istatistikleri; koyu mod
• Varsayılan olarak kapalı, isteğe bağlı topluluk raporlaması — asla URL veya
  sayfa metni değil
• Daha küçük ve daha hızlı: paketten çıkarılmış ~0,6 MB, ağır bir çalışma
  zamanı yok
• %100 cihaz üzerinde analiz — takip yok, veri toplama yok

## What's new (0.6.0)

"Sadece gerçek sorunlar" sürümü — her yeni özellik, doğrulanmış gerçek dünya
dolandırıcılığı veya gizlilik kalıbını hedefler ve hiçbiri yeni bir izin
eklemez.

- Artık kimlik avı formlarının görünmez şekilde saklandığı iframe'lerin
  içini de tarıyor.
- Neredeyse kesin dolandırıcılıklar için yeni bir tam ekran ara sayfa
  seviyesi — ClickFix sahte CAPTCHA pano saldırıları, sahte tarayıcı
  güncelleme istemleri, teslimat ücreti kimlik avı (DHL/FedEx/Aramex/Royal
  Mail/Evri/Emirates Post/DPD) ve teknik destek korkutma sayfaları; zorunlu
  bir duraklama ve gerçek-sahte alan adı karşılaştırmasıyla birlikte,
  yalnızca neredeyse sıfır yanlış pozitifli tespitler için kullanılır.
- Yeni bir gizlilik paketi: veri sızdıran form uyarıları (gönder'e basmadan
  önce e-posta/telefon bilginiz düz metin veya hash'lenmiş olarak bir
  izleyiciye gönderilir), parmak izi tespiti ve bildirim izni tuzağı
  uyarıları — hepsi cihaz üzerinde.
- Yeni alışveriş kontrolleri: sahte geri sayımlar, sahte "sadece 2 tane
  kaldı" baskısı, hiçbir yere bağlantısı olmayan güven rozetleri, platform
  dışı ödeme istekleri ve eksik iletişim bilgileri, ayrıca
  Google/Bing/DuckDuckGo'da sponsorlu sonuç kontrolü.
- Katı mod: kendine daha az güvenen bir akrabanın güvende kalmasına yardımcı
  olmak için, "şüpheli" sayfaları bile daha basit ifadelerle tam ekran
  engelleyen tek bir düğme.
- Ayarları dışa/içe aktarma ve isteğe bağlı cihazlar arası senkronizasyon
  (tarayıcınızın kendi senkronizasyonu — yine de ScamShield hesabı veya
  sunucusu yok).
- IDN homograf tespiti ve cüzdan boşaltıcı yükseltmeleri (EIP-6963 çoklu
  cüzdan desteği, EIP-7702 hesap devri tespiti).
- Yalnızca mağaza listesi değil, tam menü, uyarı ve ayar çevirileriyle
  birlikte 20 dil desteği.

Yeni izin yok. 0.3.1'de olduğu gibi hâlâ yalnızca `storage`,
`declarativeNetRequest`, `alarms` ve http/https erişimi.
