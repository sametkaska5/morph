import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/useAuth";
import { hasSeenOnboarding } from "@/lib/onboarding";

/**
 * Acilis yonlendirmesi.
 *
 * Uc yol var ve sirasi onemli:
 *  1. Oturum varsa -> karsilama HIC gosterilmez. Uygulamayi daha once kullanmis
 *     birine "hos geldin, iste Remory" demek anlamsiz; ustelik uygulamayi
 *     silip yeniden kuran kullanicida cihazdaki bayrak sifirlanmis olsa bile
 *     oturum geri geldigi icin dogru davranis korunuyor.
 *  2. Karsilama gorulmemisse -> karsilama ekrani.
 *  3. Diger her durumda -> giris ekrani.
 *
 * Karar verilene kadar null render ediliyor: AsyncStorage okumasi birkac
 * milisaniye suruyor ve bu surede bir ekran gosterip sonra baskasina atlamak
 * goz kirpmasi yaratirdi.
 */
export default function Index() {
  const { session, loading } = useAuth();
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    hasSeenOnboarding().then(setSeenOnboarding);
  }, []);

  if (loading || seenOnboarding === null) return null;

  // TEST ICIN: Her zaman onboarding ekranini goster.
  // Gosterimi gercek haline dondurmek icin asagidaki satirlari aktif et.
  
  // if (!session && !seenOnboarding) {
  //   return <Redirect href="/(onboarding)/welcome" />;
  // }
  // return <Redirect href="/(auth)" />;
  
  return <Redirect href="/(onboarding)/welcome" />;
}
