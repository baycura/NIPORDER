// Urun secenekleri (options_config) ile ilgili ortak hesaplar.
//
// Bir grup tek secimli ("Protein: Doner") ya da coklu secimli olabilir
// ("Soslar: Tatziki + Cheddar"). Coklu grupta secim bir DIZI olarak saklanir.
// Fiyat ve mutfak fisi bu farki bilmek zorunda; iki yerde de ayni sekilde
// ele alinsin diye tek yerde topluyoruz.

/** Secilen seceneklerin fiyat farki toplami (tek + coklu gruplar). */
export function optionMod(product, options) {
  if (!options || !product?.options_config?.groups) return 0;
  let mod = 0;
  for (const group of product.options_config.groups) {
    const sel = options[group.name];
    if (sel == null || !group.price_modifiers) continue;
    const picked = Array.isArray(sel) ? sel : [sel];
    for (const opt of picked) {
      const v = group.price_modifiers[opt];
      if (v != null) mod += Number(v) || 0;
    }
  }
  return mod;
}

/**
 * Mutfak fisi / kasa satiri icin okunur secenek metni.
 * Coklu gruplar virgulle, gruplar "·" ile ayrilir. Bos secim atlanir —
 * yoksa fiste basibos " · " kaliyordu.
 */
export function optionsText(selected) {
  if (!selected) return null;
  const parts = [];
  for (const v of Object.values(selected)) {
    if (Array.isArray(v)) { if (v.length) parts.push(v.join(", ")); }
    else if (v != null && String(v).trim() !== "") parts.push(String(v));
  }
  return parts.length ? parts.join(" · ") : null;
}
