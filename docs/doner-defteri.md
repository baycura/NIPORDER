# Döner Defteri

Not in Paris Döner ayrı bir limited şirkettir. Döner Defteri bu şirketin basit
defteridir: gider ve faturalar (kim ödedi), gün sonu tezgah satışı, ürün
maliyeti ve günlük adet, borçlular, günlük/haftalık/aylık özet.

Kafe uygulamasından (order.notinparis.me) bağımsız çalışır:

| | Kafe (NIPORDER) | Döner Defteri |
|---|---|---|
| Site | order.notinparis.me | doner.notinparis.me (Vercel projesi `doner-defteri`) |
| Vercel Root Directory | `isletme/kafe` yok; kök | `isletme/doner` (+ "Include source files outside of the Root Directory") |
| Giriş | `staff` tablosu (AuthContext) | `doner_kullanicilar` (admin / personel, onay bekler) |
| Veri | tüm tablolar | yalnız `doner_*` + `kitchen_menu` (okuma) |
| Supabase | aynı proje (`gbbxxcduuwdmvfayxzeg`) | aynı proje, ayrı `storageKey` (`nip-doner-auth`) |

Döner kullanıcıları `staff` tablosunda **yoktur**; kafe tablolarına RLS geçit
vermez. Kafe personeli de `doner_*` tablolarını göremez. İki tarafı da yalnız
listede olan ortaklar görür (Ömer, Ceren; Tolga kayıt olunca onaylanır).

## Sunucu (`supabase/migrations/20261020_doner_defter.sql`)

| Nesne | Görev |
|---|---|
| `doner_kullanicilar` | kim girebilir; `rol` admin/personel, `aktif` false = onay bekler |
| `doner_giderler` | fatura/gider: tarih, kategori, tutar, KDV, tedarikçi, fatura no, **odeyen** (kasa ya da ortak adı), yöntem |
| `doner_gunsonu` | gün başına nakit + kart (tezgah) |
| `doner_urun_maliyet` | `kitchen_menu` ürününe birim maliyet |
| `doner_satislar` | gün + ürün + adet (tezgahtan satılan; QR ve kafe kendiliğinden) |
| `doner_borclular` | veresiye defteri, ödendi işareti |
| `doner_uye()` / `doner_admin()` | RLS kapıları (aktif üye / aktif admin) |
| `doner_kayit_iste(p_ad)` | giriş yapan kişi kendini listeye yazar (aktif=false); admin onaylar |
| `doner_ozet(p_bas, p_bit)` | tezgah + QR (`kitchen_orders`, kafeden gelmeyenler) + kafe konsinye (hakediş kuralı: ikramda liste fiyatı) geliri; gider kategori/ödeyen; maliyet; açık borç; günlük seri. DEFINER, önce `doner_uye()` kontrolü |

RLS: aktif üye okur, ekler, düzeltir; **silme yalnız admin**; `anon` hiçbir
şeye erişemez. `doner_kullanicilar`: onay bekleyen yalnız kendini görür; yazma
yalnız admin; insert yalnız RPC ile.

## Kullanıcı akışı

1. Yeni kişi sitede **Kayıt ol** (ad, e-posta, şifre). E-posta onayı açıksa
   gelen bağlantıya dokunur.
2. Girince "Onay bekliyor" görür. Bir admin **Kullanıcılar** ekranından
   "Personel olarak onayla" ya da "Yönetici" der.
3. Personel: gider, gün sonu, adet, borç girer ve düzeltir; silemez.
   Yönetici: ek olarak siler, kullanıcı onaylar/çıkarır.

## Kurulum notları

- Vercel: proje `doner-defteri`, repo `baycura/NIPORDER`, Root Directory
  `isletme/doner`, `sourceFilesOutsideRootDirectory` açık. `vercel.json`
  repo kökünde `npm ci` + `vite build --config isletme/doner/vite.config.js`.
- `isletme/doner/vite.config.js` `VITE_PROFIL=doner` verir ve ortak
  `index.html`'in girişini `src/doner/main.jsx` yapar; kafe sayfaları pakete
  girmez (≈60 KB uygulama kodu).
- Supabase Auth > URL Configuration > **Redirect URLs** listesine
  `https://doner.notinparis.me/**` (ve geçici Vercel adresi) eklenmeli; yoksa
  şifre sıfırlama ve e-posta onayı bağlantıları kafe sitesine düşer.
- DNS: `doner` CNAME → `cname.vercel-dns.com` (notinparis.me DNS'i Vercel'de
  değil).
