import { createClient } from "@supabase/supabase-js";
import { demoSupabase } from "./demoSupabase.js";

// Same project as the order/reservation modules => shared membership pool.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When real keys are absent (e.g. the public preview deploy), fall back to an
// in-memory demo backend so the whole app stays browsable. With real keys this
// is the genuine supabase-js client and behaviour is unchanged.
export const IS_DEMO = !url || !key;
export const supabase = IS_DEMO ? demoSupabase : createClient(url, key);
