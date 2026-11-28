# Not In Paris — İşletme Profili & Çalışma Notları

> Bu dosya, sahibi daha iyi anlamak ve kararları tutarlı vermek için tutulan
> yaşayan bir nottur. Yeni öğrendiklerimizi buraya ekleriz.

## Sahip / karar verici
- **Rol:** İşletme sahibi, **uzaktan takip ediyor** (mekanda sürekli değil).
- **Çıkarım:** Sisteme uzaktan görünürlük şart — gün sonu özeti, anormallik
  uyarıları sahibe de gitmeli. Personel akışı kendi kendine yetmeli.
- **Beklenti:** Hepsi — kâr/zarar netliği, kaçak/israf kontrolü, operasyon
  hızı & kolaylık, büyüme/karar verisi.
- **Çalışma tarzı tercihi:** "Bir sürü sor, hiç sormayı bırakma." → varsaymak
  yerine sor, iş ve sahip hakkında öğrendikçe daha isabetli kur.

## Kadro (2026-08-07 itibarıyla — sürekli değişebilir, koda gömme!)
- **Omer (sahip, admin):** tam yetki, Telegram bağlı.
- **Ceren (eş, `viewer`/Gözlemci):** ÇALIŞMIYOR, personel değil. Satış/rapor,
  mutfağa ödenecek, stok ve ürün/fiyatları GÖREBİLİR; sipariş/kasa/vardiya
  ekranlarına girmez. Sabah özeti bağlanırsa ona da gider (admin+viewer hedefli).
- **Çalışanlar:** Mustafa (manager), Fatih (manager), Burcu (waiter).
- **Tolgacan:** ayrıldı → staff kaydı `is_active=false` (silinmedi, geçmiş raporlar için).
- **Part-time hafta sonu servis ekibi:** kişiler sürekli değişiyor, sabit değil.
  Bu yüzden TEK ORTAK HESAP: `parttime@notinparis.me` (rol `parttime`) — sadece
  Masalar + Sipariş + Kasa görür; mutfak/stok/vardiya/görevler kapalı.
  Kişi bazlı takip gerekirse Personel sayfasından gerçek hesap açılır.
- Pasif (`is_active=false`) personel GİRİŞ YAPAMAZ (AuthContext engeli) ve
  hiçbir Telegram bildirimi almaz.

## Vizyon: self-servis + üyelik (2026-08-08)
- **Self-servis hedefi:** Garson çağırma butonu İSTENMİYOR. Müşteri siparişini
  menüden kendi verir, hazır olunca kendisi alır, (ileride) ödemeyi de kendisi
  yapar. Online ödeme için PSP (iyzico/PayTR vb.) anlaşması gerekecek — henüz yok.
  **Sahip kararı (11.11.2026): müşteri siparişini kasadan alır.** Menü hiçbir
  durumda "garson masana getirecek" demez; sepet, hazır ekranı ve bildirim aynı
  sözü verir ("hazır olunca haber vereceğiz; kasadan alırsın").
- **Üyelik sistemi (KURULDU):** Müşteri menüde Google ile giriş yapar →
  `customers` kaydına bağlanır. Üyeler sayfasından kişiye özel **ürün bazlı
  SABİT ₺ indirim** tanımlanır (`member_discounts`); üye menüde indirimli fiyatı
  "ÜYE" rozetiyle görür. Siparişe `customer_id` yazılır → müşteri karnesi
  (sipariş sıklığı, harcama, favoriler) Üyeler sayfasında.
- **Amaç:** Eş-dost indirimlerini kayıt altına almak + müşteri alışkanlık verisi.
- **reservation.notinparis.me = Shopify** (doğrulandı: bağlı mağaza NOT IN PARIS
  / notinparis.me, Basic plan, TRY). Katalog: Pas Normal Studios (bisiklet giyim,
  ~200 ürün — QR menüde GÖSTERİLMEZ) + "Not in Paris" koleksiyonu (11 NIP merch).
- **QR menü = vitrin (KURULDU, 5 alt sekme):** Menü 🍽 | Etkinlik 🎟 | Sürüş 🚴 |
  Shop 👕 | Blog 📰 (YouTube alt bar benzeri — sahibin ekran görüntüsüyle onaylandı).
  - Etkinlik/Sürüş: Shopify koleksiyonlarından (`etkinlikler`, `surusler` — bizim
    açtığımız manuel koleksiyonlar) `shopify-feed` edge fn ile çekilir (public
    products.json, token yok, 10 dk cache). Etkinlik sekmesinde "Rezervasyon yap"
    → reservation.notinparis.me. Kartlar notinparis.me ürün sayfasına gider.
  - Shop: Shopify'dan ÇEKİLMEZ (sahip kararı) — `posts` tablosu (kind='urun'),
    tişört hikayeleri/fotoğrafları; satış yok, "kasadan alabilirsin" notu.
  - Blog: `posts` (kind='blog') — haberler + Fethiye tavsiyeleri. Amaç: sipariş
    hazırlanırken müşteri uygulamada kalsın, hazır bildirimi şansı artsın.
  - İçerik yönetimi: Yönetim > "Vitrin & Blog" sayfası (foto: product-images
    bucket, posts/ klasörü).
  - Sipariş sonrası "Beklerken göz at" → sekmelerde gezinirken takip arkada sürer,
    sarı "Siparişin hazırlanıyor" çubuğu görünür, hazır olunca büyük 🔔 ekranı döner.

## İşletme yapısı
- **İki store, TEK veritabanı** (Supabase proje: "Order" / gbbxxcduuwdmvfayxzeg):
  - `Not In Paris` (slug: paris) — ana işletme/bar.
  - `Not In Paris Doner` (slug: doner) — **ayrı işletme/mutfak**, kendi ayrı
    uygulaması var ama aynı DB'yi kullanıyor (`kitchen_orders`, `kitchen_menu`).
