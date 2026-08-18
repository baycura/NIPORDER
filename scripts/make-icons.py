#!/usr/bin/env python3
"""Tek bir logo dosyasindan uygulamanin tum ikonlarini uretir.

    python3 scripts/make-icons.py logo.png

Uretilenler (public/icons/ altina):
    icon-192.png            ana ekran kisayolu
    icon-512.png            ana ekran kisayolu (buyuk)
    icon-512-maskable.png   Android: kenarlardan kirpar, o yuzden %20 bosluk birakilir
    apple-touch-icon.png    iPhone ana ekran (180)
    favicon-32.png          tarayici sekmesi
    og.png                  link onizlemesi (1200x630, WhatsApp/Instagram/Telegram)

Neden elle degil script: alti ayri boyut ve iki ayri arka plan var; birini
unutunca kisayol ikonu eski logoda kaliyor ve fark edilmesi haftalar suruyor.
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
FONT = os.path.join(ROOT, "public", "fonts", "Coolvetica-Heavy-Compressed.otf")

BG = (255, 255, 255)        # logo siyah cizgi oldugu icin zemin beyaz
OG_BG = (12, 12, 12)        # link onizlemesi marka siyahi
OG_FG = (240, 237, 232)


def load_logo(path):
    im = Image.open(path).convert("RGBA")
    # Cevresindeki bos alani kirp — ikonun ortasinda kucuk kalmasin
    bbox = im.getbbox()
    alpha = im.split()[3]
    if alpha.getextrema()[0] == 255:          # saydamlik yoksa beyazi kirp
        gray = im.convert("L").point(lambda v: 0 if v > 240 else 255)
        bbox = gray.getbbox() or bbox
    return im.crop(bbox) if bbox else im


def square(logo, size, bg, pad_ratio):
    """Logoyu kare tuvale ortalar. pad_ratio kenarlarda birakilan bosluk."""
    canvas = Image.new("RGBA", (size, size), bg + (255,))
    inner = int(size * (1 - 2 * pad_ratio))
    w, h = logo.size
    scale = min(inner / w, inner / h)
    resized = logo.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
    return canvas.convert("RGB")


def make_og(logo):
    """Link onizleme karti: siyah zemin, solda logo, sagda marka adi."""
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), OG_BG)
    inv = Image.new("RGBA", logo.size, OG_FG + (0,))
    inv.putalpha(logo.split()[3] if logo.mode == "RGBA" else logo.convert("L").point(lambda v: 255 - v))
    box = 380
    w, h = inv.size
    s = min(box / w, box / h)
    inv = inv.resize((int(w * s), int(h * s)), Image.LANCZOS)
    card.paste(inv, (110, (H - inv.height) // 2), inv)

    d = ImageDraw.Draw(card)
    try:
        f1 = ImageFont.truetype(FONT, 108)
        f2 = ImageFont.truetype(FONT, 40)
    except OSError:
        f1 = f2 = ImageFont.load_default()
    x = 110 + inv.width + 70
    d.text((x, H // 2 - 90), "NOT IN PARIS", font=f1, fill=OG_FG)
    d.text((x, H // 2 + 30), "FETHIYE", font=f2, fill=(200, 151, 62))
    return card


def main():
    if len(sys.argv) < 2:
        sys.exit("kullanim: python3 scripts/make-icons.py <logo.png|logo.svg>")
    logo = load_logo(sys.argv[1])
    os.makedirs(OUT, exist_ok=True)

    jobs = [
        ("icon-192.png", 192, BG, 0.10),
        ("icon-512.png", 512, BG, 0.10),
        # Android maskable: ikonun kenarlarini daire/kare seklinde kirpar,
        # cizgiler kesilmesin diye disarida genis bosluk sart.
        ("icon-512-maskable.png", 512, BG, 0.22),
        ("apple-touch-icon.png", 180, BG, 0.10),
        ("favicon-32.png", 32, BG, 0.06),
    ]
    for name, size, bg, pad in jobs:
        square(logo, size, bg, pad).save(os.path.join(OUT, name), optimize=True)
        print("  ✓", name, f"{size}x{size}")

    make_og(logo).save(os.path.join(OUT, "og.png"), optimize=True)
    print("  ✓ og.png 1200x630")


if __name__ == "__main__":
    main()
