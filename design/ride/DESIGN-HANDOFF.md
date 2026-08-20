# NIP Ride — Design Handoff (Unified Design Pass)

> Amaç: **Ride** alt-uygulamasını, ana **Not In Paris** sitesinin tam tasarım
> sistemine giydirmek. Ride şu an marka paletini kullanıyor ama *lean* bir
> placeholder CSS ile — display fontu **Bebas Neue**, eksik token seti, gölge/motion yok.
> Bu dosya Claude'a (claude.ai / Artifacts / MCP) verilince tek seferde "site formatı"na
> dönüştürme için gereken her şeyi içerir. Ekran görüntülerini de ekle.

---

## 1) Marka estetiği (tek cümlede)
**Brutalist editorial café**: baskın siyah + krem, seyrek hardal (mustard) vurgu.
Sert köşeler (radius ≈ 0), condensed/uppercase display tipografi, bol beyaz alan,
ince mono detaylar. Süsleme yok; tipografi ve kontrast taşır.

---

## 2) Kanonik tasarım tokenları (ana site — `src/theme/tokens.css`)
Ride bunları **birebir** kullanmalı (kendi kopyasını değil).

```css
:root {
  /* Renkler (customer paleti) */
  --nip-bg:          #FAFAF7;
  --nip-surface:     #FFFFFF;
  --nip-ink:         #0A0A0A;
  --nip-ink-soft:    #1A1A1A;
  --nip-muted:       #8A8A86;
  --nip-divider:     #E5E3DC;
  --nip-cream:       #EFEAE0;
  --nip-accent:      #C8973E;   /* mustard */
  --nip-accent-ink:  #2A2200;
  --nip-danger:      #C83E3E;
  --nip-success:     #2F7D4F;
  --nip-overlay:     rgba(10,10,10,0.55);

  /* Tipografi — DÜZELTME: ride şu an Bebas Neue kullanıyor, Coolvetica olmalı */
  --nip-font-display: "Coolvetica","Bebas Neue","Archivo Narrow","Oswald",system-ui,sans-serif;
  --nip-font-body:    "IBM Plex Sans","DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --nip-font-mono:    "IBM Plex Mono",ui-monospace,SFMono-Regular,monospace;

  /* Radius (brutalist → çoğunlukla 0) */
  --nip-r-0: 0px; --nip-r-1: 2px; --nip-r-2: 4px;

  /* Spacing (4px taban) */
  --nip-s-1:4px; --nip-s-2:8px; --nip-s-3:12px; --nip-s-4:16px;
  --nip-s-5:24px; --nip-s-6:32px; --nip-s-7:48px; --nip-s-8:64px;

  /* Gölgeler */
  --nip-shadow-1: 0 1px 0 rgba(0,0,0,0.06);
  --nip-shadow-2: 0 2px 10px rgba(0,0,0,0.08);
  --nip-shadow-pop: 0 8px 32px rgba(0,0,0,0.18);

  /* Motion */
  --nip-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --nip-dur-fast: 140ms; --nip-dur-med: 260ms;
}
```

Başlıklar (h1–h4 + `.nip-display`): `--nip-font-display`, `text-transform:uppercase`,
`letter-spacing:0.01em`, `font-weight:500`, `line-height:1.02`.

---

## 3) Coolvetica font kurulumu (`src/theme/fonts.css`)
Ride bu @font-face'leri import etmeli ve `/fonts/*.otf` dosyalarını
`ride/public/fonts/` altına koymalı (ana sitedeki dosyalarla aynı).

```css
@font-face { font-family:'Coolvetica'; src:url('/fonts/Coolvetica-Condensed.otf') format('opentype'); font-weight:400 500; font-display:swap; }
@font-face { font-family:'Coolvetica'; src:url('/fonts/Coolvetica-HeavyComp.otf') format('opentype'); font-weight:700 900; font-display:swap; }
@font-face { font-family:'Coolvetica Wide'; src:url('/fonts/Coolvetica.otf') format('opentype'); font-weight:400 500; font-display:swap; }
```

---

