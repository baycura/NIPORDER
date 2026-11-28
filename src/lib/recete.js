// RECETE ORTAK KURALLARI — Reçeteler sayfasi ve yeni urun formundaki reçete
// bolumu ayni degerleri kullansin diye tek yerde.

// Recete satirina eklenen malzemenin ILK miktari (birime gore). Yalniz
// baslangic degeri: kisi miktari her zaman elle yazar.
export const varsayilanMiktar = (ing) => {
  if (ing?.unit === "g") return 150;
  if (ing?.unit === "ml") return 40;
  if (ing?.unit === "cl") return 4;
  if (ing?.unit === "l") return 0.2;
  return 1;
};

// Formda tutulan satirlar: [{ ingredient_id, name, unit, qty }].
// Miktari gecersiz (bos, 0, eksi, sayi degil) ilk satiri verir; hepsi
// gecerliyse null. Kayittan ONCE bakilir: 0 miktarli satir stoktan hicbir sey
// dusmez, "reçete girdim" sanilmasin.
export const gecersizReceteSatiri = (satirlar) =>
  (satirlar || []).find(r => {
    const q = Number(r.qty);
    return r.qty === "" || r.qty == null || !Number.isFinite(q) || q <= 0;
  }) || null;

// Formdaki satirlar -> recipes tablosuna yazilacak kayitlar.
export const receteKayitlari = (satirlar, productId, storeId) =>
  (satirlar || []).map(r => ({
    product_id: productId,
    ingredient_id: r.ingredient_id,
    qty_per_unit: Number(r.qty),
    store_id: storeId,
  }));
