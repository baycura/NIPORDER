# Not In Paris — Ride (ride.notinparis.me)

Bisiklet sürüş arkadaşı bulma modülü. Üyeler sürüş ilanı açar, diğerleri
"katılıyorum" der; kapasite dolunca pano otomatik günceller (canlı).

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

Şema: [`../design/ride/schema.sql`](../design/ride/schema.sql). Supabase SQL
editöründe bir kez çalıştır (tablolar, `ride_board` view, RLS, trigger,
realtime).

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
