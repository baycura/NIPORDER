# Menü: seçenek–ürün stok bağı ve ürün yedeği

## Seçenek bir başka ürünle aynı maldan yapılıyorsa

Örnek: Ice Bumble'ın "Nar" seçeneği, Nar Suyu ürünüyle aynı meyve suyundan
yapılır. Nar suyu tükenince Ice Bumble'da nar seçilememelidir.

Bağ, ürünün seçenek ayarına yazılır (`products.options_config`):

```json
{ "groups": [ { "name": "Fruit", "required": true,
    "options": ["Orange", "Pomegranate", "Grapefruit"],
    "stock_links": { "Orange": "<Portakal Suyu ürün kimliği>",
                     "Pomegranate": "<Nar Suyu ürün kimliği>",
                     "Grapefruit": "<Greyfurt Suyu ürün kimliği>" } } ] }
```

Kural (müşteri menüsü):

- Bağlı ürün "Bugün tükendi" işaretliyse ya da menüden kapatıldıysa seçenek
  görünür ama seçilemez; yanında "Tükendi" yazar.
- Zorunlu bir grubun bütün seçenekleri tükendiyse ürünün kendisi de "Tükendi"
  görünür ve sepete eklenemez.
- Bağ yazılmamış seçenek her zaman seçilebilir (eski davranış).

Bağ şu an yalnız veritabanından yazılır; Menü Yönetimi ekranında alanı yoktur.
Ekran, grubu düzenlerken bağı silmez. Personel sipariş ekranı bağı dikkate
almaz (personel her seçeneği seçebilir).

Bağlı ürünler (20.11.2026): Ice Bumble ve Taze Sıkım Meyve Suyu → Portakal
Suyu, Nar Suyu, Greyfurt Suyu, Limonata.

## Ürün yedeği

Toplu menü değişikliğinden (ad, açıklama, seçenek, fiyat) önce ürün satırının
tam kopyası `nip_urun_yedek` tablosuna alınır (`20261120_urun_yedek.sql`):

```sql
select public.nip_urun_yedek_al('2026-11-20 menu duzenleme oncesi');
```

Eski değer buradan okunur:

```sql
select veri->>'name', veri->>'description', veri->>'price'
  from public.nip_urun_yedek
 where etiket = '2026-11-20 menu duzenleme oncesi' and product_id = '<ürün kimliği>';
```

Tablo yalnız SQL oturumundan okunur ve yazılır. Satır hiç kaldırılmaz.
