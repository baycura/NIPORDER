# isletme/ — aynı kod, başka işletme

Her alt klasör ayrı bir işletmenin **dağıtım ayarıdır**: kendi Supabase projesi,
kendi Vercel projesi, kendi markası. Kaynak kod ortak (`src/`), veri hiç karışmaz.

```
isletme/
  kafe/                 <- isletme slug'i (Vercel Root Directory)
    vite.config.js      <- profil, marka, magaza kimligi, Supabase adresi/anon anahtar
    vercel.json         <- repo kokunde build alan komutlar
    package.json        <- Vercel'in Node projesi sanmasi icin; bagimlilik yok
    public/manifest.json
    public/icons/       <- scripts/harf-ikon.py ya da make-icons.py ciktisi
```

Not in Paris'in kendisi bu klasörü kullanmaz: repo kökü (`vite.config.js`,
`public/`) NIP'tir, `VITE_PROFIL` verilmezse "nip" profili çalışır.

## Yeni işletme eklemek

1. `isletme/kafe` klasörünü kopyala, slug'ı değiştir (`isletme/<slug>`).
2. `vite.config.js` içindeki `ISLETME` bloğunu doldur (ad, alan adı, mağaza
   kimliği, Supabase adresi ve anon anahtar).
3. İkonlar: `python3 scripts/harf-ikon.py --harf K --ad "Kafe" --klasor isletme/<slug>/public/icons`
   (logo varsa `make-icons.py` mantığıyla aynı adlarla üret).
4. Veritabanı: `supabase/kurulum/README.md` adımları.
5. Vercel: yeni proje, repo `baycura/NIPORDER`, **Root Directory = isletme/<slug>**.
   Build komutları `vercel.json`'dan gelir; ortam değişkeni gerekmez.
   Eğer build "cd ../.. bulunamadı" derse: Vercel proje ayarlarında
   *Include source files outside of the Root Directory* açık olmalı.

## Yerelde denemek

```
npx vite --config isletme/kafe/vite.config.js --port 3002
npx vite build --config isletme/kafe/vite.config.js   # cikti: isletme/kafe/dist
```
