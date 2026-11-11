# Rezervasyon: üyelik onaysız, rezervasyon onaylı, onay bildirimi (10.11.2026)

Sahip: "Üyelik için onayı kaldıralım ama rezervasyon için onay gereksin.
Rezervasyon onaylandıktan sonra da karşıya bildirim gitmeli."

İki proje var: **RESERVE** (rezervasyon sitesi, `reservation.notinparis.me`,
depo `baycura/NOTINPARIS`) ve **Order** (bu depo). Order paneli RESERVE'e
`lib/reserve.js` köprüsüyle bağlanır.

## Üyelik: onay yok

- Yeni hesap RESERVE'de doğrudan `approved` açılır: üye kodu (`NIP-MBR-…`),
  `approved_at`, itibar defterinde +100 güven (`handle_new_user`).
- Tablo düzeyinde de kural: `profiles.status = 'pending'` kalmaz
  (`nip_profil_koru` tetikleyicisi). Site eski sürümü açık kalsa da çalışır.
- Red / dondurma / ban kararı korunur; üye kendi durumunu açamaz.
- Sahibe Telegram: "Rezervasyon sitesine yeni üye" (bilgi; işlem gerekmez).
- Order panelinde Üyeler sekmesi onay kuyruğu değil, üye listesidir.

## Rezervasyon: onay gerekir

- Talep `pending` düşer (RLS + `nip_rez_koru` tetikleyicisi). Onay yalnız
  yönetici ya da servis: Order paneli (Rezervasyon → Onayla) ya da site paneli.
- Sahibe Telegram: "Rezervasyon talebi" (10 dakikada bir).

## Onaydan sonra müşteriye bildirim

1. **E-posta (otomatik).** Order her 10 dakikada (`nip-reserve-onay-bildirim`)
   ve panelde "Onayla"dan hemen sonra (`nip_reserve_onay_simdi`) RESERVE'den
   son 30 günün onaylananlarını çeker (`nip_onaylananlari_ver`, aynı senkron
   sırrı), `nip_reserve_onay_bildirim` tablosuna yazar ve `rez-bildirim` edge
   fonksiyonuna yollar. E-posta üyenin dilinde (tr/en/ru): etkinlik, tarih,
   kişi, kod, "Biletini aç" bağlantısı.
   Durumlar: `bekliyor`, `gonderildi`, `eposta_yok` (misafir), `hata`.
   Deneme veritabanında, gönderim anında sayılır (en çok 3). Anahtar yoksa ya
   da sağlayıcı anahtarı reddederse (`anahtar-yok`, `gonderici-yok`) fonksiyon
   denemeyi geri verir: anahtar girilince kendiliğinden gider (saatte bir
   yeniden denenir, etkinlik günü geçene kadar). Üç gönderimde de fonksiyondan
   yanıt gelmezse kayıt `cevap-yok` olur; panel "gönderilemedi" der.
   Onaydan sonra panel 4 ve 12 saniyede sonucu okur; e-posta gitmediyse
   uyarır ve "Onaylı" süzgecine geçer (WhatsApp düğmesi orada).
2. **WhatsApp (tek dokunuş).** Onaylı kartta "WhatsApp'tan haber ver": hazır
   mesajla açılır (etkinlik, tarih, isim, kişi, kod). E-postası olmayan misafir
   için tek yol budur; kart bunu söyler.
3. **Site.** Üye sitede açıksa "Biletlerim" kendiliğinden yenilenir ve QR çıkar.

E-posta anahtarı: Supabase (Order) → Edge Functions → Secrets → `BREVO_API_KEY`.
Aynı anahtar konsinye raporlarını da gönderir (`docs/konsinye.md`).

## Rezervasyon menünün içinde (11.11.2026)

Sahip: "Menü kısmından girip etkinlikleri seçtiğimizde rezervasyon butonuna
basarsan web sitesine yönlendiriyor, bu çok saçma."

Müşteri artık menüden çıkmaz. Etkinlik sekmesinde etkinliğe dokunur; form aynı
ekranda açılır (ad, telefon, kişi sayısı, not, varsa etkinlik kuralları ve onay
kutusu). Siteye giden düğme ve tek girişli geçiş (`openReservation`) kaldırıldı.
Rezervasyon sitesi çalışmaya devam eder; iki yoldan gelen talep aynı yere düşer.

**Akış**

1. Menü → `nip_rezervasyon_iste(json)` (Order). Misafir de çağırır. Ad ve
   telefon denetlenir, telefon tek biçime çevrilir (`nip_tel_duzelt`), hız
   sınırı uygulanır (istek sahibi başına dakikada 12; toplam 120; aynı kişi
   10 dakikada 5 talep). Ülke kodu yazılmayan numara yalnız Türkiye numarası
   ise kabul edilir; yurt dışı numara ülke koduyla yazılır.