## 4) Ride'ın şu anki durumu ve "fark" (ne değişecek)
- `ride/src/theme/ride.css` → tokenların **lean kopyası**, display = Bebas Neue. Notu bile var:
  *"intentionally lean; the final unified design pass replaces it."*
- Stil çoğunlukla **inline `style={{}}`** ile yazılı (Layout, BoardPage, RideCard, detay sayfaları, admin).
- Eksikler: Coolvetica, tam token seti, gölge/motion, `.nip-customer` kapsayıcı tema,
  tutarlı buton/kart/pill/input bileşen dili.

**Hedef:** Görsel olarak ana site ile aynı dili konuşan, aynı tokenları paylaşan,
inline style yerine paylaşılan utility/bileşen CSS sınıflarına dayanan tek tip ride.

---

## 5) Sayfa & bileşen envanteri (redesign kapsamı)
**Shell:** `components/Layout.jsx` (header + nav + footer), `components/RideCard.jsx`

**Sayfalar (`src/pages/`):**
`BoardPage` (sürüş panosu) · `RideDetailPage` (Social Ride rozeti + RSVP) ·
`CreateRidePage` · `CampsPage` · `CampDetailPage` · `RentalsPage` ·
`RentalDetailPage` · `CreateRentalPage` · `MyRidesPage` · `LoginPage`

**Admin (`src/admin/`):**
`AdminPage` (sekmeli) · `RideModeration` · `CampsAdmin` · `RentalModeration` · `SocialRideForm`

Tekrar eden UI primitifleri (tek dilde tasarlanmalı):
- **Buton**: primary (mustard zemin, ink yazı, radius 2), ghost (ince ink border), danger
- **Kart**: surface zemin, 1px divider, hafif `--nip-shadow-1`, köşe `--nip-r-2`
- **Pill/rozet**: open=ink, full=mustard, cancelled=divider; "SOCIAL RIDE" rozeti
- **Stat kutuları** (detay sayfalarındaki KOLTUK/TEMPO/MESAFE…)
- **Form alanları**: input/select/textarea — divider border, ink focus
- **Mono etiketler**: TEMPO/MESAFE/BULUŞMA gibi uppercase mono caps

---

## 6) Kabul kriterleri
1. Ride, `tokens.css` + `fonts.css`'i **paylaşır** (kendi kopyası silinir/aliaslanır).
2. Tüm başlıklar Coolvetica condensed uppercase.
3. Buton/kart/pill/input için **tek tip sınıflar**; inline style minimuma iner.
4. Renk/spacing/gölge yalnızca token üzerinden; sabit hex/px serbest kullanılmaz.
5. Mobil öncelik: header nav ve kartlar dar ekranda düzgün sarmalı.
6. Davranış birebir korunur — yalnız görsel katman değişir (data/akış aynı).

---

## 7) Claude'a verilecek hazır prompt (kopyala-yapıştır)
> Aşağıdaki "NIP Ride — Design Handoff" brief'ini ve ekteki ekran görüntülerini
> kullanarak Ride alt-uygulamasını Not In Paris ana sitesinin tasarım sistemine
> giydir. `tokens.css` + `fonts.css`'i paylaş, Coolvetica'yı aktive et, inline
> style'ları paylaşılan buton/kart/pill/input/stat sınıflarına taşı. Davranışı
> birebir koru, yalnız görsel katmanı değiştir. Bölüm 5'teki her sayfa ve admin
> sekmesini kapsa. Çıktı: değişen dosyaların tam içeriği + yeni `ride.css`.

**Ek olarak ver:** bu dosya + 10 ekran görüntüsü (pano, sürüş/Social Ride detayı,
kamp panosu+detay, kiralık panosu+detay, admin sürüş/kamp/social/kiralık sekmeleri).

---

## 8) İlgili kaynak dosyalar (referans için ekleyebilirsin)
- `src/theme/tokens.css` · `src/theme/fonts.css` — kanonik sistem
- `ride/src/theme/ride.css` — değişecek placeholder
- `ride/src/components/Layout.jsx`, `RideCard.jsx` — shell + kart örüntüsü
- `ride/src/pages/*`, `ride/src/admin/*` — kapsam
