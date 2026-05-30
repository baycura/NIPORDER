import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const RideAuthContext = createContext(null);

/**
 * Ride auth. Uses the SAME Supabase project + `customers` table as the order
 * module, so a member who signs in here is the same person as in order.
 * We only deal with the "customer" side of the pool (no staff roles).
 */
export function RideAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async (sess) => {
      if (!mounted) return;
      setSession(sess);
      try {
        if (sess?.user) {
          const uid = sess.user.id;
          const email = sess.user.email;
          const md = sess.user.user_metadata || {};

          // Look up the shared membership pool by auth id, then email.
          let { data: c } = await supabase
            .from("customers").select("*").eq("auth_user_id", uid).maybeSingle();

          if (!c && email) {
            const r = await supabase
              .from("customers").select("*").eq("email", email).maybeSingle();
            c = r.data;
            if (c && !c.auth_user_id) {
              await supabase.from("customers").update({
                auth_user_id: uid,
                avatar_url: c.avatar_url || md.avatar_url || md.picture,
                name: c.name || md.full_name || md.name,
              }).eq("id", c.id);
            }
          }

          if (!c) {
            // First time on any NIP module -> create the shared member record.
            const r = await supabase.from("customers").insert({
              name: md.full_name || md.name || email,
              email,
              auth_user_id: uid,
              avatar_url: md.avatar_url || md.picture,
              tier: "bronze",
            }).select().single();
            c = r.data;
          }
          setCustomer(c || null);
        } else {
          setCustomer(null);
        }
      } catch (e) {
        console.error("ride auth load error", e);
      }
      setLoading(false);
    };

    supabase.auth.getSession().then((r) => load(r.data.session));
    const sub = supabase.auth.onAuthStateChange((_e, s) => load(s));
    return () => { mounted = false; sub?.data?.subscription?.unsubscribe(); };
  }, []);

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/" },
    });

  const signInWithEmail = (email) =>
    supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/" },
    });

  const signOut = async () => {
    await supabase.auth.signOut();
    setCustomer(null);
  };

  const value = {
    session,
    customer,
    userId: session?.user?.id || null,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signOut,
  };
  return <RideAuthContext.Provider value={value}>{children}</RideAuthContext.Provider>;
}

export const useRideAuth = () => useContext(RideAuthContext);
