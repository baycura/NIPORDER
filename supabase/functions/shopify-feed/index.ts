// Not In Paris — QR menu icin Shopify vitrin beslemesi
//
// GET ?section=shop|events|rides
//   shop   -> "Not in Paris" koleksiyonu (nip)         — NIP markali urunler
//   events -> "Etkinlikler" koleksiyonu (etkinlikler)  — etkinlik/rezervasyon
//   rides  -> "Sürüşler" koleksiyonu (surusler)        — planli suruslar
//
// Magazanin public /collections/<handle>/products.json ucundan okur (token
// gerekmez), 10 dk cache'lenir. Musteri karta dokununca notinparis.me urun
// sayfasina gider — odeme/rezervasyon Shopify checkout'ta olur.

const STORE = "https://notinparis.me";
const SECTIONS: Record<string, string> = {
  shop: "nip",
  events: "etkinlikler",
  rides: "surusler",
};

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=600",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const section = url.searchParams.get("section") || "shop";
  const handle = SECTIONS[section];
  if (!handle) return new Response(JSON.stringify({ items: [] }), { headers: HEADERS });

  try {
    const r = await fetch(`${STORE}/collections/${handle}/products.json?limit=24`, {
      headers: { "User-Agent": "NIP-QR-Menu/1.0" },
    });
    if (!r.ok) throw new Error("shopify " + r.status);
    const data = await r.json();
    const items = (data.products || []).map((p: any) => ({
      title: p.title,
      url: `${STORE}/products/${p.handle}`,
      image: p.images?.[0]?.src || null,
      price: p.variants?.length ? Math.min(...p.variants.map((v: any) => Number(v.price) || 0)) : null,
      available: (p.variants || []).some((v: any) => v.available !== false),
      body: (p.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
    }));
    return new Response(JSON.stringify({ items }), { headers: HEADERS });
  } catch (e) {
    console.error("shopify-feed", section, e);
    return new Response(JSON.stringify({ items: [], error: (e as Error).message }), { headers: HEADERS });
  }
});
