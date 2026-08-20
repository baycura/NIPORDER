# Not In Paris — Ride (ride.notinparis.me)

Üç özellik içerir:

1. **Ride Buddy** (`/`) — sürüş arkadaşı panosu. Başlangıç noktası her zaman
   **Not In Paris** (sabit); tarih/saat/tempo/mesafe kullanıcıdan. Kapasite
   dolunca pano otomatik güncellenir (canlı/realtime), RSVP going/waitlist.
2. **Kamplar** (`/camps`) — organizasyon gezileri (örn. *Gates of Sahara*).
   Üyeler başvuru yapar (ad, telefon, deneyim, not); başvuru durumu takip
   edilir. Kamp içeriği admin tarafından yönetilir (dashboard/service role).
3. **Rent from Local** (`/rentals`) — lokal üyeler **resimsiz** bisiklet ilanı
   verir (model, kadro malzemesi, grupset, dişli oranları, kadro ölçüsü, lastik
   ebadı...). Specs herkese açık; **fiyat + telefon yalnızca üyelere** görünür
   (RLS + public view ile DB seviyesinde zorlanır).

## Ortak üyelik havuzu

Bu app, order modülüyle **aynı Supabase projesini** kullanır; dolayısıyla aynı
`customers` üye havuzunu paylaşır. Giriş yapan kişi her iki modülde de aynı
üyedir. Bağ: `ride_posts.user_id` = `auth.users.id` = `customers.auth_user_id`.

## Geliştirme

```bash
npm install
# .env içine (ya da ortam değişkeni olarak):
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...   (order modülüyle AYNI proje)
npm run dev:ride       # http://localhost:3001
```

## Build

```bash
npm run build:ride     # çıktı: ride/dist
```

## Deploy (Vercel — ride.notinparis.me)

Ayrı bir Vercel projesi oluştur, repo köküne bağla ve:

- **Build Command:** `npm run build:ride`
- **Output Directory:** `ride/dist`
- **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (order projesindekiyle aynı değerler)
- Domain olarak `ride.notinparis.me` ekle.

`ride/vercel.json` bu ayarları ve SPA rewrite'ını da içerir.

### Supabase Auth ayarı

Supabase → Authentication → URL Configuration → **Redirect URLs** listesine
`https://ride.notinparis.me/` (ve geliştirme için `http://localhost:3001/`)
ekle ki Google/e-posta girişleri geri dönebilsin.

## Veritabanı

Supabase SQL editöründe sırayla bir kez çalıştır:

1. [`../design/ride/schema.sql`](../design/ride/schema.sql) — ride_posts,
   ride_rsvps, `ride_board` view, RLS, trigger, realtime.
2. [`../design/ride/schema-camps-rentals.sql`](../design/ride/schema-camps-rentals.sql)
   — camps + camp_applications (`camp_board` view), bike_rentals +
   `bike_rentals_public` view (üyeye özel fiyat/telefon gizleme), RLS,
   örnek "Gates of Sahara" kampı seed'i.
3. [`../design/ride/schema-admin.sql`](../design/ride/schema-admin.sql)
   — `nip_is_staff()` yetki fonksiyonu, ride_posts'a `is_official` +
   `strava_url` (Social Ride), staff'a moderasyon RLS'i (sürüş/kamp/kiralık).

**Üyeye özel mantığı:** `bike_rentals` tablosu sadece giriş yapmış üyeler
tarafından okunabilir (RLS), dolayısıyla anonim kullanıcı telefon/fiyata
erişemez. `bike_rentals_public` view'i (definer) RLS'i bypass ederek herkese
**fiyat ve telefon hariç** specs'leri açar. Frontend, oturum varsa base
tabloyu, yoksa view'i sorgular.

**Kamp yönetimi:** Kamp oluşturma/başvuru onayı için client write policy yok;
admin Supabase dashboard/service role ile yönetir (başvuruları `accepted`
yapar). İstersen sonra bir admin paneli ekleriz.

## Ortak Admin (`ride/src/admin/`)

Tek admin, iki dünya: bisiklet (sürüş/kamp/kiralık) + müzik rezervasyonları.
Yetki ortak Supabase `staff` tablosundaki rol (admin/owner/manager) ile verilir
(`nip_is_staff()` RLS'i sayesinde moderasyon DB seviyesinde zorlanır).

- `/admin` (ride app içinde) — sekmeler: **Sürüşler** (iptal/sil), **Kamplar**
  (oluştur/düzenle + başvuru kabul/red/bekleme), **Kiralık** (gizle/sil),
  **Social Ride** (Not In Paris adına resmi sürüş; yayınlayınca Strava kulübüne
  yönlendirir).

**Taşınabilirlik:** `ride/src/admin/` klasörünü olduğu gibi
`reservation.notinparis.me/#admin` uygulamasına taşıyabilirsin. Beklediği
bağımlılıklar: `../lib/supabase.js` (aynı proje), `../auth/RideAuthContext.jsx`
(`{ session, isAdmin, staff }`) veya host app'in kendi admin-auth hook'u, ve
`../lib/format.js`. Strava kulüp linki `src/lib/format.js → STRAVA_CLUB_URL`.

## Yapı

```
ride/
├── index.html
├── vite.config.js
├── vercel.json
└── src/
    ├── main.jsx
    ├── RideApp.jsx
    ├── auth/RideAuthContext.jsx   # ortak customers havuzu
    ├── lib/{supabase,format,hosts}.js
    ├── components/{Layout,RideCard}.jsx
    └── pages/{Board,RideDetail,CreateRide,MyRides,Login}Page.jsx
```
