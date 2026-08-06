import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/useAuth";
import { hasSeenOnboarding } from "@/lib/onboarding";

/**
 * Açılış yönlendirmesi.
 *
 * Üç yol var ve sırası önemli:
 *  1. Oturum varsa → karşılama HİÇ gösterilmez. Uygulamayı daha önce kullanmış
 *     birine "hoş geldin, işte Remory" demek anlamsız; üstelik uygulamayı
 *     silip yeniden kuran kullanıcıda cihazdaki bayrak sıfırlanmış olsa bile
 *     oturum geri geldiği için doğru davranış korunuyor.
 *  2. Karşılama görülmemişse → karşılama ekranı.
 *  3. Diğer her durumda → giriş ekranı.
 *
 * Karar verilene kadar `null` render ediliyor: AsyncStorage okuması birkaç
 * milisaniye sürüyor ve bu sürede bir ekran gösterip sonra başkasına atlamak
 * göz kırpması yaratırdı.
 */
export default function Index() {
  const { session, loading } = useAuth();
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    hasSeenOnboarding().then(setSeenOnboarding);
  }, []);

  if (loading || seenOnboarding === null) return null;

  if (!session && !seenOnboarding) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  return <Redirect href="/(auth)" />;
}
