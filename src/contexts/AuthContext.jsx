import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [staffUser, setStaffUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSession = async (sess) => {
      if (!mounted) return;
      setSession(sess);
      try {
        if (sess && sess.user) {
          const userId = sess.user.id;
          const userEmail = sess.user.email;

          // Try staff first
          const staffRes = await supabase.from("staff").select("*").eq("auth_id", userId).maybeSingle();
          const s = staffRes && staffRes.data;

          if (s) {
            setStaffUser(s);
            setCustomer(null);
            // Update last_login (fire and forget)
            supabase.from("staff").update({ last_login: new Date().toISOString() }).eq("id", s.id);
          } else {
            // Try customer by auth_user_id first
            let cRes = await supabase.from("customers").select("*").eq("auth_user_id", userId).maybeSingle();
            let c = cRes && cRes.data;

            // If not found, try by email
            if (!c && userEmail) {
              const cRes2 = await supabase.from("customers").select("*").eq("email", userEmail).maybeSingle();
              c = cRes2 && cRes2.data;
            }

            if (c) {
              if (!c.auth_user_id) {
                const md = sess.user.user_metadata || {};
                await supabase.from("customers").update({
                  auth_user_id: userId,
                  avatar_url: md.avatar_url || md.picture,
                  name: c.name || md.full_name || md.name,
                }).eq("id", c.id);
              }
              setCustomer(c);
              setStaffUser(null);
            } else {
              // Auto-create customer
              const md = sess.user.user_metadata || {};
              const newRes = await supabase.from("customers").insert({
                name: md.full_name || md.name || userEmail,
                email: userEmail,
                auth_user_id: userId,
                avatar_url: md.avatar_url || md.picture,
                tier: "bronze",
              }).select().single();
              setCustomer((newRes && newRes.data) || null);
              setStaffUser(null);
            }
          }
        } else {
          setStaffUser(null);
          setCustomer(null);
        }
      } catch (e) {
        console.error("Session load error", e);
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(function(res) { loadSession(res.data.session); });
    const sub = supabase.auth.onAuthStateChange(function(_event, s) { loadSession(s); });
    return function() { mounted = false; if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe(); };
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/menu" },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setStaffUser(null);
    setCustomer(null);
  };

  const role = staffUser && staffUser.role;
  const isAdmin   = role === "admin";
  const isManager = role === "admin" || role === "manager" || role === "owner";
  const isWaiter  = role === "waiter" || role === "cashier";
  const isKitchen = role === "kitchen";
  const isCashier = role === "cashier" || role === "waiter";

  return (
    <AuthContext.Provider value={{
      session, staffUser, customer, loading,
      signIn, signInWithGoogle, signOut,
      isAdmin, isManager, isWaiter, isKitchen, isCashier,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
