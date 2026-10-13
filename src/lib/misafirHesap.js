import { supabase } from "./supabase.js";
import { businessDayStart } from "./businessDay.js";

// "MISAFIR N" HESABI — Masalar, Siparis ve parti izgarasi AYNI kurali kullanir.
//
// Numara isletme gunu icindeki en buyuk "Misafir N"in bir fazlasi. Numara
// etiketten ibaret ama tezgahta ise yarar: "3 numara hazir" diye seslenilir.
// Numara DOKUNUS ANINDA hesaplanir. Masalar eskiden sayfa acilisinda bir kez
// hesapliyordu; iki cihaz ayni numarayi verebiliyordu. Siparis ekrani ise
// numarasiz "Misafir" aciyordu (30 gunde 758 hesabin 367'si); ayni adli
// hesaplar listede birbirine karisiyordu.
const BOS_MAGAZA = ["00000000-0000-0000-0000-000000000000"];

export async function sonrakiMisafirNo(storeIds) {
  const { data } = await supabase.from("orders").select("customer_name")
    .in("origin_store_id", storeIds?.length ? storeIds : BOS_MAGAZA)
    .gte("created_at", businessDayStart().toISOString())
    .like("customer_name", "Misafir %");
  const enBuyuk = (data || []).reduce((m, o) => {
    const n = parseInt(String(o.customer_name).replace("Misafir ", ""), 10);
    return isFinite(n) && n > m ? n : m;
  }, 0);
  return enBuyuk + 1;
}

// Tek dokunusla hesap acar. Donus: { data, error, no }.
export async function misafirHesapAc({ staffUser, table = null }) {
  const magaza = table?.store_id || staffUser?.store_ids?.[0];
  if (!magaza) return { data: null, error: new Error("Mağaza bulunamadı"), no: null };
  const no = await sonrakiMisafirNo(staffUser?.store_ids);
  const { data, error } = await supabase.from("orders").insert({
    table_id: table?.id || null, customer_name: "Misafir " + no,
    origin_store_id: magaza, staff_id: staffUser?.id,
    status: "open", subtotal: 0, total: 0, discount_amount: 0,
  }).select().single();
  return { data, error, no };
}
