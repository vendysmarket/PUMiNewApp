import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { User, Session, Provider } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pumiInvoke } from "@/lib/pumiInvoke";

type Tier = "FREE" | "GEN_Z" | "MILLENIAL";

// Checkout via pumiInvoke
const startBillingCheckout = async (_token: string, checkoutTier: string) => {
  return pumiInvoke<{ url?: string }>("/billing/checkout-session", { tier: checkoutTier });
};

type UserProfile = {
  id: string;
  email: string | null;
  tier: Tier | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoggedIn: boolean;
  isReady: boolean;

  profile: UserProfile | null;
  tier: Tier;
  hasPaidAccess: boolean;

  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithProvider: (provider: Provider) => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;

  refresh: () => Promise<void>;
  refreshProfile: () => Promise<void>;

  startCheckout: (tier: "GEN_Z" | "MILLENIAL") => Promise<void>;

  // backward compatibility
  member: { auth?: { email?: string }; customFields?: Record<string, string> } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeTier(v: any): Tier {
  if (!v || typeof v !== "string") return "FREE";
  const normalized = v.toUpperCase().replace(/[-_\s]/g, "_");
  if (normalized === "GEN_Z" || normalized === "GENZ") return "GEN_Z";
  if (normalized === "MILLENIAL" || normalized === "MILLENNIAL") return "MILLENIAL";
  if (normalized === "FREE") return "FREE";
  return "FREE";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  // ---- Auth bootstrap
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setIsReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ---- Profile fetch
  const fetchProfile = useCallback(async (u: User | null) => {
    setProfileReady(false);

    if (!u?.id) {
      setProfile(null);
      setProfileReady(true);
      return;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("id,email,tier,stripe_customer_id,stripe_subscription_id")
      .eq("id", u.id)
      .maybeSingle();

    if (error) {
      console.error("[Auth] profile fetch error:", error.message);
      setProfile(null);
      setProfileReady(true);
      return;
    }

    if (!data) {
      const { data: inserted, error: insErr } = await supabase
        .from("user_profiles")
        .insert({
          id: u.id,
          email: u.email ?? null,
          tier: "FREE",
          stripe_customer_id: null,
          stripe_subscription_id: null,
        })
        .select("id,email,tier,stripe_customer_id,stripe_subscription_id")
        .single();

      if (insErr) {
        console.error("[Auth] profile insert error:", insErr.message);
        setProfile(null);
        setProfileReady(true);
        return;
      }

      setProfile({
        ...inserted,
        tier: normalizeTier(inserted.tier),
      } as UserProfile);
      setProfileReady(true);
      return;
    }

    setProfile({
      ...(data as any),
      tier: normalizeTier((data as any).tier),
    } as UserProfile);

    setProfileReady(true);
  }, []);

  useEffect(() => {
    fetchProfile(user);
  }, [user, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    await fetchProfile(user);
  }, [fetchProfile, user]);

  // ---- Auth actions
  const signUp = useCallback(async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error: (error as any) ?? null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: (error as any) ?? null };
  }, []);

  const signInWithProvider = useCallback(async (provider: Provider) => {
    const redirectUrl = `${window.location.origin}/app/chat`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
      },
    });
    return { error: (error as any) ?? null };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  }, []);

  const refresh = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setSession(session);
    setUser(session?.user ?? null);
    await fetchProfile(session?.user ?? null);
  }, [fetchProfile]);

  // ---- Checkout via pumi-proxy Edge Function
  const startCheckout = useCallback(async (checkoutTier: "GEN_Z" | "MILLENIAL") => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      console.error("[Auth] No access token available for checkout");
      return;
    }

    try {
      const data = await startBillingCheckout(token, checkoutTier);
      
      if (data?.url) {
        window.location.href = data.url;
      } else {
        console.error("[Auth] No checkout URL returned from API");
      }
    } catch (error) {
      console.error("[Auth] Checkout session creation failed:", error);
    }
  }, []);

  const isLoggedIn = !!user?.id;

  const tier: Tier = useMemo(() => {
    if (!profile) return "FREE";
    return normalizeTier(profile.tier);
  }, [profile]);

  const hasPaidAccess = tier !== "FREE";

  // Backward compatible member object
  const member = user ? { auth: { email: user.email }, customFields: (user.user_metadata as any) || {} } : null;

  // isReady: auth + profile is ready
  const ready = isReady && profileReady;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoggedIn,
        isReady: ready,

        profile,
        tier,
        hasPaidAccess,

        signUp,
        signIn,
        signInWithProvider,
        logout,
        refresh,
        refreshProfile,

        startCheckout,
        member,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
