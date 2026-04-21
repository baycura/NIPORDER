import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session,   setSession]   = useState(undefined);
  const [staffUser, setStaffUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadStaff(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) loadStaff(session.user.id);
      else setStaffUser(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadStaff = async (authId) => {
    const { data } = await supabase.from("staff").select("*").eq("auth_id", authId).single();
    setStaffUser(data);
  };

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = async () => { await supabase.auth.signOut(); setStaffUser(null); };

  return (
    <AuthContext.Provider value={{
      session, staffUser,
      loading:   session === undefined,
      isManager: staffUser?.role === "manager" || staffUser?.role === "owner",
      isKitchen: staffUser?.role === "kitchen",
      isCashier: staffUser?.role === "cashier",
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);