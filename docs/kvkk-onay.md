# KVKK onay sistemi (NIPORDER)

> Üye kayıt/girişinde **checkbox ile açık rıza** + **sürümlü aydınlatma metni**.
> Veri kullanım şekli değişince metin sürümü güncellenir; üyeden yeniden onay istenir.
>
> Agent / Claude: `.claude/skills/kvkk-onay/SKILL.md` (ve `.agents/skills/kvkk-onay/`)
> — KVKK’ya dokunan her işte bu skill zorunlu.

## Neden

KVKK’da üyelik / sadakat / puan gibi işlemler için bilgilendirme + açık rıza
gerekir. “Kayıt olarak kabul etmiş sayılırsınız” kullanılmaz.

## Tablolar

| Tablo / kolon | Rol |
|---------------|-----|
| `kvkk_documents` | Sürümlü metin (`version`, `summary`, `body`, `is_current`) |
| `customer_kvkk_consents` | Üyenin hangi sürümü ne zaman kabul ettiği |
| `customers.kvkk_version` | Son kabul edilen sürüm |
| `customers.kvkk_accepted_at` | Son kabul zamanı |

## RPC

- `nip_kvkk_guncel()` → güncel belge (JSON)
- `nip_kvkk_kabul(p_version, p_source)` → kabul kaydı (`signup` / `reaccept` / `profile`)

## Kod

- Migration: `supabase/migrations/20261011_kvkk_onay.sql`
- `src/lib/kvkk.js`
- `src/contexts/AuthContext.jsx` (pending sürüm → kabul)
- `src/pages/customer/CustomerMenu.jsx` (checkbox + yeniden onay modalı)

## Yeni sürüm nasıl yayınlanır

1. Yeni migration dosyası oluştur (eski migration’ı edit etme).
2. `is_current = false` yap (eski).
3. Yeni satır ekle (`is_current = true`, yeni `version` örn. `2026-11-01`).
4. Göçüş / SQL Editor ile uygula.
5. Üyeler uygulamayı açınca yeniden onay modalını görür.

SQL şablonu skill dosyasında.

## Kontrol listesi (PR)

- [ ] Veri amacı / toplanan veri değiştiyse yeni KVKK sürümü var
- [ ] Tek `is_current`
- [ ] Checkbox akışı duruyor
- [ ] PR notunda sürüm X → Y yazılmış

## Not

Tohum metin taslaktır; hukuki nihai metin için danışman/avukat gözden geçirmeli.
