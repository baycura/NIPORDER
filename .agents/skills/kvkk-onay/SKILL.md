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

1. `kvkk_documents` — sürümler (`version`, `title`, `summary`, `body`, `is_current`)
2. `customer_kvkk_consents` — üye × sürüm kabul geçmişi
3. `customers.kvkk_version` / `kvkk_accepted_at` — son kabul (hızlı kontrol)
4. RPC `nip_kvkk_guncel()` — güncel metin
5. RPC `nip_kvkk_kabul(p_version, p_source)` — kabul yazar; sürüm `is_current` olmalı
6. UI: kayıtta checkbox; `customer.kvkk_version !== guncel` → yeniden onay modalı

## Zorunlu adımlar — veri kullanımı değiştiyse

**ASLA** sadece UI metnini değiştirip bırakma.

1. **Amaç değişti mi?** Yeni veri / yeni amaç / yeni aktarım → **yeni sürüm şart**.
2. **Yeni migration** yaz (`YYYYMMDD_kvkk_....sql`), eski dosyayı rewrite etme.
3. Migration içinde:
   - `update kvkk_documents set is_current = false where is_current;`
   - `insert into kvkk_documents (version, title, summary, body, is_current) values ('YYYY-MM-DD', …, true);`
   - `version` benzersiz olsun (örn. `2026-11-01`).
4. `summary` checkbox yanında görünen kısa rıza cümlesi; `body` tam aydınlatma.
5. Göçüş / SQL Editor ile uygula; `select * from nip_kvkk_guncel();` doğrula.
6. Mevcut üyeler otomatik olarak yeniden onay görür (`kvkk_version` eşleşmez).
   Ekstra “herkese logout” gerekmez.
7. PR açıklamasında yaz: **KVKK sürümü X → Y, yeniden onay tetiklenir.**

## Küçük metin düzeltmesi (yeniden onay gerekmez)

Yalnız yazım / format, hukuki anlam aynı kalıyorsa:

- Aynı `version` satırında `body`/`title` update edilebilir **veya**
- Sahip kararıyla yine de yeni sürüm (daha güvenli).

Şüphe varsa **yeni sürüm + yeniden onay**.

## UI kuralları

- Açık rıza = **checkbox** (zorunlu işaret). “Devam ederek kabul” yok.
- Aydınlatma metni link/sheet ile okunabilir olmalı.
- Sürüm numarası UI’da görülebilir (`v2026-10-11`).
- Migration henüz yoksa girişi tamamen kilitleme (mevcut `kvkkHazirla` gevşekliği).

## Yeni sürüm SQL şablonu

```sql
-- orn: 20261101_kvkk_surum.sql
update public.kvkk_documents set is_current = false where is_current;

insert into public.kvkk_documents (version, title, summary, body, is_current)
values (
  '2026-11-01',
  'Kişisel Verilerin Korunması — Aydınlatma ve Üyelik Açık Rızası',
  '…checkbox özeti…',
  $kvkk$
  …tam aydınlatma…
  $kvkk$,
  true
);
```

## Yapma

- Eski `is_current` satırını silmeden üzerine tek satır bırakmak (iki `true` olmaz; unique index var)
- Onay geçmişini (`customer_kvkk_consents`) silmek
- Anon’a consent yazma yetkisi vermek (yalnız RPC / authenticated)
- Hukuki metni uydurup “nihai” diye sunmak — taslak + danışman notu bırak

## PR self-check

- [ ] Veri amacı değiştiyse yeni `kvkk_documents` sürümü var
- [ ] Tek `is_current = true`
- [ ] Checkbox / yeniden onay akışı bozulmadı
- [ ] Migration `supabase/migrations/` altında; Göçüş’e uygun
- [ ] `docs/kvkk-onay.md` gerekirse güncellendi
