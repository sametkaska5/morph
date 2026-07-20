import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { QUERY_CACHE_STORAGE_KEY } from "./entryMutations";

type AuthState = {
  session: Session | null;
  loading: boolean;
  user: Session["user"] | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // getSession başarısız olursa (bozuk token, AsyncStorage hatası) loading
      // sonsuza kadar true kalıp uygulamayı boş ekranda kilitliyordu — hata da
      // olsa oturumsuz devam edip auth ekranını gösteriyoruz.
      .catch(() => setSession(null))
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Sorgu cache'i AsyncStorage'a kalıcı yazılıyor (bkz. _layout.tsx
      // PersistQueryClientProvider) ve anahtarların bir kısmı user_id içermiyor.
      // Çıkış yapıldığında temizlemezsek, aynı cihazda başka bir hesapla giriş
      // yapan kullanıcı bir önceki kullanıcının fotoğraf/not verisini cache'ten
      // görebiliyordu. Çıkışta hem bellekteki hem diskteki cache'i siliyoruz.
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY).catch(() => {});
      }
      setSession((prev) => (prev?.access_token === newSession?.access_token ? prev : newSession));
    });

    return () => listener.subscription.unsubscribe();
  }, [queryClient]);

  const value: AuthState = { session, loading, user: session?.user ?? null };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
