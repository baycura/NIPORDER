// Not In Paris — Shopify baglantisi. Stogun tek kaynagi products; Shopify ayna.
//
// ?action=
//   urunler     -> katalog: bagli urunlerin kimlik/gorselini tazeler, esleme
//                  tablosundaki markalarin (shopify_sync_state.kategori_esleme)
//                  stoklu yeni urunlerini GIZLI acar. Stoga DOKUNMAZ.
//   siparisler  -> Shopify'da odenen siparisler; kalemler Order stogundan duser.
//   stok        -> Order stogunu Shopify'a MUTLAK deger olarak yazar
//                  (body.product_id verilirse tek urun, yoksa hepsi).
//
// Yetki: ?secret= (pg_net / cron, bot_config.webhook_secret) YA DA sahip JWT
// (Ayarlar sayfasindaki dugmeler). Anahtar bot_config.shopify_admin_token —
// personel okuyamaz, yalniz bu fonksiyon (servis rolu).
//
// Dongu yok: siparis dusumu products'i gunceller, tetik stok push'u cagirir,
// push Shopify'a zaten dustugu sayiyi yazar (idempotent).

import { createClient } from "jsr:@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const API = "2025-07";
const PARIS = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function cfg(key: string): Promise<string | null> {
  const { data } = await supa.from("bot_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function state(key: string): Promise<any> {
  const { data } = await supa.from("shopify_sync_state").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setState(key: string, value: unknown) {
  await supa.from("shopify_sync_state").upsert({ key, value, updated_at: new Date().toISOString() });
}
async function log(islem: string, ok: boolean, mesaj: string, detay?: unknown) {
  await supa.from("shopify_sync_log").insert({ islem, ok, mesaj, detay: detay ?? null });
}

const gidNum = (gid: string | null | undefined) => gid ? Number(String(gid).split("/").pop()) : null;
const gid = (tur: string, n: number | string) => `gid://shopify/${tur}/${n}`;

async function gql(shop: string, token: string, query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${shop}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`Shopify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (j.errors?.length) throw new Error("Shopify: " + j.errors.map((e: any) => e.message).join("; "));
  return j.data;
}

// Sahip JWT ya da pg_net sirri.
async function yetkili(req: Request, url: URL): Promise<boolean> {
  const secret = url.searchParams.get("secret");
  if (secret) return secret === (await cfg("webhook_secret"));
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data: u } = await supa.auth.getUser(jwt);
  const uid = u?.user?.id;
  if (!uid) return false;
  const { data: s } = await supa.from("staff").select("role, is_active").eq("auth_id", uid).maybeSingle();
  return !!s && s.is_active !== false && ["admin", "owner"].includes(String(s.role));
}

async function locationId(shop: string, token: string): Promise<string> {
  const st = await state("location");
  if (st?.id) return st.id;
  const d = await gql(shop, token, `{ locations(first: 5) { nodes { id name isActive fulfillsOnlineOrders } } }`);
  const loc = (d.locations.nodes as any[]).find((l) => l.isActive && l.fulfillsOnlineOrders) || d.locations.nodes[0];
  if (!loc) throw new Error("Shopify'da lokasyon bulunamadi");
  await setState("location", { id: loc.id, name: loc.name });
  return loc.id;
}

const temizBaslik = (t: string) => t.replace(/^\s*not\s+in\s+paris\s*\/\/\s*/i, "").trim();
const BEDENLER = new Set(["xxs", "xs", "s", "m", "l", "xl", "xxl", "small", "big", "medium", "large"]);

// ---------------------------------------------------------------- URUNLER
async function urunler(shop: string, token: string) {
  const esleme: Record<string, string> = (await state("kategori_esleme")) || {};
  const vendors = Object.keys(esleme);
  if (!vendors.length) throw new Error("kategori_esleme bos (hangi marka hangi kategoriye?)");
  const q = vendors.map((v) => `vendor:'${v.replace(/'/g, "\\'")}'`).join(" OR ");

  let after: string | null = null;
  let guncel = 0;
  const yeniler: string[] = [], atlanan: string[] = [];
  do {
    const d: any = await gql(shop, token, `
      query($after: String, $q: String) {
        products(first: 50, after: $after, query: $q) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title vendor status totalInventory featuredImage { url }
                  variants(first: 20) { nodes { id title price inventoryQuantity inventoryItem { id } } } }
        }
      }`, { after, q });

    for (const p of d.products.nodes as any[]) {
      const kategori = esleme[p.vendor];
      if (!kategori) continue;
      const pid = gidNum(p.id)!;
      const ad = temizBaslik(p.title);
      const vars = p.variants.nodes as any[];
      const tek = vars.length === 1 && /^default title$/i.test(vars[0].title);
      const gorsel = p.featuredImage?.url
        ? p.featuredImage.url + (p.featuredImage.url.includes("?") ? "&" : "?") + "width=300"
        : null;

      const { data: mevcut } = await supa.from("products")
        .select("id, name, name_en, image_url, variants")
        .or(`shopify_product_id.eq.${pid},shopify_handle.eq.${p.handle}`)
        .limit(1).maybeSingle();

      if (mevcut) {
        // Bagli urun: kimlikler tazelenir, bos alanlar dolar. STOK Order'in.
        const patch: Record<string, unknown> = { shopify_product_id: pid, shopify_handle: p.handle };
        if (!mevcut.image_url && gorsel) patch.image_url = gorsel;
        if (!mevcut.name_en) patch.name_en = ad;
        if (tek) {
          patch.shopify_variant_id = gidNum(vars[0].id);
          patch.shopify_inventory_item_id = gidNum(vars[0].inventoryItem?.id);
        } else {
          const eski: any[] = Array.isArray(mevcut.variants) ? mevcut.variants : [];
          const vs = vars.map((v) => {
            const e = eski.find((x) => String(x.name || "").toLowerCase() === String(v.title).toLowerCase());
            return {
              name: e?.name || v.title,
              stock: e ? (Number(e.stock) || 0) : (Number(v.inventoryQuantity) || 0),
              shopify_variant_id: gidNum(v.id),
              inventory_item_id: gidNum(v.inventoryItem?.id),
            };
          });
          patch.variants = vs;
          patch.retail_stock = vs.reduce((s, v) => s + v.stock, 0);
        }
        const { error } = await supa.from("products").update(patch).eq("id", mevcut.id);
        if (error) throw new Error(`${ad}: ${error.message}`);
        guncel++;
        continue;
      }

      // Yeni urun: yalniz stoklu ve aktif olan, GIZLI acilir.
      if ((p.totalInventory || 0) <= 0 || p.status !== "ACTIVE") { atlanan.push(ad); continue; }
      const vs = tek ? null : vars.map((v) => ({
        name: v.title, stock: Number(v.inventoryQuantity) || 0,
        shopify_variant_id: gidNum(v.id), inventory_item_id: gidNum(v.inventoryItem?.id),
      }));
      const grupAdi = vs && vs.every((v) => BEDENLER.has(String(v.name).toLowerCase())) ? "Beden" : "Seçenek";
      const { error } = await supa.from("products").insert({
        name: ad, name_en: ad, price: Number(vars[0]?.price) || 0, currency: "TRY",
        category_id: kategori, store_id: PARIS, kitchen_destination_store_id: PARIS,
        brand: p.vendor, image_url: gorsel, is_available: false, track_stock: true,
        retail_stock: tek ? (Number(vars[0].inventoryQuantity) || 0) : vs!.reduce((s, v) => s + v.stock, 0),
        variants: vs, has_options: !tek,
        options_config: tek ? null : {
          groups: [{ name: grupAdi, options: vs!.map((v) => v.name), required: true,
                     price_modifiers: Object.fromEntries(vs!.map((v) => [v.name, 0])) }],
        },
        shopify_product_id: pid, shopify_handle: p.handle,
        shopify_variant_id: tek ? gidNum(vars[0].id) : null,
        shopify_inventory_item_id: tek ? gidNum(vars[0].inventoryItem?.id) : null,
        sort_order: 900, hh_days: [0, 1, 2, 3, 4, 5, 6],
      });
      if (error) throw new Error(`${ad} (yeni): ${error.message}`);
      yeniler.push(ad);
    }
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);

  const mesaj = `${guncel} bağlı ürün tazelendi, ${yeniler.length} yeni ürün gizli eklendi, ${atlanan.length} stoksuz atlandı`;
  await log("urunler", true, mesaj, { yeniler, atlanan });
  return { ok: true, mesaj, yeniler, atlanan };
}

