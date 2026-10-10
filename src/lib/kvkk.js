// KVKK aydinlatma + uyelik acik rizasi.
// Guncel metin DB'de (kvkk_documents.is_current); bu dosya istemci yardimcilari.
// Checkbox zorunlu — "kayit olarak kabul" metni KULLANILMAZ (acik riza).

import { supabase } from "./supabase.js";

const PENDING_KEY = "nip_kvkk_pending";

export function kvkkPendingKaydet(version) {
  try { sessionStorage.setItem(PENDING_KEY, version); } catch { /* gizli mod */ }
}

export function kvkkPendingOku() {
  try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
}

export function kvkkPendingTemizle() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* gizli mod */ }
}

/** Guncel KVKK belgesi (RPC). Yoksa null. */
export async function kvkkGuncelGetir() {
  const { data, error } = await supabase.rpc("nip_kvkk_guncel");
  if (error) {
    console.warn("kvkk guncel okunamadi", error.message);
    return null;
  }
  return data || null;
}

/** Oturumlu uye icin kabul kaydi. */
export async function kvkkKabulEt(version, source = "signup") {
  const { data, error } = await supabase.rpc("nip_kvkk_kabul", {
    p_version: version,
    p_source: source,
  });
  if (error) return { ok: false, error };
  return { ok: true, data };
}

/** Uyenin guncel surumu kabul edip etmedigi. */
export function kvkkEksikMi(customer, guncelVersion) {
  if (!customer || !guncelVersion) return false;
  return customer.kvkk_version !== guncelVersion;
}
