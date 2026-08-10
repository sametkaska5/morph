/**
 * Dokunsal geri bildirim (haptics) — ince ve HATA VERMEZ bir sarmalayıcı.
 *
 * NEDEN SARMALAYICI, doğrudan expo-haptics değil:
 *
 * 1) NATIVE MODÜL HER DERLEMEDE OLMAYABİLİR. Bu proje expo-dev-client
 *    kullanıyor, yani JS güncellemesi (eas update) cihaza gidebilir ama native
 *    taraf ancak yeni bir derlemeyle gelir. expo-haptics native modülü yoksa
 *    modülü import etmek ÇALIŞMA ANINDA hata fırlatıyor — sarmalayıcı olmasa
 *    eski bir derlemede uygulama açılışta çökerdi. Burada `require` tembel ve
 *    try/catch içinde: modül yoksa titreşim sessizce devre dışı kalıyor,
 *    uygulamanın geri kalanı hiç etkilenmiyor.
 *
 * 2) TİTREŞİM ASLA HATA YÜZEYİ OLMAMALI. Kaydetme başarılıyken titreşim
 *    başarısız olursa kullanıcıya hata göstermenin bir anlamı yok — kayıt oldu.
 *    Bütün çağrılar "ateşle ve unut", reddedilen promise'ler yutuluyor.
 *
 * ANDROID NOTU: app.json'daki `android.permissions` AÇIK BİR LİSTE, yani orada
 * yazmayan izin derlemeye hiç girmiyor. VIBRATE oraya eklenmeden bu dosyadaki
 * hiçbir çağrı Android'de bir şey yapmaz (hata da vermez — sessizce yok sayılır).
 *
 * KULLANIM KURALI: dokunsal geri bildirim NOKTALAMA işaretidir, arka plan sesi
 * değil. Yalnızca kullanıcının bir şeyi "tamamladığı" anlarda kullanıyoruz —
 * her dokunuşta titreyen uygulama premium değil ucuz hissettirir. Bu yüzden
 * sekme değişimi, kaydırma, sıradan buton dokunuşları BİLEREK dışarıda.
 */

type HapticsModule = typeof import("expo-haptics");

// undefined = henüz denenmedi, null = modül yok (native taraf eksik).
let cached: HapticsModule | null | undefined;

function haptics(): HapticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // Tembel require: modül yoksa hata BURADA çıkıyor ve yutuluyor. Statik
    // import olsaydı hata dosya yüklenirken çıkardı, yani yakalanamazdı.
    cached = require("expo-haptics") as HapticsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Çağrıyı çalıştırır; modül yoksa ya da native taraf patlarsa sessizce geçer. */
function fire(run: (h: HapticsModule) => Promise<void>) {
  const h = haptics();
  if (!h) return;
  try {
    run(h).catch(() => {});
  } catch {
    // Senkron fırlatan bir native uygulama ihtimaline karşı.
  }
}

/** İşlem tamamlandı: kayıt kaydedildi, program yazıldı. */
export function hapticSuccess() {
  fire((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
}

/** Geri alınamaz bir şey oluyor: silme onayı. */
export function hapticWarning() {
  fire((h) => h.notificationAsync(h.NotificationFeedbackType.Warning));
}

/** Bir seçim değişti: hafta şeridinde güne dokunma, ölçüm tipi değiştirme. */
export function hapticSelection() {
  fire((h) => h.selectionAsync());
}

/** Hafif fiziksel karşılık: kart çevirme gibi doğrudan manipülasyon jestleri. */
export function hapticLight() {
  fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Light));
}

/** Test yardımcısı: modül önbelleğini sıfırlar. Üretimde çağrılmıyor. */
export function resetHapticsCacheForTests() {
  cached = undefined;
}
