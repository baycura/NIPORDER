# NIP Wrapped 2026 — Ürün brief’i

> Amaç: Spotify Wrapped benzeri, üye bazlı yıl sonu özeti.
> Marka: Not In Paris — kafe + sürüş + parti.
> Bu dosya karar / tasarım / uygulama için yaşayan brief’tir.
> Sahip (Ömer) + Claude buradan fikir geliştirebilir; kod yazmadan önce
> aşağıdaki “Açık sorular”ı netleştirmek gerekir.

---

## 1. Vizyon (tek cümle)

Üye, yılın NIP özetini 6–8 paylaşılabilir kart (ileride video) olarak görür;
sürüş + sipariş + gece ritmi bir arada anlatılır; zayıf veride “sürüşe katıl”
CTA’sı ile gelecek yılın içeriği beslenir.

## 2. Neden şimdi

- Üyelik, sipariş (`customer_id`), puan/seviye, sürüş (`ride_posts` /
  `ride_rsvps`) zaten Order’da.
- Paylaşılabilir an → organik reach (Instagram Story).
- Sürüş RSVP’yi güçlendiren doğal bahane.

## 3. Kapsam (önerilen fazlar)

### Faz 0 — Veri sözleşmesi (koddan önce)

- Yıl penceresi: örn. `2026-01-01` … `2026-12-31` (TR günü).
- “Sürüşe katıldı” tanımı: RSVP `going` mi, yoksa personel onayı mı?
- Parti / gece eşlemesi: sert etkinlik ID mi, saat dilimi heuristiği mi?
- Minimum veri eşiği: kaç sipariş / sürüş altında “zayıf yıl” ekranı?

### Faz 1 — MVP (kartlar, video yok)

- Sadece **giriş yapmış üye**, kendi verisi.
- Dikey Story boyutunda (1080×1920) HTML/CSS kartlar veya statik şablon.
- “Hikâyede paylaş” (native share / görsel indir).
- CTA: “Sonraki sürüşe yazıl” → Sürüş sekmesi / RSVP.

### Faz 2 — Zenginleştirme

- Daha iyi parti eşlemesi (etkinlik takvimi / mağaza / gece etiketi).
- Şaka cümlelerinin A/B’si, TR/EN/RU.
- Opsiyonel: kısa video (şablon + metin overlay); render maliyeti bilinçli.

### Faz 3 (isteğe bağlı)

- Topluluk ortalaması (“NIP ortalamasının üstündesin”).
- Liderlik tahtası değil — utandırmaz, kutlar.

## 4. Mevcut veri kaynakları (kod tabanı)

| Veri | Kaynak | Not |
|------|--------|-----|
| Siparişler / tutar / saat | `orders` + `order_items` (`customer_id`, `status=paid`/`debt`) | Misafir siparişleri üye özetine girmez |
| Ürün adı / kategori | `order_items.product_name`, kategori bağları | “Bira / kahve / …” için kategori veya isim eşlemesi gerekir |
| Cüzdan / harcama / seviye | `customers.points`, `total_spent`, `tier`, `visit_count` | Seviye cüzdandan ayrı; harcama `total_spent` |
| Sürüş listesi | `ride_posts` (`ride_date`, `distance_km`, `elevation_m`, `title`, …) | km sürüş kartından gelir |
| Sürüş katılımı | `ride_rsvps` (`customer_id`, `status=going\|maybe\|out`) | **Katıldı ≠ going** riski — karar şart |
| Etkinlik / parti | `events` / rezervasyon / Shopify feed (profile göre) | Sert eşleme yoksa saat heuristiği |
| Profil modülü | `lib/profil.js` → `surus`, `uyelik` | Başka işletme profilinde Wrapped kapanabilir |

## 5. Kart senaryosu (MVP önerisi — sıra önemli)

1. **Kapak** — “NIP 2026 · {Ad}”
2. **Sürüş** — “X sürüşe yazıldın · ~Y km” (+ zayıfsa CTA)
3. **İçecek / yeme** — “Bu yıl en çok: {ürün}” / “Z adet bira bandı”
4. **Ritim** — “Gece kuşu” / “Sabahcı” (sipariş saatine göre)
5. **Parti hissi** (yumuşak) — “X gece 22:00 sonrası mekândaydın”
6. **Seviye / sadakat** — tier + “Z puan kazandın” / harcama
7. **Şaka kartı** — eşik kurallı tek cümle (“sünger gibisin” vb.)
8. **Kapanış + CTA** — paylaş + sonraki sürüş

Kart sayısı 6–8’i geçmesin; Wrapped yorgunluğu olmasın.

## 6. Şaka / etiket motoru (kural tabanlı)

Şakalar **eşik + kategori** ile üretilsin; uydurma istatistik yok.

Örnek kurallar (taslak — sahip tonuna göre düzenlenecek):

