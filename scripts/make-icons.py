#!/usr/bin/env python3
"""Tek bir logo dosyasindan uygulamanin tum ikonlarini uretir.

    python3 scripts/make-icons.py brand/logo-source.jpg          # siyah cizgi / beyaz zemin
    python3 scripts/make-icons.py brand/logo-source.jpg --dark    # beyaz cizgi / siyah zemin

Uretilenler (public/icons/ altina):
    icon-192.png            ana ekran kisayolu
    icon-512.png            ana ekran kisayolu (buyuk)
    icon-512-maskable.png   Android ikonu daire/kare kirpar; %22 bosluk birakilir
    apple-touch-icon.png    iPhone ana ekran (180)
    favicon-32.png          tarayici sekmesi
    og.png                  link onizlemesi (1200x630, WhatsApp/Instagram/Telegram)

Neden script: alti ayri boyut ve iki ayri zemin var. Elle yapinca biri hep
unutuluyor, kisayol ikonu eski logoda kaliyor ve haftalarca fark edilmiyor.
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
FONT = os.path.join(ROOT, "public", "fonts", "Coolvetica-Heavy-Compressed.otf")

INK_DARK = (26, 26, 26)      # acik zeminde cizgi rengi
INK_LIGHT = (240, 237, 232)  # koyu zeminde cizgi rengi
BG_LIGHT = (255, 255, 255)
BG_DARK = (12, 12, 12)
GOLD = (200, 151, 62)


def load_logo(path):
    """Logoyu SILUET olarak okur: alfa = cizginin oldugu yer.

    Kaynak JPEG oldugunda saydamlik yok, cizgi beyaz zemine basili gelir.
    Alfayi parlaklitan turetince ayni dosyadan hem acik hem koyu zeminli
    ikon uretilebiliyor — logoyu iki kere hazirlamaya gerek kalmiyor.
    """
    im = Image.open(path).convert("RGBA")
    r, g, b, a = im.split()
    if a.getextrema()[0] == 255:                 # gercek saydamlik yok
        lum = im.convert("L")
        a = lum.point(lambda v: 255 if v < 128 else (0 if v > 225 else int((225 - v) * 255 / 97)))
    mask = Image.new("RGBA", im.size, (0, 0, 0, 0))
    mask.putalpha(a)
    bbox = a.getbbox()
    return mask.crop(bbox) if bbox else mask


def tint(logo, color):
    out = Image.new("RGBA", logo.size, color + (0,))
    out.putalpha(logo.split()[3])
    return out


def square(logo, size, bg, ink, pad_ratio):
    canvas = Image.new("RGBA", (size, size), bg + (255,))
    inner = int(size * (1 - 2 * pad_ratio))
    w, h = logo.size
    scale = min(inner / w, inner / h)
    art = tint(logo, ink).resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return canvas.convert("RGB")


def make_og(logo):
    """Link onizleme karti — her zaman marka siyahi zeminde."""
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), BG_DARK)
    art = tint(logo, INK_LIGHT)
    box = 340
    w, h = art.size
    s = min(box / w, box / h)
    art = art.resize((int(w * s), int(h * s)), Image.LANCZOS)
    card.paste(art, (120, (H - art.height) // 2), art)

    d = ImageDraw.Draw(card)
    try:
        f1, f2 = ImageFont.truetype(FONT, 104), ImageFont.truetype(FONT, 38)
    except OSError:
        f1 = f2 = ImageFont.load_default()
    x = 120 + art.width + 70
    d.text((x, H // 2 - 96), "NOT IN PARIS", font=f1, fill=INK_LIGHT)
    d.text((x, H // 2 + 26), "FETHIYE", font=f2, fill=GOLD)
    return card


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dark = "--dark" in sys.argv
    if not args:
        sys.exit("kullanim: python3 scripts/make-icons.py <logo> [--dark]")
    logo = load_logo(args[0])
    bg, ink = (BG_DARK, INK_LIGHT) if dark else (BG_LIGHT, INK_DARK)
    os.makedirs(OUT, exist_ok=True)

    for name, size, pad in [
        ("icon-192.png", 192, 0.10),
        ("icon-512.png", 512, 0.10),
        ("icon-512-maskable.png", 512, 0.22),
        ("apple-touch-icon.png", 180, 0.10),
        ("favicon-32.png", 32, 0.06),
    ]:
        square(logo, size, bg, ink, pad).save(os.path.join(OUT, name), optimize=True)
        print("  ✓", name, f"{size}x{size}")

    make_og(logo).save(os.path.join(OUT, "og.png"), optimize=True)
    print("  ✓ og.png 1200x630")
    print("  zemin:", "koyu" if dark else "açık")


if __name__ == "__main__":
    main()