2. Order, rezervasyon sistemindeki `nip_order_rezervasyon` fonksiyonunu senkron
   sırrıyla çağırır (Vault; sır tarayıcıya gitmez). Sitedeki kurallar orada
   uygulanır: üyelere özel etkinlik, güven puanı, seviye, kapasite, kuralların
   kabulü. Aynı kişi aynı etkinliğe iki kez yazılmaz. Talep "bekliyor" olur.
3. Üye girişi varsa e-posta **sunucuda**, giriş sisteminin doğruladığı adresten
   alınır (`auth.users`); istemciden ya da `customers.email` alanından alınmaz.
   Rezervasyon profili yalnız bu adresle eşleşirse bağlanır. Profili bağlı
   üyenin talebi sitede de "Biletlerim"de görünür.
4. Talebin izi `nip_rez_talepleri` tablosuna yazılır (müşteri, e-posta, dil).
5. Sahibin tarafı değişmez: talep Rezervasyon sayfasında "Bekleyen" olarak
   görünür, Telegram bildirimi eskisi gibi gelir.
6. Onaylanınca e-posta izdeki adrese, müşterinin menüde seçtiği dilde gider ve
   düğmesi siteye değil menüye bağlanır (`order.notinparis.me/menu?rez=KOD`,
   `kaynak = 'uygulama'`). E-postası olmayan misafire personel WhatsApp'tan yazar.
7. Menü → `nip_rezervasyonlarim(kodlar)`: müşteri "Rezervasyonlarım" altında
   talebinin durumunu ve kapıda göstereceği kodu görür. Üye kendi taleplerini,
   misafir telefonunda saklanan kodların taleplerini görür (kod = bilet; ad ve
   telefon dönmez). Onay bekleyen talep varken 30 saniyede bir tazelenir.
   Talep hesaba yalnız istek anında bağlanır; kodu bilen başka bir üye talebi
   kendi hesabına bağlayamaz.

**Hata kodları** (`{ ok:false, hata }`): `ad`, `telefon`, `etkinlik_yok`,
`gecti`, `uye_gerekli`, `guven_dusuk`, `seviye_yetersiz`, `dolu`, `kural`,
`zaten`, `cok_hizli`, `baglanti`. Menü her biri için üç dilde açık bir cümle
gösterir.

**Deneme** (iz bırakmadan): `nip_rezervasyon_iste` yalnız doğrudan veritabanı
oturumundan `'deneme': true` kabul eder; bütün denetimler çalışır, rezervasyon
sistemine kayıt yazılmaz, kod `DNM-` ile başlar. Tarayıcıdan gelen istek bunu
açamaz.

**İnceleme bulguları (kapatıldı, 11.11.2026):** üye, müşteri kaydındaki
e-postayı başka bir üyenin adresine çevirip onun rezervasyon profiline
bağlanabiliyordu (kimlik artık doğrulanmış oturum adresi; müşteri kaydında
e-posta personel dışında değişmez). Tek toplam sayaç bir kişinin herkesi
kilitlemesine izin veriyordu (sayaç artık istek sahibine göre). Kodu bilen üye
misafirin talebini sahiplenebiliyordu (kaldırıldı).

**KVKK:** yeni veri türü ya da amaç yok. Ad ve telefon ile "etkinlik
kayıtlarının yönetilmesi" amacı 2026-10-11 sürümünde yazılı; sürüm değişmedi.
Formun altında aydınlatma metnine bağlantı vardır.

Dosyalar: `supabase/migrations/20261111_uygulama_ici_rezervasyon.sql` (Order),
`supabase/reserve_migrations/20261111_order_rezervasyon.sql` (rezervasyon
sistemi), `src/pages/customer/CustomerMenu.jsx`, `supabase/functions/rez-bildirim`.

## Koruma (inceleme bulgusu, kapatıldı)

RESERVE'de `own_profile` ve `res_own` politikaları satırın bütün kolonlarını
üyeye açıyordu: üye kendi profilinde `is_admin = true` yazabiliyor (yönetici
oluyor), kendi rezervasyonunu `approved` yapabiliyordu. Tetikleyiciler bu
alanları yönetici / servis dışında dondurur (`nip_yetkili_mi`). Canlıda
denendi: yetki, puan, seviye, durum ve onay alanları değişmiyor; telefon,
not, puanlama gibi kendi alanları değişiyor.

## Bilinen eksik

`reservations_status_check` yalnız `pending / approved / rejected / used`
kabul ediyor; "Gelmedi" (`no_show`) yazılamıyor (sitede de hiç çalışmadı).
Order panelinde "Gelmedi" düğmesi ve süzgeci bu yüzden köprü modunda
gösterilmez (`gelmediAcik`, ReservePage.jsx). Düzeltme kısıtın değiştirilmesini
ister (sahip onayı bekliyor); kısıt genişleyince `gelmediAcik = true` yapılır.

Göçler: `supabase/reserve_migrations/20261110_uyelik_onaysiz_rez_onayli.sql`
(RESERVE), `supabase/migrations/20261110_reserve_onay_bildirimi.sql` (Order).
