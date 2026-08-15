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

    // Musteri kaydini bul (auth_user_id -> email), yoksa olustur. Personel de
    // musteri olabilir: ayni Google hesabi hem staff hem customer tasiyabilir.
    const resolveCustomer = async (sess) => {
      const userId = sess.user.id;
      const userEmail = sess.user.email;
      const md = sess.user.user_metadata || {};

      let cRes = await supabase.from("customers").select("*").eq("auth_user_id", userId).maybeSingle();
      let c = cRes && cRes.data;

      if (!c && userEmail) {
        const cRes2 = await supabase.from("customers").select("*").eq("email", userEmail).maybeSingle();
        c = cRes2 && cRes2.data;
      }

      if (c) {
        if (!c.auth_user_id) {
          await supabase.from("customers").update({
            auth_user_id: userId,
            avatar_url: md.avatar_url || md.picture,
            name: c.name || md.full_name || md.name,
          }).eq("id", c.id);
        }
        return c;
      }

      const newRes = await supabase.from("customers").insert({
        name: md.full_name || md.name || userEmail,
        email: userEmail,
        auth_user_id: userId,
        avatar_url: md.avatar_url || md.picture,
        tier: "bronze",
      }).select().single();
      if (newRes && newRes.error) console.error("Musteri kaydi acilamadi", newRes.error);
      return (newRes && newRes.data) || null;
    };

    const loadSession = async (sess) => {
      if (!mounted) return;
      setSession(sess); // ALWAYS update session for token refresh
      const __uid = sess?.user?.id || null;
      if (window.__nipLastUid === __uid) return; // skip staff/customer DB query only
      window.__nipLastUid = __uid;
      try {
        if (sess && sess.user) {
          const userId = sess.user.id;

          // Try staff first
          const staffRes = await supabase.from("staff").select("*").eq("auth_id", userId).maybeSingle();
          const s = staffRes && staffRes.data;

          if (s) {
            if (s.is_active === false) {
              // Pasif personel: giris yapamaz, musteri hesabi da acilmaz
              setStaffUser(null);
              setCustomer(null);
            } else {
              setStaffUser(s);
              // Update last_login (fire and forget)
              supabase.from("staff").update({ last_login: new Date().toISOString() }).eq("id", s.id);
              // Personel musteri menusunu actiginda uye profili de calissin
              setCustomer(await resolveCustomer(sess));
            }
          } else {
            setCustomer(await resolveCustomer(sess));
            setStaffUser(null);
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
    window.__nipLastUid = undefined; // ayni hesapla yeniden giriste profil tekrar yuklensin
    setStaffUser(null);
    setCustomer(null);
  };

  const role = staffUser && staffUser.role;
  const isAdmin   = role === "admin";
  const isManager = role === "admin" || role === "manager" || role === "owner";
  const isWaiter  = role === "waiter" || role === "cashier" || role === "parttime";
  const isKitchen = role === "kitchen";
  const isCashier = role === "cashier" || role === "waiter" || role === "parttime";
  const isViewer  = role === "viewer";
  const isParttime = role === "parttime";

  return (
    <AuthContext.Provider value={{
      session, staffUser, customer, loading,
      signIn, signInWithGoogle, signOut,
      isAdmin, isManager, isWaiter, isKitchen, isCashier, isViewer, isParttime,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
