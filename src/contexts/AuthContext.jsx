import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session,    setSession]    = useState(undefined);
  const [staffUser,  setStaffUser]  = useState(null);
  const [customer,   setCustomer]   = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) loadProfile(session.user);
      else { setStaffUser(null); setCustomer(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (authUser) => {
    if (!authUser) return;
    const { data: staff } = await supabase
      .from("staff").select("*").eq("auth_id", authUser.id).maybeSingle();
    setStaffUser(staff || null);

    if (!staff) {
      let { data: cust } = await supabase
        .from("customers").select("*").eq("auth_user_id", authUser.id).maybeSingle();

      if (!cust && authUser.email) {
        const meta = authUser.user_metadata || {};
        const insertRes = await supabase.from("customers").insert({
          auth_user_id: authUser.id,
          name:         meta.full_name || meta.name || authUser.email.split("@")[0],
          email:        authUser.email,
          provider:     authUser.app_metadata?.provider || "google",
          avatar_url:   meta.avatar_url || meta.picture || null,
          tier:         "bronze",
          points:       0,
        }).select().single();
        cust = insertRes.data;
      }
      setCustomer(cust || null);
    }
  };

  const signIn  = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signInWithGoogle = (redirectTo) =>
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo || window.location.origin + "/menu" },
    });

  const signOut = async () => {
    await supabase.auth.signOut();
    setStaffUser(null);
    setCustomer(null);
  };

  return (
    <AuthContext.Provider value={{
      session, staffUser, customer,
      loading:   session === undefined,
      isManager: staffUser?.role === "manager" || staffUser?.role === "owner",
      isKitchen: staffUser?.role === "kitchen",
      isCashier: staffUser?.role === "cashier",
      signIn, signInWithGoogle, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
