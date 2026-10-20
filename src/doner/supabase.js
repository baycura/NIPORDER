import { createClient } from "@supabase/supabase-js";
import { zamanAsimiliFetch } from "../lib/supabase.js";

// DONER DEFTERI — kendi oturumu, kendi istemcisi.
//
// Doner kullanicilari kafe personeli degildir (staff'ta yok). Ana istemcinin
// AuthContext'i her personel-disi oturuma customers satiri acar; bu yuzden
// doner oturumu ayri bir storageKey ile tutulur (mutfakSupabase.js deseni).
// Ayni Supabase projesi: kafede satilan doner urunleri ve QR siparisleri
// doner_ozet ile gelire kendiliginden girer; kafe tablolari RLS'le kapali.
export const doner = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  global: { fetch: zamanAsimiliFetch },
  auth: { storageKey: "nip-doner-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
