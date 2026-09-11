#!/usr/bin/env python3
"""Logosu olmayan isletme icin harf ikonlari uretir (make-icons.py'nin kucuk kardesi).

    python3 scripts/harf-ikon.py --harf K --ad "Kafe" --klasor isletme/kafe/public/icons

Uretilenler (klasor altina, make-icons.py ile ayni adlar — index.html ve
manifest.json ayni yollari okur):
    icon-192.png  icon-512.png  icon-512-maskable.png  apple-touch-icon.png
    favicon-32.png  og.png (1200x630)  logo-mark.png  logo-mark-light.png

Yazi tipi: public/fonts/Coolvetica-Heavy-Compressed.otf (repoda var). Isletme
kendi logosunu verirse make-icons.py kullanilir, bu dosya gerekmez.
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "public", "fonts", "Coolvetica-Heavy-Compressed.otf")

INK_LIGHT = (240, 237, 232)
INK_DARK = (26, 26, 26)
BG_DARK = (12, 12, 12)
BG_LIGHT = (255, 255, 255)


def hex_rgb(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except Exception:
        return ImageFont.load_default()


def harf_kare(boy, harf, zemin, murekkep, bosluk=0.0, yuvarlak=0.0, saydam=False):
    """Kare zemin + ortalanmis harf. bosluk: maskable icin kenar payi orani."""
    im = Image.new("RGBA", (boy, boy), (0, 0, 0, 0) if saydam else zemin + (255,))
    d = ImageDraw.Draw(im)
    if not saydam and yuvarlak > 0:
        im = Image.new("RGBA", (boy, boy), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, boy - 1, boy - 1], radius=int(boy * yuvarlak), fill=zemin + (255,))
    ic = boy * (1 - 2 * bosluk)
    f = font(int(ic * 0.78))
    bbox = d.textbbox((0, 0), harf, font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (boy - w) / 2 - bbox[0]
    y = (boy - h) / 2 - bbox[1]
    d.text((x, y), harf, font=f, fill=murekkep + (255,))
    return im


def og(harf, ad, zemin, murekkep):
    im = Image.new("RGB", (1200, 630), zemin)
    d = ImageDraw.Draw(im)
    kare = harf_kare(300, harf, murekkep, zemin, yuvarlak=0.22)
    im.paste(kare, (120, 165), kare)
    f = font(150)
    metin = ad.upper()
    bbox = d.textbbox((0, 0), metin, font=f)
    while bbox[2] - bbox[0] > 680 and f.size > 40:
        f = font(f.size - 10)
        bbox = d.textbbox((0, 0), metin, font=f)
    d.text((470 - bbox[0], (630 - (bbox[3] - bbox[1])) / 2 - bbox[1]), metin, font=f, fill=murekkep)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--harf", required=True)
    ap.add_argument("--ad", required=True)
    ap.add_argument("--klasor", required=True)
    ap.add_argument("--zemin", default="#0C0C0C")
    ap.add_argument("--murekkep", default="#F0EDE8")
    a = ap.parse_args()
    zemin, murekkep = hex_rgb(a.zemin), hex_rgb(a.murekkep)
    harf = a.harf[:2].upper()
    os.makedirs(a.klasor, exist_ok=True)
    out = lambda n: os.path.join(a.klasor, n)

    harf_kare(192, harf, zemin, murekkep).convert("RGB").save(out("icon-192.png"))
    harf_kare(512, harf, zemin, murekkep).convert("RGB").save(out("icon-512.png"))
    harf_kare(512, harf, zemin, murekkep, bosluk=0.22).convert("RGB").save(out("icon-512-maskable.png"))
    harf_kare(180, harf, zemin, murekkep).convert("RGB").save(out("apple-touch-icon.png"))
    harf_kare(32, harf, zemin, murekkep).convert("RGB").save(out("favicon-32.png"))
    og(harf, a.ad, zemin, murekkep).save(out("og.png"))
    # Acilis ekrani: beyaz zemin uzerinde koyu harf (saydam), koyu zeminde acik harf
    harf_kare(512, harf, zemin, INK_DARK, saydam=True).save(out("logo-mark.png"))
    harf_kare(512, harf, zemin, INK_LIGHT, saydam=True).save(out("logo-mark-light.png"))
    print("ikonlar yazildi:", a.klasor)


if __name__ == "__main__":
    main()
