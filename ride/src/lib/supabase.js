import { createClient } from "@supabase/supabase-js";

// Same project as the order/reservation modules => shared membership pool.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
