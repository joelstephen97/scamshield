<!-- Translated store listing (tr). Canonical source: en.md. CWS dashboard locale codes: pt_BR -> pt-BR, zh_CN -> zh-CN. -->

## Name

Dolandırıcılık ve Kimlik Avı Engelleyici: Parry

## Short description

Dolandırıcılık sitelerini, kimlik avını ve sahte mağazaları engeller. %100 cihaz üzerinde — geziniz asla bilgisayarınızdan çıkmaz.

## Full description

Sunucu yoktur. Parry bulunduğunuz sayfayı, yapıştırdığınız mesajı ve
ödeme yaptığınız mağazayı — tamamen tarayıcınızın içinde — okur ve
gezindiğiniz, yazdığınız veya yapıştırdığınız hiçbir şeyi başka bir yere
asla göndermez.

**Neden Parry**

Dolandırıcılık engelleyici uzantıların çoğu eve telefon eder: ziyaret
ettiğiniz sayfaları veya bunların bir özetini bir şirketin sunucularına
gönderir ve karşılığında bir karar alır. Parry bunu yapmaz, çünkü buna
gerek yoktur — bulutta çalışacak aynı tespit bunun yerine yerel olarak
çalışır. Bu, hesap olmaması, sizi korumasız bırakacak bir sunucu kesintisi
olmaması ve geziniz hakkında sızabilecek, mahkeme celbiyle istenebilecek
veya daha sonra sessizce satılabilecek hiçbir şey olmaması anlamına gelir.
Ücretsizdir, premium katmanı yoktur, denemesi yoktur ve "gerçek zamanlı
korumanın kilidini açmak için yükseltin" yoktur — ürünün tamamı ücretsiz
üründür.

**Neleri engeller**

- **Sahte banka ve marka girişleri** — Parry, sayfanın simgesini ve
  logosunu 64 markadan oluşan bir tabloyla (BAE bankaları, telekom
  operatörleri ve devlet hizmetleri dahil, PayPal, Microsoft, Google ve
  daha fazlasının yanı sıra) özet karşılaştırması yapar ve bir markayı
  benzer görünen yabancı karakterlerle yazan IDN homograf alan adlarını
  tespit eder. Doğru logoyu yanlış alan adında taşıyan sahte bir giriş,
  adresin kendisi tanıdık görünse bile yakalanır.
- **Sahte mağazalar** — sahte geri sayım sayaçları, sahte "sadece 2 kaldı"
  baskısı, hotlink ile bağlanan güven rozetleri, platform dışı ödeme
  talepleri ve eksik iletişim bilgileri, siz ödeme yapmadan önce açılır
  pencere alışveriş kartında gösterilir.
- **Kripto cüzdan boşaltıcıları** — riskli onaylardan ve kör imzalardan
  önce, EIP-7702 hesap devri ve EIP-6963 çoklu cüzdan istekleri dahil,
  uyarır ve kurtarma cümlesi hırsızlık girişimlerini doğrudan engeller.
- **Teknik destek dolandırıcılığı** — "bilgisayarınız virüslü, şimdi bu
  numarayı arayın" sayfaları için önce sayfanın ekran kilidi ve Geri
  düğmesi tuzaklarını etkisiz hale getiren tek tıklamalı bir çıkışla
  birlikte tam ekran engelleme.
- **ClickFix ve pano saldırıları** — 2025'in en hızlı büyüyen kötü amaçlı
  yazılım hilesi: sizi Windows Çalıştır'a bir komut yapıştırmaya ikna eden
  sahte bir "insan olduğunuzu doğrulayın" CAPTCHA'sı. Parry kötü amaçlı
  pano içeriğinin üzerine yazar ve çalıştırılabilmeden önce sayfayı tam
  ekran olarak engeller.
- **Sızdıran formlar** — bir site, siz gönder'e basmadan *önce* yazdığınız
  e-postayı veya telefonu bir izleyiciye gönderdiği anda uyarır ve ayrıca
  parmak izi çıkarma betiklerini ve "devam etmek için İzin Ver'e
  tıklayın" bildirim izni tuzaklarını adlandırır.

**Nasıl çalışır**

1. Parry, sayfayı açtığınız anda cihazınızda sayfanın kendisini — metnini,
   düzenini, giriş formlarını ve simgelerini — veya bir dolandırıcılık
   mesajı kontrolü için açılır pencereye yapıştırdığınız mesajı okur.
