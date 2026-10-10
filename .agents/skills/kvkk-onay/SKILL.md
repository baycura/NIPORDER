---
name: kvkk-onay
description: >-
  NIPORDER KVKK / aydınlatma metni sürüm ve üye onay sistemi. Use whenever
  changing membership signup, personal data collection, loyalty/points,
  customer profile fields, privacy copy, cookies, marketing consent, or
  anything that affects how member personal data is processed — so the agent
  never ships a data-use change without updating kvkk_documents and requiring
  re-consent when needed.
---

# KVKK onay — zorunlu kontrol listesi

Bu repoda üye KVKK’sı **sürümlü** tutulur. Veri işleme şekli değişince metni
güncellemek ve gerekirse yeniden onay istemek **zorunludur**. “Kayıt olarak
kabul etmiş sayılırsınız” metni kullanma; **checkbox ile açık rıza** kuralı.

## Ne zaman bu skill tetiklenir

Aşağıdakilerden biri varsa **hemen** bu dosyayı uygula:

- Üyelik / Google / OTP giriş veya kayıt akışı
- `customers` alanları, sipariş–üye bağı, puan/cüzdan, sürüş RSVP
- Aydınlatma, gizlilik, KVKK, rıza, checkbox, consent metni
- Yeni kişisel veri toplama veya yeni amaç (iletişim, analitik, paylaşım)
- Wrapped / profil istatistikleri gibi üye verisini gösteren özellikler

## Kaynak dosyalar (oku)

| Ne | Nerede |
|----|--------|
| Şema + tohum metin | `supabase/migrations/20261011_kvkk_onay.sql` |
| İstemci yardımcılar | `src/lib/kvkk.js` |
| Kabul kaydı (login sonrası) | `src/contexts/AuthContext.jsx` |
| Checkbox + yeniden onay UI | `src/pages/customer/CustomerMenu.jsx` |
| İnsan özeti | `docs/kvkk-onay.md` |

## Sistem nasıl çalışır (kısa)

1. `kvkk_documents` — sürümler; `title`/`summary`/`body` = jsonb `{tr,en,ru}`
2. `customer_kvkk_consents` — üye × sürüm kabul geçmişi
3. `customers.kvkk_version` / `kvkk_accepted_at` — son kabul (hızlı kontrol)
4. RPC `nip_kvkk_guncel(p_lang)` — seçili dile göre metin (yoksa `tr`)
5. RPC `nip_kvkk_kabul(p_version, p_source)` — kabul yazar; sürüm `is_current` olmalı
6. UI: kayıtta checkbox; dil değişince metin yeniden çekilir; sürüm eksikse yeniden onay

## Dil desteği (zorunlu)

Üye **kayıt/girişten önce** menüden dil seçer (`tr` / `en` / `ru`). KVKK
checkbox özeti ve tam aydınlatma metni **seçili dile göre** gelmeli.

| Kural | Detay |
|-------|--------|
| Depolama | `title`, `summary`, `body` → jsonb `{ "tr", "en", "ru" }` |
| API | `nip_kvkk_guncel(p_lang)` — istemci `kvkkGuncelGetir(lang)` |
| UI | `CustomerMenu`: `useEffect(..., [lang])` dil değişince yeniden çeker |
| Fallback | İstenen dil boşsa `tr` |
| Resmi dil | Hukuki esas **TR**; EN/RU bilgilendirme çevirisi |
| Yeni sürüm | **Üç dili birden** yaz — yalnız TR bırakma |

Yeni metin / amaç değişikliğinde EN ve RU’yu “sonra”ya bırakmak **yasak**:
PR’da `tr` + `en` + `ru` dolu olmalı.

Doğrulama örneği:

```sql
select nip_kvkk_guncel('tr');
select nip_kvkk_guncel('en');
select nip_kvkk_guncel('ru');
```

## Zorunlu adımlar — veri kullanımı değiştiyse

**ASLA** sadece UI metnini değiştirip bırakma.

1. **Amaç değişti mi?** Yeni veri / yeni amaç / yeni aktarım → **yeni sürüm şart**.
2. **Yeni migration** yaz (`YYYYMMDD_kvkk_....sql`), eski dosyayı rewrite etme.
3. Migration içinde:
   - `update kvkk_documents set is_current = false where is_current;`
   - `insert` ile `title`/`summary`/`body` **jsonb tr+en+ru** ve `is_current = true`
   - `version` benzersiz olsun (örn. `2026-11-01`).
4. `summary` checkbox yanında görünen kısa rıza cümlesi; `body` tam aydınlatma — **her dilde**.
5. Göçüş / SQL Editor ile uygula; `nip_kvkk_guncel('tr'|'en'|'ru')` doğrula.
6. Mevcut üyeler otomatik olarak yeniden onay görür (`kvkk_version` eşleşmez).
   Ekstra “herkese logout” gerekmez.
7. PR açıklamasında yaz: **KVKK sürümü X → Y, yeniden onay tetiklenir; tr/en/ru güncellendi.**

## Küçük metin düzeltmesi (yeniden onay gerekmez)

Yalnız yazım / format, hukuki anlam aynı kalıyorsa:

- Aynı `version` satırında `body`/`title` update edilebilir **veya**
- Sahip kararıyla yine de yeni sürüm (daha güvenli).

Şüphe varsa **yeni sürüm + yeniden onay**.

## UI kuralları

- Açık rıza = **checkbox** (zorunlu işaret). “Devam ederek kabul” yok.
- Aydınlatma metni link/sheet ile okunabilir olmalı; içerik **seçili dilde**.
- Sürüm numarası UI’da görülebilir (`v2026-10-11`).
- Dil değiştirilince `kvkkGuncelGetir(lang)` tekrar çağrılmalı.
- Migration henüz yoksa girişi tamamen kilitleme (mevcut `kvkkHazirla` gevşekliği).

## Yeni sürüm SQL şablonu

```sql
-- orn: 20261101_kvkk_surum.sql
update public.kvkk_documents set is_current = false where is_current;

insert into public.kvkk_documents (version, title, summary, body, is_current)
values (
  '2026-11-01',
  jsonb_build_object('tr', '…', 'en', '…', 'ru', '…'),
  jsonb_build_object('tr', '…checkbox…', 'en', '…', 'ru', '…'),
  jsonb_build_object('tr', $kvkk$…$kvkk$, 'en', $kvkk$…$kvkk$, 'ru', $kvkk$…$kvkk$),
  true
);
```

## Yapma

- Eski `is_current` satırını silmeden üzerine tek satır bırakmak (iki `true` olmaz; unique index var)
- Onay geçmişini (`customer_kvkk_consents`) silmek
- Anon’a consent yazma yetkisi vermek (yalnız RPC / authenticated)
- Hukuki metni uydurup “nihai” diye sunmak — taslak + danışman notu bırak
- Yeni sürümü yalnız TR yazıp EN/RU’yu boş bırakmak
- Metni `T.tr` / sabit string olarak UI’ye gömmek (kaynak DB + RPC olmalı)

## PR self-check

- [ ] Veri amacı değiştiyse yeni `kvkk_documents` sürümü var
- [ ] Tek `is_current = true`
- [ ] `title` / `summary` / `body` içinde **tr + en + ru** dolu
- [ ] Dil değiştirince metin değişiyor (`nip_kvkk_guncel` / `kvkkGuncelGetir(lang)`)
- [ ] Checkbox / yeniden onay akışı bozulmadı
- [ ] Migration `supabase/migrations/` altında; Göçüş’e uygun
- [ ] `docs/kvkk-onay.md` gerekirse güncellendi