// ------------------------------------------------------------- SIPARISLER
async function siparisler(shop: string, token: string) {
  const st = (await state("siparisler")) || {};
  // Ilk calismada son 24 saat; sonra son islenen siparisin zamanindan itibaren.
  const since: string = st.since || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const islenen: string[] = Array.isArray(st.islenen) ? st.islenen : [];

  const d: any = await gql(shop, token, `
    query($q: String) {
      orders(first: 50, sortKey: CREATED_AT, query: $q) {
        nodes { id name createdAt cancelledAt displayFinancialStatus
                lineItems(first: 50) { nodes { quantity title variantTitle variant { id } } } }
      }
    }`, { q: `created_at:>='${since}' financial_status:paid` });

  let sonTarih = since, dusen = 0, bakilan = 0;
  const detay: string[] = [];
  for (const o of d.orders.nodes as any[]) {
    if (o.createdAt > sonTarih) sonTarih = o.createdAt;
    if (islenen.includes(o.id) || o.cancelledAt) continue;
    bakilan++;
    for (const li of o.lineItems.nodes as any[]) {
      const vid = gidNum(li.variant?.id);
      if (!vid) continue;
      const adet = Number(li.quantity) || 0;
      // Tek varyantli urun
      const { data: p1 } = await supa.from("products").select("id, name, retail_stock")
        .eq("shopify_variant_id", vid).maybeSingle();
      if (p1) {
        await supa.from("products").update({ retail_stock: Math.max(0, (Number(p1.retail_stock) || 0) - adet) }).eq("id", p1.id);
        dusen++; detay.push(`${o.name}: ${p1.name} −${adet}`);
        continue;
      }
      // Bedenli urun: variants[].shopify_variant_id
      const { data: p2 } = await supa.from("products").select("id, name, variants")
        .contains("variants", JSON.stringify([{ shopify_variant_id: vid }])).maybeSingle();
      if (p2 && Array.isArray(p2.variants)) {
        const vs = (p2.variants as any[]).map((v) =>
          Number(v.shopify_variant_id) === vid ? { ...v, stock: Math.max(0, (Number(v.stock) || 0) - adet) } : v);
        await supa.from("products").update({
          variants: vs, retail_stock: vs.reduce((s, v) => s + (Number(v.stock) || 0), 0),
        }).eq("id", p2.id);
        dusen++;
        const beden = (vs.find((v) => Number(v.shopify_variant_id) === vid) || {}).name || li.variantTitle || "";
        detay.push(`${o.name}: ${p2.name} ${beden} −${adet}`);
      } else {
        detay.push(`${o.name}: ${li.title} (${li.variantTitle || "-"}) bağlı değil, düşülmedi`);
      }
    }
    islenen.push(o.id);
  }
  await setState("siparisler", { since: sonTarih, islenen: islenen.slice(-300), son_kontrol: new Date().toISOString() });
  const mesaj = `${bakilan} yeni sipariş, ${dusen} kalem düşüldü`;
  if (bakilan > 0) await log("siparisler", true, mesaj, detay);
  return { ok: true, mesaj, detay };
}