2. Cihaz üzerinde çalışan bir model ve bir kural kümesi bulduklarını
   puanlar. Tek başına zayıf bir sinyal hiçbir zaman sessiz bir *şüpheli*
   notundan fazlasını üretmez; bir *tehlikeli* kararı bağımsız sinyallerin
   uyuşmasını gerektirir, bu yüzden gerçek sayfalar nadiren yanlışlıkla
   işaretlenir.
3. Sadece kırmızı bir bant değil, sade bir dille bir gerekçe alırsınız,
   tek tıklamalı bir çözümle birlikte: tehlikeli bir uyarıda *Bu sayfadan
   çık*, bir marka taklidi sayfasında *Beni gerçek siteye götür* — veya
   Parry yanılmışsa, o sitedeki uyarıyı bir saat, bir gün veya süresiz
   olarak duraklatın.

**İstatistikler ve açıklanabilirlik**

Her uyarı, açıklanmamış bir puan yerine, arkasındaki tam nedenleri
listeleyen bir *Bu karar neden verildi?* paneline açılır — yanlış alan
adındaki bir marka simgesi, benzer görünen bir alan adı, yabancı bir ana
bilgisayara gönderim yapan bir parola alanı. Ayarlar'daki İstatistikler
sekmesi, kontrol edilen sayfaları, durdurulan tehditleri ve gizlilik
bulgularını, son 7 gün, son 30 gün veya kurulumdan bu yana toplamlarınız
arasında geçiş yapabileceğiniz günlük etkinlik grafiğiyle gösterir. Her
sayı cihazınızda hesaplanır ve saklanır; hiçbiri hiçbir zaman herhangi bir
yere gönderilmez.

**Gizlilik: Parry ne yapar, ne yapmaz**

Parry, ziyaret ettiğiniz sayfalara erişim ister, çünkü cihaz üzerindeki
analiz onları gerçekten böyle okur — metni, düzeni, giriş formlarını ve
simgeleri — kontrol yerel olarak, tarayıcınızda gerçekleşir, bir yerdeki
bir sunucuda değil. Varsayılan olarak cihazınızdan çıkan tek şey, düz bir
dosya indirmedir: bilinen dolandırıcılık alan adlarının herkese açık tehdit
listesi, kurulumdan hemen sonra ve çevrimdışıyken de engellemenin çalışması
için Parry'nin açık kaynaklı akışından periyodik olarak alınır. Sizinle
veya belirli geziniz ile ilgili hiçbir şey bu indirmeye eşlik etmez.
Varsayılan olarak kapalı, isteğe bağlı topluluk raporlaması, tehlikeli
olarak işaretlenen bir sayfa için anonimleştirilmiş bir ana bilgisayar adı
ve sayısal bir risk sinyali gönderebilir — asla bir URL, sayfa metni veya
yazdığınız herhangi bir şey — ve yalnızca bunu kendiniz açarsanız. Ayarlar
→ Hakkında, cihazınızdan tam olarak neyin çıktığını gösterir, böylece
sözümüze güvenmek yerine sıfır telemetriyi kendiniz doğrulayabilirsiniz.

**Sıkça Sorulan Sorular**

**Parry, Guardio, Malwarebytes veya Norton'dan nasıl farklıdır?**

Bu uzantılar, ziyaret ettiğiniz sayfaları kendi sunucularına bilgi
göndererek kontrol eder: Guardio ve Bitdefender TrafficLight sayfaları
bulutta tarar, Norton Safe Web bir "Uzak URL İtibar Hizmeti" çalıştırır ve
kendi açıklamasına göre kişisel verilerinizi, konumunuzu ve web geçmişinizi
toplar, Avast Online Security ise ziyaret ettiğiniz URL'leri bir cihaz
kimliği ve cihaz bilgileriyle birlikte sunucularına gönderir. Parry'nin
sunucusu yoktur. Her kontrol — sayfayı okumak, marka simgelerini
eşleştirmek, yapıştırılan bir mesajı taramak — cihazınızda çalışır ve
gezindiğiniz, yazdığınız veya kontrol ettiğiniz hiçbir şey herhangi bir
yere gönderilmez. Guardio'nun kendi listesi de ücretsiz katmanını yalnızca
web sitesi uyarılarıyla sınırlar; gerçek zamanlı engelleme, indirme
koruması ve sızıntı izleme ücretli özelliklerdir (9,99–34,99 $/ay). Parry'nin
tam özellik seti — gerçek zamanlı engelleme, sahte mağaza tespiti, kripto
cüzdan boşaltıcı koruması, teknik destek dolandırıcılığı engellemesi, pano/
ClickFix koruması, bir istatistik panosu ve her uyarıda sade bir dille
gerekçe — premium katmanı olmadan ücretsizdir.

