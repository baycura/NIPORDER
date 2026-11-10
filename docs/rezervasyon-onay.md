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