- **Mutfak ürünü mantığı:** NIP kendi menüsünden döner (mutfak) ürünlerini de
  satar. Bir ürünün `kitchen_destination_store_id = doner` ise, o ürünün NIP'te
  satılan cirosu **ay sonu mutfağa ödenir** (bkz. "Mutfağa Ödenecek" sayfası).

## Para kuralları (sahip kararları, 2026-11-11)
- **Ciro = tahsil edilen.** Puanla ödenen kısım (`orders.points_used`) kasaya
  girmez; cirodan düşülür ve ayrı satırda gösterilir. "Bugün" ve "Gün Özeti"
  aynı kuralı kullanır, iki ekran aynı rakamı verir. Kıyas "dün bu saatte".
- **₺0 hesap ikram olarak kapanır.** Ürünlerinin tamamı ikram olan hesapta
  Kart/Nakit yerine "İkram olarak kapat" görünür. Para yazılmaz, hesap `paid`
  olur, toplam ₺0 kalır. **İkram eden zorunlu:** ikram işaretli kalemin
  `treated_by` alanı boş olamaz (kısıt). Veren, işlemi yapan ya da sahiptir.
  İz `ikram_izi` tablosunda: kim işaretledi, kim geri aldı, hesabı kim
  kapattı (oturumdan okunur, personel değiştiremez). Sahip "İndirim ve ikram"
  sayfasının İkramlar görünümünde görür. Göç: `20261111_ikram_kapat.sql`.
- **Ödenmiş hesapta kalem düğmeleri** şimdiki gibi kalır (karar: değişmez).
- **İkram sayımı:** parayla ödenmiş adet ikram değildir. Kasadaki "Kim ne
  ödüyor?" listesinde ₺0'lık satır (ikram, %100 indirim) seçilemez. Kısmen
  ödenmiş satırın kalan adedi ikram edilecekse: satırdaki "Taşı" ile yeni
  hesaba alınır, orada ikram edilir. Göç: `20261112_ikram_odenen_adet.sql`.

## Üyelik çağrısı ve happy hour (sahip kararları, 2026-11-12)
- **Amaç: üye sayısını artırmak.** Üye olmayan kişi, happy hour ürününün
  altında üye fiyatını ve saatini HER ZAMAN görür (saat dışında da):
  "Üyelere özel · 09:00–22:00 arası ₺200". Pencere başka gündeyse gün adı
  eklenir ("yarın", "Pazar"). Dokununca üyelik penceresi açılır. Herkese
  açık happy hour'da (`hh_sadece_uye = false`) gösterilmez.
  Kod: `lib/happyHour.js` → `happyHourPlan`, `CustomerMenu` → `uyeCagrisi`.
