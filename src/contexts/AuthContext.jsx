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
      if (sess?.user) {
        // Try staff first
        const { data: s } = await supabase.from("staff").select("*").eq("auth_id", sess.user.id).maybeSingle();
        if (s) {
          setStaffUser(s);
          setCustomer(null);
          // Update last_login (fire and forget)
          supabase.from("staff").update({ last_login: new Date().toISOString() }).eq("id", s.id);
        } else {
          // Try customer
          const email = sess.user.email;
          const { data: c } = await supabase.from("customers").select("*").or("auth_user_id.eq." + sess.user.id + ",email.eq." + email).maybeSingle();
          if (c) {
            // Backfill auth_user_id if missing
            if (!c.auth_user_id) {
              await supabase.from("customers").update({ auth_user_id: sess.user.id, avatar_url: sess.user.user_metadata?.avatar_url, name: c.name || sess.user.user_metadata?.full_name }).eq("id", c.id);
            }
            setCustomer(c);
            setStaffUser(null);
          } else {
            // Auto-create customer for Google sign-in
            const md = sess.user.user_metadata || {};
            const { data: newC } = await supabase.from("customers").insert({
              name: md.full_name || md.name || email,
              email,
              auth_user_id: sess.user.id,
              avatar_url: md.avatar_url || md.picture,
              tier: "bronze",
            }).select().single();
            setCustomer(newC || null);
            setStaffUser(null);
          }
        }
      } else {
        setStaffUser(null);
        setCustomer(null);
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => loadSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => loadSession(s));
    return () => { mounted = false; subscription?.unsubscribe(); };
  }, []);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
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

  // Role flags
  const role = staffUser?.role;
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
