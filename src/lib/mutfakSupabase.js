import { createClient } from "@supabase/supabase-js";
import { zamanAsimiliFetch } from "./supabase.js";

// Doner mutfaginin kendi girisi icin AYRI istemci.
//
// Mutfak personeli NIP'in staff tablosunda degil; tek bir e-posta/sifre
// hesabiyla (pano uygulamasindaki hesap) /mutfak-rapor'a girer. Bu oturum ana
// istemciye (lib/supabase.js) degmemeli:
//   - AuthContext, personel satiri olmayan her oturuma customers satiri acar;
//     mutfak hesabi "uye" olarak belirirdi.
//   - Sahibin telefonunda personel oturumu ile mutfak oturumu yan yana
//     yasayabilmeli; ayni storageKey olsa biri digerinin ustune yazardi.
// reserve.js ile ayni desen: farkli storageKey, kendi oturumu.
//
// Tembel kurulur: personel sayfalari bu modulu hic yuklemez, "Multiple
// GoTrueClient" uyarisi yalniz mutfak sayfasinda ve zararsizdir.
let istemci = null;
export function mutfakClient() {
  if (!istemci) {
    istemci = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      global: { fetch: zamanAsimiliFetch },
      auth: { storageKey: "nip-mutfak-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return istemci;
}