| Koşul | Etiket / cümle (örnek) |
|-------|-------------------------|
| bira kalemi ≥ 20 | “Sünger gibisin.” |
| kahve kalemi ≥ 30 | “Damarlarında espresso dolaşıyor.” |
| sürüş_going ≥ 10 | “Lastik aşındıranlardan.” |
| km ≥ 500 | “Bu yıl Türkiye’yi turladın (neredeyse).” |
| gece siparişi oranı ≥ %40 | “Gündüz kim, sen kim.” |
| sipariş < 3 ve sürüş 0 | “Sessiz yıl — 2027’yi dolduralım.” + CTA |
| tier = mudavim/aileden | “Artık aile fotoğrafındasın.” |

Fallback: veri yetmezse genel, sıcak, utandırmayan cümle.

Dil: TR öncelik; EN/RU profil diline göre (QR menü `L()` deseni).

## 7. “Sürüşe katıl” butonu (Wrapped’tan bağımsız da değerli)

- Yer: QR menü Sürüş sekmesi + Wrapped zayıf-veri / kapanış kartı.
- Aksiyon: `ride_rsvps` insert/update (`going`) — üye girişi şart.
- Metin örneği: “Sürüşe yazıl — yıl sonu özetinde görünsün.”
- Ölçüm: RSVP artışı, Wrapped açılış oranı (basit event / log).

## 8. Parti eşlemesi — iki seçenek

**A) Yumuşak (MVP önerisi)**

- “Gece” = sipariş saati 22:00–03:59 (TR).
- “Hafta sonu gece kuşu” = Cuma–Cumartesi gece.
- Parti adı uydurma; his ver.

**B) Sert (daha sonra)**

- Parti/etkinlik takviminden tarih aralığı.
- O aralıktaki ödenmiş siparişler = “X partisindeydin”.
- Yanlış eşleşme riski yüksek → önce A.

## 9. Gizlilik & güvenlik

- Yalnız `auth` üye + kendi `customer_id` satırları.
- Anon Wrapped yok.
- Paylaşım görselinde varsayılan: ad (isteğe bağlı), istatistik; telefon/e-posta asla.
- Personel paneline “herkesin Wrapped’ı” listesi şart değil (KVKK / utandırma).
- RLS: mümkünse SECURITY DEFINER özet RPC (`nip_wrapped_2026(p_year)`) — istemciye ham dump yok.

## 10. Teknik iskelet (uygulama notu — Claude için)

```
RPC veya view: nip_wrapped_ozet(p_year int) → jsonb
  {
    customer_name,
    orders_count, total_spent, points, tier,
    top_products: [{name, qty}],
    drink_buckets: { beer, coffee, other },
    night_order_ratio, peak_hour,
    rides_going, rides_km_sum,
    joke_key,   -- sunucu veya istemci eşik motoru
    weak: bool
  }

UI: /wrapped veya profil modalı içi “2026”
  → kart slider
  → share
  → CTA rides
```

- Profil bayrağı: yalnız `surus` + `uyelik` açık işletmelerde (NIP).
- Performans: yılda bir kez hesapla veya cache tablosu (`wrapped_cache`);
  yıl içinde “önizleme” gevşek olabilir, 31 Ara “kilitli” sürüm.

## 11. Başarı ölçütleri (basit)

- Wrapped’ı açan üye sayısı
- Paylaşım / indirme (mümkünse)
- CTA’dan RSVP `going` artışı (Wrapped haftası)

## 12. Açık sorular (Ömer cevaplasın)

1. “Katıldı” = sadece RSVP `going` mi, yoksa kapıda işaret mi?
2. km: RSVP olan her sürüşün `distance_km` toplamı kabul mü?
3. Parti: yumuşak gece saati mi, yoksa takvim şart mı?
4. İlk yıl video şart mı, yoksa kart + Story yeter mi?
5. Dil: yalnız TR mi, EN/RU da mı?
6. Şaka tonu: ne kadar iğneleyici? (sünger vb. OK mi?)
7. Zayıf veri eşiği nedir? (örn. <2 sipariş ve 0 sürüş)
8. Ne zaman yayın? (Ara sonu / Ocak başı / yıl boyu “şimdiye kadar”)
9. Merch / Shop istatistiği Wrapped’a girsin mi?
10. Başka işletme profillerinde özellik kapalı mı? (öneri: evet)

## 13. Bilinçli olarak ilk sürümde YOK

- Gerçek zamanlı Strava aktivite sync (km doğrulama)
- Müzik / gerçek Spotify bağlantısı
- Diğer üyelerle kıyas liderlik tablosu
- Otomatik Instagram post (sadece kullanıcı paylaşır)
- Misafir (girişsiz) Wrapped

## 14. Sonraki adım

1. Bu brief’teki açık sorulara sahip cevapları işlenir.
2. Kart metinleri + şaka tablosu kilitlenir.
3. RPC şekli + tek ekran prototip (mobil QR).
4. Soft launch üyelere → ölçüm → Faz 2.

---

*İlgili: `docs/isletme-profili.md`, `supabase/migrations/20260902_surusler_ordera_tasindi.sql`, `src/pages/customer/CustomerMenu.jsx` (rides / profil), `src/lib/profil.js`*