// ------------------------------------------------------------------- STOK
async function stok(shop: string, token: string, productId?: string) {
  const loc = await locationId(shop, token);
  let q = supa.from("products")
    .select("id, name, variants, retail_stock, shopify_inventory_item_id")
    .not("shopify_product_id", "is", null);
  if (productId) q = q.eq("id", productId);
  const { data: urunler, error } = await q;
  if (error) throw new Error(error.message);

  const quantities: { inventoryItemId: string; locationId: string; quantity: number }[] = [];
  for (const p of urunler || []) {
    if (Array.isArray(p.variants) && p.variants.length) {
      for (const v of p.variants as any[]) {
        if (v.inventory_item_id) {
          quantities.push({ inventoryItemId: gid("InventoryItem", v.inventory_item_id), locationId: loc, quantity: Math.max(0, Number(v.stock) || 0) });
        }
      }
    } else if (p.shopify_inventory_item_id) {
      quantities.push({ inventoryItemId: gid("InventoryItem", p.shopify_inventory_item_id), locationId: loc, quantity: Math.max(0, Number(p.retail_stock) || 0) });
    }
  }
  for (let i = 0; i < quantities.length; i += 100) {
    const d: any = await gql(shop, token, `
      mutation($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) { userErrors { field message } }
      }`, { input: { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities: quantities.slice(i, i + 100) } });
    const hata = d.inventorySetQuantities?.userErrors || [];
    if (hata.length) throw new Error("Shopify stok: " + hata.map((e: any) => e.message).join("; "));
  }
  await setState("son_push", { at: new Date().toISOString(), adet: quantities.length, product_id: productId || null });
  const mesaj = `${quantities.length} beden/ürün stoğu Shopify'a yazıldı`;
  if (!productId) await log("stok", true, mesaj);
  return { ok: true, mesaj, adet: quantities.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  if (!(await yetkili(req, url))) return json({ error: "yetkisiz" }, 401);

  const shop = await cfg("shopify_shop");
  const token = await cfg("shopify_admin_token");
  // Anahtar girilmeden cron her 5 dk calisir; kayit kirletmesin, sessiz don.
  if (!shop || !token) return json({ ok: false, error: "Shopify ayarı yok: Ayarlar → Shopify'dan mağaza adresi ve erişim anahtarını gir" });

  const body = await req.json().catch(() => ({}));
  try {
    if (action === "urunler")    return json(await urunler(shop, token));
    if (action === "siparisler") return json(await siparisler(shop, token));
    if (action === "stok")       return json(await stok(shop, token, body?.product_id));
    return json({ error: "action: urunler | siparisler | stok" }, 400);
  } catch (e) {
    const mesaj = (e as Error).message || String(e);
    console.error("shopify-sync", action, mesaj);
    await log(action || "?", false, mesaj);
    return json({ ok: false, error: mesaj }, 500);
  }
});
