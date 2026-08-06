import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "./database.types";

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// <Database> tip parametresi tüm sorguları şemaya bağlar: yanlış tablo/kolon
// adı derlemede yakalanır, select sonuçları elle cast gerektirmeden tiplenir.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Oturum yenilemesini uygulamanın ön/arka plan durumuna bağlar.
 *
 * `autoRefreshToken: true` tek başına yetmiyor: supabase-js yenilemeyi bir JS
 * zamanlayıcısıyla yapıyor, işletim sistemi ise arka plandaki uygulamanın
 * zamanlayıcılarını kısıyor ve bir süre sonra tamamen donduruyor. Uygulama uzun
 * süre arka planda kaldığında yenileme hiç çalışmıyor; kullanıcı geri döndüğünde
 * elindeki access token süresi dolmuş oluyor ve ilk istekler 401 alıyor. Ekranda
 * bunun karşılığı "her yer boş / hata" — kullanıcı için sebepsiz bir çıkış gibi
 * görünüyor.
 *
 * `startAutoRefresh()` yalnızca zamanlayıcıyı kurmuyor, çağrıldığı anda bir
 * yenileme denemesi de yapıyor. Öne geldiğimizde çağırmak bu yüzden önemli:
 * arka planda kaçırılan yenileme, ilk veri isteğinden ÖNCE telafi ediliyor.
 *
 * Süreç boyunca bir kez çağrılır (bkz. app/_layout.tsx). Abonelikten çıkma
 * fonksiyonu testler için dönülüyor.
 */
export function registerAuthAutoRefresh() {
  const sync = (state: AppStateStatus) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  // İlk durumu da uygula: uygulama zaten önplandayken kuruluyoruz, ilk "change"
  // olayını beklersek o ana kadar yenileme yapılmaz.
  sync(AppState.currentState);

  const subscription = AppState.addEventListener("change", sync);
  return () => subscription.remove();
}
