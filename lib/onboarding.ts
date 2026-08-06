import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Karşılama ekranının gösterilip gösterilmediği.
 *
 * Sunucuda değil cihazda tutuluyor: karşılama ekranı oturum AÇILMADAN ÖNCE
 * gösteriliyor, yani o anda yazılacak bir kullanıcı satırı henüz yok.
 */
export const ONBOARDING_SEEN_KEY = "remory.onboardingSeen";

/**
 * Karşılama ekranı daha önce gösterildi mi.
 *
 * Depolama okunamazsa `true` dönüyor — yani karşılama ATLANIYOR. Ters tercih
 * (false dönüp ekranı göstermek) daha zararlı olurdu: okuma kalıcı olarak
 * başarısızsa yazma da muhtemelen başarısızdır, ve kullanıcı her açılışta aynı
 * karşılama ekranına düşüp uygulamaya hiç giremezdi. Karşılamayı bir kez
 * kaçırmak, uygulamaya hiç girememekten iyi.
 */
export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === "1";
  } catch {
    return true;
  }
}

/**
 * Karşılamayı görüldü olarak işaretler.
 *
 * Hatası yutuluyor: işaretleme başarısız olursa kullanıcı karşılamayı bir kez
 * daha görür — can sıkıcı ama zararsız. Buranın patlaması giriş ekranına
 * geçişi engellememeli.
 */
export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    // yukarıdaki gerekçe
  }
}
