import { supabase } from "./supabase.js";

// Resolve host display info (name/avatar) from the shared `customers` pool.
// ride_posts.user_id === auth.users.id === customers.auth_user_id
export async function fetchHostsByAuthIds(authIds) {
  const ids = [...new Set(authIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await supabase
    .from("customers")
    .select("auth_user_id, name, avatar_url")
    .in("auth_user_id", ids);
  const map = {};
  (data || []).forEach((c) => { map[c.auth_user_id] = c; });
  return map;
}
