import * as Sentry from "@sentry/react-native";

/**
 * İnce bir hata-izleme katmanı.
 *
 * Amaç: üretimde SESSİZCE başarısız olan yerleri (senkron mutation'ları, arka
 * plan işleri) görünür kılmak. Bugüne kadar bu hatalar yalnızca console'a
 * gidiyordu — gerçek bir kullanıcının senkronu patlasa haberimiz olmuyordu.
 *
 * Tasarım: Sentry YALNIZCA `EXPO_PUBLIC_SENTRY_DSN` tanımlıysa başlatılır. DSN
 * yoksa katman tam bir no-op'tur (yalnızca console) — kişisel/geliştirme
 * kullanımında ekstra ağ trafiği ya da kurulum gerektirmez. Böylece bu dosya
 * eklenmeden önceki davranış birebir korunur; DSN eklenince izleme kendiliğinden
 * devreye girer.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
let enabled = false;

export function initMonitoring() {
  if (!DSN) {
    console.log("[monitoring] DSN yok — Sentry devre dışı (yalnızca console).");
    return; // DSN yok -> Sentry hiç başlatılmaz (no-op katman)
  }

  try {
    Sentry.init({
      dsn: DSN,
      // Kişisel bir günlük uygulaması — kullanıcıyı tanımlayan veri toplamıyoruz.
      sendDefaultPii: false,
    });
    enabled = true;
    console.log("[monitoring] Sentry etkin — hatalar panoya gönderilecek.");
  } catch (err) {
    // İzleme opsiyonel bir özellik: init'in kendisi patlasa bile uygulama
    // açılışı ASLA bundan etkilenmemeli.
    console.warn("[monitoring] Sentry başlatılamadı:", err);
  }
}

/**
 * Bir hatayı izleme servisine bildirir (etkinse) ve HER durumda console'a yazar.
 * `context` ile hangi işlemin patladığını (örn. { where: "saveEntry" })
 * etiketleyebilirsin — Sentry'de "extra" olarak görünür.
 *
 * enabled=false iken davranış eski console.error ile aynıdır, o yüzden çağrı
 * yerlerinde eski log'ların yerine güvenle geçebilir.
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (enabled) {
    try {
      Sentry.captureException(toError(error), context ? { extra: context } : undefined);
    } catch {
      // Bildirim başarısız olursa yut — bir hatayı raporlarken yeni hata üretmeyelim.
    }
  }
  if (context) console.error("[monitoring]", error, context);
  else console.error("[monitoring]", error);
}

/**
 * Herhangi bir değeri Sentry'nin düzgün işleyeceği bir `Error` nesnesine çevirir.
 *
 * Sorun: Supabase PostgrestError / AuthError / StorageError nesneleri `Error`
 * sınıfından türemiyor — düz obje. Sentry bunları `captureException`'a verince
 * "Object captured as exception with keys: code, details, hint, message" uyarısı
 * gösteriyor ve stack trace oluşturmuyor.
 *
 * Çözüm: objenin `message` alanını başlık, JSON temsilini detay olarak kullanan
 * bir `Error` yarat; Sentry bunu düzgün bir istisna olarak işler.
 */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;

  if (error !== null && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const message =
      typeof obj["message"] === "string"
        ? obj["message"]
        : typeof obj["error_description"] === "string"
          ? obj["error_description"]
          : "Unknown error";

    const wrapped = new Error(message);
    // Orijinal alanları stack'te görmek için cause'a bağla (ES2022+, RN desteği var).
    wrapped.cause = error;
    // Ek bağlam: Supabase hata kodu ve ipucu Sentry'de görünsün.
    if (typeof obj["code"] === "string") {
      wrapped.name = `SupabaseError [${obj["code"]}]`;
    }
    return wrapped;
  }

  if (typeof error === "string") return new Error(error);

  return new Error(String(error));
}