**Parry gerçekten ücretsiz mi? Ne şart var?**

Evet ve hiçbir şart yok: premium katman yok, deneme yok, "gerçek zamanlı
korumanın kilidini açmak için yükseltin" yok. Parry, sizi faturalandıracak
bir sunucu çalıştırmaz, bu yüzden üst satacak bir şey yoktur — ürünün
tamamı ücretsiz üründür. Bu, kategorideki çoğu üründen farklı bir
yaklaşımdır: birçok rakip sınırlı bir ücretsiz katman verir ve gerçek
korumaları için aylık ücret alır (Guardio'nun ücretsiz katmanı sadece
uyarılardır; tam engelleme 9,99–34,99 $/ay tutar), diğerleri ise ücretli
bir güvenlik paketine çapraz satış yapan ücretsiz uzantılardır. Parry
kendini farklı şekilde ayakta tutar — küçük, cihaz üzerinde ve kurulu
tutmanızı sağlayacak kadar faydalı kalarak, artı isteğe bağlı bağışlar.
Geliştirmeyi desteklemek isterseniz, uzantıda bir bağlantı vardır, asla bir
ödeme duvarı yoktur.

**Ayrıca içinde**

- Dolandırıcılık mesajı denetleyicisi — anında ve tamamen özel bir karar
  için herhangi bir SMS/WhatsApp/e-posta metnini yapıştırın.
- Google/Bing/DuckDuckGo'da sponsorlu sonuç kontrolü — gösterilenden
  başka bir yere giden bir reklamı işaretler.
- Sıkı mod — tek bir anahtar, teknolojiye daha az güvenen bir aile üyesi
  için daha basit bir dille "şüpheli" sayfaları bile tam ekran engeller.
- Dilinizi seçin: tarayıcınızın dilinden bağımsız olarak açılır pencereden
  veya ayarlardan seçilebilen 20 dilin tamamı.
- Ayarları dışa/içe aktarma ve isteğe bağlı cihazlar arası senkronizasyon —
  tarayıcınızın kendi senkronizasyonu, hâlâ Parry hesabı veya sunucusu
  olmadan.
- Karanlık mod, koruma geçmişi ve tek tıkla kurtarma bağlantıları, gizlenmiş
  sahte ödül/çekiliş içeriği.

Sıfatlar değil, somut sayılar: menü, uyarı ve ayar çevirilerinin tamamıyla
**20 dilde** kullanılabilir (yalnızca çevrilmiş bir mağaza listesi değil);
yaklaşık **630 otomatik test**; açık kaynaklı bir akıştan sürekli
güncellenen, binlerce dolandırıcılık alan adından oluşan bir engelleme
listesi; ve 1 MB'ın altında bir kurulum — sıkıştırılmış yaklaşık 450 KB,
ağır bir çalışma zamanı olmadan.

## What's new (0.8.0)

- **ScamShield artık Parry oldu.** Zaten iki çok tanınmış ürün "ScamShield"
  adını kullanıyor — Singapur hükümeti ScamShield adlı kendi ulusal
  dolandırıcılık karşıtı uygulamasını işletiyor ve T-Mobile'ın Scam Shield'i
  yaygın olarak kullanılan bir ABD operatör dolandırıcılık engelleme
  hizmeti — bu yüzden uzantı, her ikisiyle de karışıklığı önlemek için adını
  değiştirdi. Sizi nasıl koruduğu, ne topladığı (hiçbir şey) veya
  ayarlarınız konusunda hiçbir şey değişmedi.
- **Yeniden tasarlanan popup:** zaman sınırlı bir *Korumayı duraklat* menüsü
  (1 saat, 1 gün veya Her zaman) eski güven ifadesinin yerini alıyor, öne
  çıkan sayaçlar kurulumdan bu yana ve bu hafta durdurulan tehditleri bir
  bakışta gösteriyor, her uyarı arkasındaki tam nedenlerle bir *Bu karar
  neden verildi?* paneline açılıyor ve daha temiz, dönen bir alt bilgi bir
  gizlilik hatırlatması, hak edilmiş bir değerlendirme isteği ve bir destek
  bağlantısı arasında geçiş yapıyor.
- **Yeni simge** — yeni isme daha uygun basit bir savuşturma işareti.

Yeni izin yok. Hâlâ 0.3.1'deki gibi tam olarak `storage`,
`declarativeNetRequest`, `alarms` ve http/https erişimi.