- **Üye "Üye fiyatı" yazısını görür (sahip, 2026-11-26: "birada yazdığı gibi
  alt açıklamada yazsın; üye fiyatı yazsın, happy hour yazmasın").** Üyenin
  kartında üstü çizili liste fiyatı ve üye fiyatı yazar; altında düğme
  olmayan satır: "Üye fiyatı · bugün tüm gün ₺150" ya da "Üye fiyatı ·
  09:00–22:00 arası ₺200". Saat yalnız fiyat o an bir kuraldan geliyorsa
  yazar; yalnız anlık indirim varsa "Üye fiyatı · ₺180". Üyelere özel
  düzende "HAPPY HOUR" sözü hiçbir yerde yazmaz. Kişiye özel fiyat kazanırsa
  satır çıkmaz, "SANA ÖZEL" etiketi kalır. Üye olmayanın gördüğü "Üyelere
  özel · …" yazısı değişmedi. Kod: `CustomerMenu` → `uyeSatiri`.
- **Kahve üye fiyatı (sahip, 2026-11-26):** Filtre Kahve, Espresso, Americano
  liste ₺180, üyeye **₺150**, her gün tüm gün (kurallar "Üye fiyatı — kahve
  …" ve "Üye fiyatı — filtre …"). Pazar 08:00–09:30 Filtre üyeye ₺120
  ("Cycling Club") aynen durur; bu yüzden Pazar günü Filtre üç ayrı kuraldır
  (00:00–08:00, 08:00–09:30, 09:30–23:59), üst üste binmez.
- **Bud Fıçı 50 cl (liste ₺280; eski adı Efes Fıçı 0.5L) üye fiyatı:**
  - Pazartesi–Cumartesi 09:00–22:00: **₺200** (kural "Üye fiyatı — Pzt–Cmt
    09:00–22:00"). 22:00'den sonra herkes liste fiyatı öder.
  - Pazar **tüm gün: ₺150** (kural "Üye fiyatı — Pazar tüm gün", 00:00–23:59).
    Sahip 12.11'de iki kez doğruladı: "Pazar full gün". 09:00–22:00 yalnız
    Pazartesi–Cumartesi içindir.
  - "Happy week" ve "Happy Sunday" (₺160) kuralları KAPALI kalır (sahip: "ilk
    seçenek iyi"). Eski gece kuralları ("Üye fiyatı — HH dışı …") kapatıldı,
    silinmedi.
- **"Tüm gün" kuralı 00:00–23:59 yazılır** (panelin saat kutusu 24:00 kabul
  etmez). Bitişi 23:59 olan kural gece yarısına kadar sayılır (son dakika
  dahil); menüde saat yerine "tüm gün" yazar: "Üyelere özel · Pazar tüm gün
  ₺150". Aynı ürün için iki kural AYNI ANDA açık olmamalı: hangisinin
  kazanacağı belli değildir. Günleri ya da saatleri ayır.
- **Başlıktaki rozet:** üyelere özel düzende "ÜYE FİYATI" yazar ve Menü
  sekmesinde üye fiyatıyla satılan bir ürün varken yalnız üyeye çıkar
  (kartlardaki satırla aynı koşul; Shop rafı sayılmaz, parti gecesinde yalnız
  parti menüsü sayılır). Kahve üye fiyatı tüm gün olduğu için rozet, menüde
  o kahveler göründüğü sürece üyede görünür. "HAPPY HOUR" yalnız happy hour
  herkese açıksa (`hh_sadece_uye = false`) yazar; o düzende eski kural
  geçerlidir.
- Gece yarısında biten pencere menüde "24:00" diye yazar (bitişi 23:59 ya da
  00:00 yazılan kural, ertesi günü seçili olmayan gece kuralı): "Üyelere
  özel · 09:30–24:00 arası ₺150". Başlangıçtaki "00:00" aynen kalır.
- Kurallar panelden yönetilir: Panel → Happy Hour.

## Personel ek yetkisi (sahip, 2026-11-28)
- **Rol değişmeden tek bir iş için izin.** `staff.yetkiler` (text[]) tutar;
  yalnız admin yazar (Panel → Personel → Düzenle → "EK YETKİ"). Personel
  kendi satırını değiştiremez (`admin_write_staff`).
- **`menu_fiyat` = ürün ekleme + fiyat değiştirme.** Bu yetkiyi alan kişi
  Menü'de (sağ üstteki ad düğmesi → MENÜ & ÜRÜNLER) "Ürün Ekle · Fiyat"
  kartını görür. Sayfa onda DAR açılır: "+ Yeni Ürün" ve ürüne dokununca
  yalnız fiyat kutusu. Kategori ekleme/düzenleme, sıralama, silme ve ürünün
  diğer alanları kapalıdır. Fiyat kaydı veritabanına yalnız `price` (EUR
  üründe `price_eur`) gönderir.
- **Yeni ürün formu onda kısadır.** Konsinye, anlık indirim, happy hour,
  mağaza seçimi, "bu ürünü kim yapıyor" ve "NIP Kitchen envanteri" gizlidir;
  varsayılan değerler yazılır. Fiyatsız (₺0) ürün ekleyemez.
- **Yeni ürünü eklerken reçetesini de girer** (sahip: "yeni ürün eklerken
  reçete de girebilsin"). Formdaki "Reçete gir" kutusu: var olan malzemeyi
  arar ("sut" yazınca "Süt" çıkar), seçer, miktarını yazar; sarf malzemeler
  tek dokunuş. Parti bardağı gibi sarflarda "Sadece parti gecesi düşsün"
  kutusu vardır; malzeme başka reçetede öyleyse işaretli gelir. Satırlar
  ürünle birlikte kaydedilir. Aynı kutu yöneticinin yeni ürün formunda da
  vardır.
- **Listede olmayan malzemeyi açar; maliyetini ve stoğunu da girer** (sahip
  28.11: "Evet yazabilsin, maliyet ve stok da girebilsin"). Aramada tam aynı
  adla malzeme yoksa "yeni malzeme aç" düğmesi çıkar ("Limon Suyu" varken
  "Limon" açılabilir). Kişi paket diliyle yazar: nasıl ölçülür (ml / g /
  adet), bir şişe ya da paket ne kadar, bir şişenin fiyatı (KDV dahil), elde
  kaç şişe var, stok rafı. Birim maliyeti ve stoğu kod hesaplar (700 ml şişe
  ₺2.800, elde 2,5 şişe → ml başı ₺4, litresi ₺4.000, stok 1.750 ml).
  Malzeme hemen kaydedilir ve Stok Yönetimi'nde görünür. Reçetedeki miktarı
  boş gelir; kişi yazar.
- **Yeni malzemede korumalar** (`lib/recete.js`):
  - Aynı adla ikinci malzeme açılmaz; harf ve aksan farkı sayılmaz ("sut" =
    "Süt", "Jagermeister" = "Jägermeister"). Kayıttan önce liste yeniden
    okunur; başka cihaz aynı malzemeyi açtıysa o seçilir.
  - Benzer malzeme varsa formda gösterilir ("vodka" yazana "Absolut Votka");
    dokununca var olan reçeteye eklenir.
  - Kuşkulu rakam bir kez sorulur: şişe 150 ml'den, paket 50 g'dan küçükse
    (70 cl için "70" yazılmış olabilir) ya da litre / kilo karşılığı ₺10.000'i
    aşarsa. Aynı rakamla ikinci dokunuş kaydeder.
  - Fıçı (20.000 ml ve üstü) bu formdan açılmaz: fire payı girilir; Stok
    Yönetimi'nden açılır.
  - Raf "Sarf Malzeme" seçilirse malzeme sarf sayılır.
- **Hâlâ kapalı:** var olan malzemelerin maliyeti görünmez; var olan
  malzemenin maliyeti, stoğu ve mevcut ürünün reçetesi değiştirilemez
  (Stok Yönetimi ve Reçeteler sayfaları yöneticide). Alış fiyatı alanı
  bilerek açıktır: hazır alınan ürünün maliyeti başka yerde tutulmaz.
- İlk verilen kişi: Tuğçe (part-time). Rolü ve alt barı aynı kaldı.
- Yönetici rollerinde ek yetki boş yazılır (zaten hepsini yaparlar).
  Gözlemci (viewer) rolüne ek yetki verilmez: düğme çıkmaz, adres açılmaz.
- **Sınır uygulama ekranlarındadır.** `products` tablosunun veritabanı
  kuralı (`staff_write_products`) role bakmaz: mağazanın her personeli ürün
  satırına yazabilir. Bunu role göre daraltmak ayrı bir iştir; yapılırsa
  satış sırasındaki stok düşümleri bozulmasın diye sakin saatte yapılmalı.
- Kod: `AuthContext` (`yetkiler`, `yetkiVar`), `App.jsx` (`PrivateRoute
  yetki=`), `lib/panelNav.js` (`yetki`, `darLabel`), `MenuMgmtPage` (`dar`),
  `components/UrunReceteGirisi.jsx`, `lib/recete.js` (`yeniMalzemeKaydi`).
  Göç: `20261128_personel_ek_yetki.sql`.

## Kahve ve maliyet kararları (sahip, 2026-11-26)
- **Kahve liste fiyatları değişmez.** Cappuccino ve Latte ₺200 kalır (₺220
  önerisi: "dokunma"). Filtre, Espresso, Americano liste ₺180, üyeye ₺150.
  Tekrar sorma; sahip kendisi açarsa konuşulur.
- **Seçime göre malzeme düşme yapılmaz** (yulaf sütü, şurup, soda, laktozsuz
  süt seçilince ayrı malzeme düşmesi): "gerek yok". Reçete ürünün ana
  malzemesini düşer.
- **Filtre dozu 15 g** (60 g çekirdekten 4 fincan). Süt: Cappuccino, Latte,
  Flat White, Cortado dördü de 250 ml.
- **Maliyet yazımı:** birim maliyet KDV dahil yazılır (satır tutarı +
  o satırın KDV'si, alınan adede ya da ml'ye bölünür). Fıçı: 30 L fıçının
  27.500 ml'si satılır sayılır. Depozito maliyet değildir.
- **Glenlivet 12** maliyeti bilerek boş: sahip konuyu beklemeye aldı.

## Rezervasyon: "Gelmedi" (sahip onayı, 2026-11-12)
- Panelde onaylı rezervasyonda **"Gelmedi"** düğmesi var (iki dokunuş). Üyede
  güven −40, gelmedi sayısı +1, seri 0. Misafirde yalnız işaret.
- **"Geldi — geri al":** yanlış işaret ya da geç gelen misafir için. İşaret
  kalkar, rezervasyon yeniden "Onaylı" olur, güven +40 geri verilir (seri
  geri gelmez).
- İşaretli rezervasyonun kodu kapıda okutulursa "ONAYSIZ · Gelmedi" yazar;
  giriş için önce geri alınır.
- **Teknik:** RESERVE veritabanı `no_show` durumunu kabul etmez
  (`reservations_status_check`) ve kısıt silinmeden değiştirilemez. İşaret
  `reservations.no_show_at` sütununda tutulur; durum `approved` kalır. Üye bu
  sütunu değiştiremez (`nip_rez_koru` tetiği). Yerel modda durum doğrudan
  `no_show` olur. Göç: `supabase/reserve_migrations/20261112_gelmedi_isareti.sql`.
- İşaret ve güven puanı TEK sunucu işleminde yazılır: RESERVE
  `nip_gelmedi(p_rez, p_geri)` (yalnız yönetici). Düşülen gerçek miktar itibar
  defterine yazılır (`no_show` / `no_show_geri`); geri almada o kadar geri
  verilir (taban 0'a takılan düşüş fazladan puan kazandırmaz). "Gelmedi"
  işaretli rezervasyona giriş hiçbir istemciden yazılamaz
  (`nip_rez_gelmedi_koru` tetiği). Göç: `20261112_gelmedi_fonksiyon.sql`.

## Tek uygulama ve adres (sahip kararları, 2026-11-12)
Sahip: "İki ayrı uygulama yerine rezervasyon uygulamasını direkt Order içinde
yeniden yapılandırsak. Order adresini de daha kapsayıcı club.notinparis.me
olarak değiştirelim."
- **Rezervasyon Order'a taşınıyor.** Ayrı site (reservation.notinparis.me) ve
  ayrı veritabanı (RESERVE) yerine her şey Order'da olur.
- **İkinci puan sistemi YOK.** Güven puanı ve kulüp kademeleri taşınmaz
  ("Zaten sipariş kısmında puan var, ikinci bir puanlama kafa karıştırır").
  Personel üyede yalnız "kaç kez geldi / kaç kez gelmedi" görür.
- **Taşınmayan özellikler:** afiş, davet kodu, bekleme listesi, DJ puanlama.
- **İki adres de çalışır:** club.notinparis.me (yeni ad) ve order.notinparis.me
  (eski). Eski adres SÜREKLİ açık kalır: basılı QR kodlar ve gönderilmiş
  bağlantılar onu gösterir. Yönlendirme yok; ikisi aynı uygulamayı sunar.
- **Adres kuralı (kod):** uygulama hangi adresten açıldıysa ürettiği bağlantı
  ve QR o adresi taşır (`src/lib/appUrl.js`, `appHostSec`). Sunucu metinleri
  (e-posta, Telegram) tek `APP_URL` gizli değişkenini okur; yoksa eski adres.
  Online ödeme dönüşü müşterinin geldiği adrese yapılır (`paytr`, yalnız bu
  iki adres kabul edilir).
- **Tarayıcıda adrese bağlı kalanlar:** giriş, sepet, sipariş takibi, misafir
  rezervasyon kodları, sayım taslakları, ana ekran kısayolu. Yeni adreste bir
  kez yeniden giriş gerekir. Veritabanındaki hiçbir şey etkilenmez.
- ⏳ **Sahip adımları (kod bunlar olmadan da zararsız):**
  1. Vercel → niporder → Settings → Domains → `club.notinparis.me` ekle.
  2. Alan adı DNS'i: `club` için CNAME → Vercel'in o ekranda gösterdiği değer
     (genelde `cname.vercel-dns.com`).
  Bu ikisini Claude yapamıyor: Vercel bağlantısı proje ayarını değiştiremiyor
  (403), DNS sağlayıcısına bağlantı yok.
- ✅ **Supabase giriş ayarı GEREKMEZ (13.11).** Ölçüm: Supabase club adresine
  geri dönmüyor, order altındaki her adresi kabul ediyor. Club'da başlayan
  giriş order üzerinden döner ve dönüş bilgisi adresin içinde taşınır
  (`/menu?donus=club.notinparis.me`); order sayfayı club'a taşır, kendisinde
  oturum açmaz (`src/lib/girisDonus.js`, `index.html` hızlı yol). E-postadaki
  bağlantı başka tarayıcıda açılsa da çalışır.
- ✅ `paytr` yüklendi (v6, 12.11): dönüş adresi müşterinin geldiği adres.
  ⏳ `rez-bildirim` ve `konsinye-mail` depoda yeni; canlıdaki sürüm bugün AYNI
  sonucu veriyor, bir sonraki değişiklikte yüklenir.
- **Rezervasyon taşıma, Aşama 1 (sunucu, 13.11):**
  `20261113_rezervasyon_order_icinde.sql`. Order kendi başına rezervasyon
  alabilir ama bugünkü akış DEĞİŞMEDİ: geçiş tek anahtara bağlı
  (`nip_rez_ayar.yerel`, yalnız SQL oturumu çevirir; `durdu` = geçiş molası).
  Personel işlemleri sunucu fonksiyonudur: `nip_rez_onayla`, `nip_rez_reddet`,
  `nip_rez_giris`, `nip_rez_gelmedi`, `nip_rez_engel`. Üyede yalnız iki sayaç
  (`customers.rez_geldi`, `rez_gelmedi`) ve rezervasyon engeli (`rez_engelli`)
  var; bunları yalnız sunucu yazar. Tabloya doğrudan talep yazma kapalı.
  Sıradaki: veri kopyası, yeni KVKK sürümü, geçiş.
- **Rezervasyon taşıma, Aşama 1 (arayüz, 17.11):** panel ve menü kaynağı
  ÇALIŞIRKEN sunucuya sorar (`src/lib/rezKaynak.js` → `nip_rez_yerel_mi`);
  build sabiti değil. Anahtar kapalıyken her şey eskisi gibidir.
  - Panel (`ReservePage`): anahtar açıkken onay / ret / gelmedi / kapı girişi /
    üye engeli tek sunucu çağrısıdır; tabloya doğrudan yazılmaz. Üye kartında
    iki sayı görünür (kaç kez geldi, kaç kez gelmedi); güven puanı ve seviye
    yok. Onaylı kayıt ayrı düğmeyle iptal edilir (koltuk boşalır). Başka günün
    rezervasyonu kapıda önce sorulur. Kaynak okunamazsa liste çizilmez
    (eski değerle yanlış veritabanına yazılmasın).
  - Menü: talep her modda `nip_rezervasyon_iste` ile gider (doğrudan tabloya
    yazma kodu kaldırıldı). Etkinlik listesi etkin kaynaktan okunur; sayfa
    açıkken anahtar çevrilirse liste yeni kaynaktan yeniden okunur.
  - Etkinlik formunda yeni alanlar: müşteriye not, İngilizce ve Rusça kurallar.
  - Profil "temel" (rezervasyon sitesi olmayan işletme) aynı yolu kullanır:
    o veritabanında göç dosyasından sonra anahtar açılır.
- **Rezervasyon taşıma, Aşama 2 (hazırlık, 18.11):**
  `20261118_rezervasyon_gecis_hazirligi.sql`. Bugünkü akış DEĞİŞMEZ.
  - Veri kopyası (yalnız SQL oturumu): `select nip_rez_gecis_kopyala();` sayar;
    `(true)` yalnız PARTİLERİ yazar (kişisel veri yok, deneme kopyası);
    `(true, true)` rezervasyonları ve üyelerin geldi / gelmedi sayılarını da
    yazar (kişisel veri: geçiş günü, yeni KVKK sürümüyle birlikte). Kimlikler
    ve kodlar korunur. Anahtar kapalıyken eski veritabanı ana kaynaktır: tekrar
    çalıştırınca fark kapanır, orada artık olmayan parti arşive, açık
    rezervasyon iptale düşer. Anahtar açıkken partilere dokunulmaz; yalnız
    burada olmayan bekleyen talep eklenir (siteden gelen rezervasyon). Eski
    veritabanı tarafı: `supabase/reserve_migrations/20261118_gecis_verisi.sql`.
  - Etkinliğin adı, tarihi ya da saati değişince o etkinliğin AÇIK
    rezervasyonları (bekleyen, onaylı) da değişir; kapı ve "Rezervasyonlarım"
    bu kopyalara bakar. Bitmiş kayıtlar (girdi, gelmedi, ret) değişmez.
  - `reservations` tablosuna doğrudan yazma kapalı; listeyi yalnız yönetici
    okur. Aktif personel kodla kapıda giriş yapar.
- **Web sitesi (notinparis.me, Shopify teması) eski rezervasyon veritabanına
  DOĞRUDAN bağlı (18.11 bulgusu):** üye girişi, parti listesi (Line up),
  siteden rezervasyon (RSVP), bisiklet panosu, sürüş panosu, başvurular.
  Dosya: temada `assets/nip-supabase.js`. Yani o veritabanı web sitesinin de
  arka ucudur; kapatılamaz. Claude temayı okuyabiliyor, yazamıyor.
- **Web sitesi köprüsü (sahip kararı 18.11: "köprü kur, site aynı kalsın"):**
  `20261119_site_koprusu.sql` (Order) +
  `supabase/reserve_migrations/20261119_site_koprusu.sql` (eski veritabanı).
  Geçişten sonra partileri ve rezervasyon durumunu Order yönetir; site
  değişmez. Anahtar kapalıyken köprü hiçbir şey yapmaz. Tur 5 dakikada birdir
  (`nip_rez_site_esitle`).
  - Order → eski veritabanı: parti listesi (panelde parti kaydedilince hemen)
    ve rezervasyon durumu. Afişe dokunulmaz; afiş hâlâ rezervasyon sitesinin
    panelinden yüklenir.
  - Eski veritabanı → Order: siteden gelen yeni talep ("Bekleyen" görünür,
    Telegram gider); bekleyen talepte üyenin düzelttiği alanlar (kişi sayısı,
    ad, telefon, not); üyenin sitede kaldırdığı talep (Order'da "İptal
    edildi" olur, onaylıysa yeri boşalır). Yalnız `site_kaydi` işaretli
    kayıtlar karşılaştırılır; menüden açılan yerel talebe dokunulmaz.
  - Geçiş işareti açıkken eski veritabanında rezervasyon durumunu ve parti
    bilgisini tarayıcıdan kimse değiştiremez (rezervasyon sitesinin yönetim
    paneli hata verir: "Order paneline taşındı"). Parti satırı orada
    kaldırılamaz (kilit: `nip_gecis_parti_kilidi`; hata metninde
    `parti_order_panelinden_kaldirilir` görünür). Parti Order panelinden
    kaldırılır. Üye yeni talep açabilir.
  - Arıza: tur art arda 3 kez arıza verirse (15 dakika) yöneticilere Telegram
    gider; düzelince bir kez haber verir. Kayıt: `nip_reserve_bildirim_log`
    ("site koprusu: …"). Siteden gelen bir talep alınamazsa (ad 2 harften
    kısa, kod boş) AYRI bir uyarı gelir; bu arıza sayılmaz (ayrı sayaç:
    `nip_rez_ayar.kopru_talep`). Parti günü geçince kayıt sayılmaz. Çekme
    adımı çalışmayan turda bu sayaç değişmez.
  - Tur boyunca anahtar satırı kilitlidir: iki tur üst üste binmez; geçiş ve
    geri dönüş çalışan turu bekler.
  - Eski veritabanında parti kilitleri her gece 00:50'de (UTC) ayrıca
    tazelenir (`nip-gecis-kilit`); köprü günlerce dursa da gece arşivi
    takılmaz.
  - Sitedeki seviye ve güven puanı geçişten sonra GÜNCELLENMEZ (sahip kararı
    12.11: tek puan sistemi Order'ın harcama puanı).
- **Geçiş (Aşama 3) tek çağrıdır, yalnız SQL oturumu:**
  `select nip_rez_gecis_yap(true);` Sırası: eski veritabanında geçiş işareti
  açılır (oradaki paneller donar) → son veri kopyası (kişisel veri dahil) →
  anahtar açılır → parti listesi ve durumlar yollanır. Kopya ya da anahtar
  adımı hata verirse Order geri sarılır ve işaret yeniden kapatılır. İki
  veritabanı tek işlem değildir: çağrı `begin … rollback` içinde
  ÇALIŞTIRILMAZ (işaret açık kalır). Şüpheli durumda aynı çağrı yeniden
  çalıştırılır; zararsızdır. Anahtar açıldıktan sonraki yollama hatası geçişi
  geri sarmaz; 5 dakikalık tur yeniden dener. Geri dönüş:
  `select nip_rez_gecis_yap(false);` Son parti listesi ve durumlar
  yollanamazsa geri dönüş YAPILMAZ: hata verir, Order değişmez, anahtar açık
  kalır. Eski veritabanında işaret kapalı çıkarsa çağrı işareti yeniden açar,
  son kararları yollar, sonra kapatır. Çağrı bu arada hata verirse eski
  veritabanında işaret açık ve parti listesi yazılmış kalabilir; bu, geçişten
  sonraki olağan durumdur (köprü turu da aynısını yapar). Köprü bozukken yine
  de dönmek için:
  `select nip_rez_gecis_yap(false, true);` Bu çağrı anahtarı her durumda
  kapatır. Eski veritabanındaki işaret kapatılamadıysa yanıtta `uyari` döner;
  işaret o zaman eski veritabanında (SQL oturumu) elle kapatılır:
  `select nip_order_gecis_yaz((select decrypted_secret from vault.decrypted_secrets where name = 'order_sync_sir'), false);`
  Kapanana kadar oradaki panellerde onay / red / parti düzenleme kilitlidir.
  Eski veritabanındaki `nip_order_gecis_yaz(…, false)` tek başına geri dönüş
  değildir; anahtar açıkken köprü işareti 5 dakikada yeniden açar. Menüden
  açılmış yerel talepler eski panelde görünmez. İkinci bir geçişte yerel
  talepler, üye sayaçları ve sayaç işaretleri korunur.
  Geçişten ÖNCE aynı gün: yeni KVKK sürümü (rezervasyon ve katılım geçmişi;
  tr / en / ru) yayınlanır.
- **Göç dosyaları yerel PostgreSQL'de denenir** (container'da sunucu var):
  canlıdaki bağımlı nesnelerin taklidi + önceki göçler + yeni dosya iki kez
  uygulanır, senaryolar orada koşar; sonra ana dala girer ve Göçüş işi
  canlıya uygular.
- ⏳ Altı veritabanı fonksiyonu Telegram mesajına eski adresi yazıyor
  (çalışır; yalnız yazı). Geçiş günü tek göçle değişecek.

## Partiler
- **Çar / Cum / Cmt, 22:00 sonrası.**
- **Giriş ücretsiz** — parti geliri tamamen bar/masa satışından.
- **Çıkarım:** Parti geliri raporu, sipariş zaman damgasından türetilir
  (ayrı kapı/bilet modülü gerekmez). Günlük / aylık / yıllık parti cirosu.

## Cihazlar
- Ortak tablet (kasa/mutfak) + her personelin kendi telefonu.
- Bildirim: hem ortak tablete hem kişisel telefonlara. iOS için PWA kurulumu
  gerekebilir (web push).

## Yol haritası (sırayla hepsi)
- **Faz 0 — Sadeleşme (kısmen tamam):** döner "mutfak ürünü" işareti netleşti,
  "Mutfağa Ödenecek" raporu, mağaza ID eşleştirme fix, stores.js sabitleri.
- **Faz 1 — Maliyet & fatura zekâsı:** anormal fiyat uyarısı, maliyet geçmişi,
  canlı kâr marjı. (Mevcut fatura+reçete+ingredients altyapısı üzerine.)
- **Faz 2 — Kazanç & rapor motoru:** kategori (kahve/alkol/raf), personel ve
  parti kazanç raporları + gün/ay/yıl aralıkları. (Personel raporu için önce
  siparişe "açan/kapatan personel" alanı eklenecek — şu an yok.)
- **Faz 3 — Kâr/zarar & aksiyon paneli:** net kâr + "şunu düzelt" önerileri.
- **Kesişen:** personel için aşırı kolay kullanım + telefon bildirimleri.

## Bildirim kararları
- **Sahip kanalı: Telegram.** Gün sonu özeti + uyarılar Telegram botundan.
  - Uyarı içerikleri: (1) **her sabah 09:00'da önceki günün özeti**
    (ciro, tahmini kâr, mutfağa ödenecek, en çok satan), (2) **anormal
    maliyet/fiyat artışı** — fatura kalemi önceki alıma göre **%10+** pahalıysa.
  - Özet zamanı: sabah 09:00 (Türkiye saati, UTC+3 → cron UTC 06:00), önceki gün.
  - Anormal fiyat eşiği: **%10** (hassas; sonradan ayarlanabilir).
- **Personel bildirimi de TELEGRAM** (kullanıcı önerisi — web push yerine):
  - Web push'un zahmeti yok (service worker/VAPID/iOS PWA gerekmez), her telefonda çalışır.
  - (1) **Yeni sipariş → mutfak/hazırlık**, (2) **Sipariş hazır → garson**.
  - **Yönlendirme: KİŞİYE ÖZEL DM** (grup değil). Her personel bota bağlanır,
    bildirim role/kişiye göre gider.
  - **Kayıt akışı:** uygulamada kişiye özel "Telegram'a bağlan" butonu →
    `t.me/BaycuraBot?start=<kod>` → webhook chat_id'yi o personele bağlar.
  - **Kime gider? "O an vardiyada olan" kişiler.** Sabit çizelge/izin YOK;
    personelin "Vardiyaya Gir/Çık" dokunuşu canlı gerçektir:
    - izin/gelmeyen → vardiya yok → bildirim yok
    - değişken saat / aynı anda çok kişi → hepsi otomatik doğru çalışır
    - Bildirim koşulu: bugünkü shift status=active **ve** staff.telegram_chat_id dolu.
  - **`orders.staff_id`** alanı ZATEN VAR ama sipariş açılışında doldurulmuyor →
    doldurulacak (hazır→garson yönlendirmesi + personel satış raporu). Migration gerekmez.
  - **Vardiya çıkışı eklenecek:** shifts.status active→done + checked_out_at;
    unutanlar için gece otomatik kapanış (cron).
  - shifts tablosu: staff_id, date, checked_in_at, status (active). "VARDIYAYA GİR" var, çıkış YOK.
- **Bot:** @BaycuraBot (t.me/BaycuraBot). Token repoya ASLA yazılmaz; Supabase
  tarafında saklanır (edge secret veya service-role-only tablo).
- **Mimari (planlanan):** Tek Supabase Edge Function `telegram`:
  - Telegram webhook alıcısı → gelen mesajdan chat_id öğrenip `telegram_chats`'e yazar.
  - Gönderim: sahip DM (özet/uyarı) + personel grubu (sipariş bildirimleri).
  - Gün-sonu özeti: pg_cron 06:00 UTC (=09:00 TR) → fonksiyonu çağırır.
  - Yeni sipariş / hazır: orders/order_items üzerinde DB webhook/trigger → fonksiyon.
  - Anormal fiyat: fatura kaydında client `functions.invoke` ile fonksiyonu tetikler.
- ⚠️ Not: Bu geliştirme sandbox'ı `api.telegram.org`'a çıkamıyor (ağ politikası).
  Gönderimi Supabase Edge Function yapar (o erişebilir); testi Supabase logları +
  tarayıcı üzerinden yaparız.

## KURULUM DURUMU (2026-08-07)
- ✅ bot_config (kilitli, RLS policy'siz) — token + webhook_secret DB'de.
- ✅ staff.telegram_chat_id + shifts.checked_out_at alanları eklendi.
- ✅ Edge fn `telegram` v3 deploy (setup/send/webhook/notify/daily_summary; verify_jwt=false, secret korumalı).
- ✅ Telegram webhook kuruldu ("Webhook was set") — pg_net ile DB'den.
- ✅ DB trigger'ları (migration `20260807_telegram_triggers_and_cron.sql`): order_items
  insert/update → items_sent; kitchen_status→ready → items_ready. Hedefleme edge fn'de:
  shift status=active + telegram_chat_id dolu (kitchen rolü öncelikli; hazır → siparişi açan).
- ✅ Siparişe staff_id yazılıyor; Vardiyadan Çık butonu; Vardiyam'da Telegram bağlama butonu.
- ✅ pg_cron: `nip-close-shifts` 03:00 UTC (06:00 TR, açık vardiyaları kapatır) +
  `nip-daily-summary` 06:00 UTC (09:00 TR, admin'lere gün-sonu özeti). İkisi de aktif.
- ✅ Omer /start ile bağlandı; test mesajı + canlı özet denemesi gönderildi (2026-08-07).
- ⏳ Diğer personel (Mustafa, Fatih, Burcu) henüz Telegram'a bağlanmadı
  (Vardiyam > 'Telegram bildirimlerini aç'). Ceren de bağlanırsa sabah özeti alır.
- ⏳ %10 fiyat uyarısının Telegram'a bağlanması — sıradaki.

## Teknik notlar
- Stack: React + Vite + Supabase, Vercel'de yayında.
- ⚠️ Supabase ücretsiz katman ~1 hafta işlem olmazsa projeyi duraklatıyor
  (uygulama o zaman açılmıyor). En az bir kez bu yüzden takıldık.
- orders.staff_id artık sipariş açılışında dolduruluyor (personel raporu hazır olacak).

## GÜNCELLEME (2026-08-08) — Güvenlik denetimi + Fatura OCR
- ✅ Güvenlik sıkılaştırma (migration `20260808_security_hardening_audit.sql`):
  - KRİTİK açık kapatıldı: `admin_create_staff_with_auth` artık yalnız aktif admin/manager/owner
    çağırabilir (eskiden HİÇ kontrol yoktu — Google ile giren herhangi bir müşteri admin açabilirdi).
    admin/owner/super_admin rolünü yalnız admin oluşturabilir.
  - `admin_set_user_password`: admin de dahil, aktiflik kontrolü eklendi.
  - `is_staff()` artık `is_active=true` şartı arıyor; pasif personel yazamaz.
  - Storage policy'leri eklendi (product-images herkese okuma, yazma personel;
    invoices yalnız personel) — daha önce policy yoktu, yükleme sessizce bozuktu.
  - 4 view `security_invoker=true`; yardımcı fonksiyonlara `search_path` sabitlendi;
    tetikleyici fonksiyonlardan anon/authenticated EXECUTE yetkisi alındı.
  - Çift Telegram bildirimi düzeltildi: v1 trigger'lar düşürüldü
    (migration `20260808_drop_v1_telegram_triggers.sql`).
  - ⏳ Kullanıcı aksiyonu: Supabase Dashboard > Auth > Leaked password protection AÇ.
- ✅ Fatura OCR (edge fn `invoice-ocr` v1, verify_jwt=true):
  - Faturalar > Yeni Fatura > fotoğraf seç > "🤖 Fotoğraftan doldur (AI)".
  - Fotoğraf SAKLANMAZ (istemci ~1600px JPEG'e küçültüp gönderir); Claude vision
    (claude-opus-5, structured output) tedarikçi/tarih/kalemleri çıkarır,
    mevcut hammaddelerle bulanık eşleştirme yapılır, satırlar önceden doldurulur.
  - Yalnız aktif admin/manager/owner çağırabilir; anahtar: env `ANTHROPIC_API_KEY`
    ya da bot_config `anthropic_api_key`. ⏳ Kullanıcı aksiyonu: console.anthropic.com'dan
    API anahtarı alıp bot_config'e eklemek (yoksa buton "AI anahtarı tanımlı değil" der).
- ✅ Tolgacan hesabı kapatıldı (is_active=false, şifre rastgele, oturumlar silindi).
- ✅ Canlı uçtan uca test: sipariş → mutfak bildirimi → hazır bildirimi (Telegram'a ulaştı).

## GÜNCELLEME (2026-08-08, akşam) — Tek QR + Web Push + Anormal fiyat uyarısı
- ✅ Tek QR self-servis: order.notinparis.me/menu — isim yazılmadan "Sipariş Ver" çalışmaz.
- ✅ Web push (edge fn `web-push` v1 + `push_subscriptions` tablosu + `wp_items_ready`
  trigger'ı): sipariş hazır olunca müşterinin KİLİTLİ telefonuna da bildirim gider.
  VAPID anahtarları bot_config'te; abonelik sipariş başına, gönderim sonrası silinir;
  gece 06:30 TR eski abonelik temizliği (nip-clean-push-subs cron).
  ⚠️ iPhone: yalnız ana ekrana eklenmiş (PWA) halde çalışır; Android Chrome direkt.
- ✅ PWA: manifest.json + sw.js + ikonlar (Coolvetica "N"); uygulama ana ekrana eklenebilir.
- ✅ Anormal fiyat artışı (%10+) artık sahibe Telegram'dan gidiyor (telegram fn v5,
  `price_alert` rotası — personel JWT korumalı; admin+viewer bağlı olanlara).
- ✅ Google "rate us" linki gerçek işletme linkiyle değişti (share.google/AA07eYRVqpAoNFL8P).
- ⏳ iyzico online ödeme: kullanıcının sanal POS'u var; API Anahtarı + Güvenlik Anahtarı
  (merchant.iyzipay.com > Ayarlar > API) gelince Checkout Form entegrasyonu yapılacak.
- ⏳ Anthropic API anahtarı bekleniyor (fatura OCR); Pazartesi gerçek faturayla test.

## GÜNCELLEME (2026-08-08, gece) — PayTR online ödeme + menü senkronu
- ✅ Basılı menü dijitale işlendi (Menemen 0→250 düzeltildi!); tüm menü TR/EN/RU;
  süt +50 yalnız sütlü kahvelerde, şurup +20 yalnız sütlü kahvelerde; 5'li shot 1000.
- ✅ PayTR iFrame API (edge fn `paytr` v1, mağaza no 390494, anahtarlar bot_config'te):
  müşteri sipariş sonrası "💳 Kart ile Öde" → PayTR güvenli sayfası → callback hash
  doğrulanır → sipariş otomatik "paid" (payments.method='online') ve kasadan düşer.
  Aç/kapa: Ayarlar > Online Ödeme (app_settings.online_payment_enabled). Canlı token
  testi başarılı (gerçek 1 TL'lik token alındı, test siparişi silindi).
  ⏳ Kullanıcı aksiyonu: PayTR panel > Destek & Kurulum > Ayarlar > Bildirim URL:
  https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/paytr?action=callback
  Sonrasında 1 TL'lik gerçek kart ödemesiyle uçtan uca test edilecek.
