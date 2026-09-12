/**
 * Ham hataları kullanıcıya gösterilebilir Türkçe metinlere çevirir.
 *
 * Neden gerekli: ekranlar hatayı doğrudan basıyordu — Türkçe bir uygulamada
 * kullanıcı "TypeError: Network request failed" ya da "JWT expired" görüyordu.
 * Bunlar hem anlaşılmaz hem de ne yapması gerektiğini söylemiyor.
 *
 * Bu modül BİLEREK saf tutuluyor (React yok, ağ yok, log yok) — test edilebilsin
 * ve hem sorgu hatalarında hem auth akışlarında kullanılabilsin diye.
 * Hatanın ham hâli kullanıcıdan gizlenir ama kaybolmaz: çağıran taraf
 * lib/monitoring.ts'teki captureError ile Sentry'ye bildirir.
 */

/** Hata sınıfı — çağıran taraf buna göre ikon/eylem seçer. */
export type ErrorKind = "offline" | "auth" | "permission" | "notFound" | "unknown";

export type FriendlyError = {
  kind: ErrorKind;
  title: string;
  message: string;
};

/**
 * Bir hata nesnesinden string alan okur. Supabase üç farklı hata şekli
 * döndürüyor (PostgrestError: code/message, AuthError: status/message,
 * StorageError: statusCode/message) ve ağ katmanı düz TypeError fırlatıyor —
 * hepsini aynı şekilde yoklayabilmek için tek bir güvenli okuyucu.
 */
function read(error: unknown, key: string): string {
  if (error && typeof error === "object" && key in error) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  return read(error, "message").toLowerCase();
}

/**
 * Cihaz çevrimdışıyken ya da sunucuya ulaşılamadığında React Native'in fetch'i
 * "Network request failed" fırlatır. Offline-first bir uygulamada bu en sık
 * karşılaşılan hata ve tek "gerçek hata olmayan" hata — kullanıcıya panik
 * yaratmadan söylenmeli.
 */
export function isNetworkError(error: unknown): boolean {
  const msg = messageOf(error);
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("timeout")
  );
}

function isAuthError(error: unknown): boolean {
  const msg = messageOf(error);
  return (
    msg.includes("jwt expired") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    read(error, "code") === "PGRST301" ||
    read(error, "status") === "401"
  );
}

function isPermissionError(error: unknown): boolean {
  const msg = messageOf(error);
  return (
    read(error, "code") === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  );
}

function isNotFoundError(error: unknown): boolean {
  // PGRST116: .single() sorgusu satır bulamadı (örn. silinmiş bir kaydın
  // detayına eski bir linkten girilmesi).
  return read(error, "code") === "PGRST116" || messageOf(error).includes("0 rows");
}

/**
 * Veri çekme hatalarını (React Query `error`) kullanıcıya gösterilebilir hâle
 * getirir. Her sınıf, kullanıcının NE YAPABİLECEĞİNİ söyleyen bir mesaj alır.
 */
export function describeError(error: unknown): FriendlyError {
  if (isNetworkError(error)) {
    return {
      kind: "offline",
      title: "Bağlantı kurulamadı",
      message:
        "İnternet bağlantını kontrol edip tekrar dene. Kayıtların cihazında güvende — bağlantı gelince kaldığın yerden devam edersin.",
    };
  }

  if (isAuthError(error)) {
    return {
      kind: "auth",
      title: "Oturumun sona ermiş",
      message: "Güvenlik için oturumun kapandı. Tekrar giriş yaptığında her şey yerinde olacak.",
    };
  }

  if (isPermissionError(error)) {
    return {
      kind: "permission",
      title: "Bu içeriğe erişemedik",
      message: "Bu kayda erişim iznin yok gibi görünüyor. Doğru hesapla giriş yaptığından emin ol.",
    };
  }

  if (isNotFoundError(error)) {
    return {
      kind: "notFound",
      title: "Kayıt bulunamadı",
      message: "Bu kayıt silinmiş ya da taşınmış olabilir.",
    };
  }

  return {
    kind: "unknown",
    title: "Bir şeyler ters gitti",
    message: "Beklenmedik bir hata oluştu. Tekrar denemek genellikle sorunu çözer.",
  };
}

/**
 * KAYDETME/SİLME gibi eylemlerin başarısızlığında Alert gövdesinde gösterilecek
 * kısa metin.
 *
 * describeError'dan ayrı: oradaki metinler VERİ OKUMA hatası için yazıldı ve
 * ağ hatasında "kayıtların cihazında güvende" diyor. Bir YAZMA başarısız
 * olduğunda aynı cümle "kaydım gitti mi, kaldı mı?" belirsizliği yaratırdı.
 * Alert'in başlığı zaten neyin başarısız olduğunu söylediği için (örn.
 * "Kayıt başarısız") burada yalnızca sebep + ne yapılacağı veriliyor.
 */
export function actionErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.";
  }
  if (isAuthError(error)) {
    return "Oturumun sona ermiş. Tekrar giriş yapıp dener misin?";
  }
  if (isPermissionError(error)) {
    return "Bu işlem için gerekli izne sahip değilsin.";
  }
  return "Beklenmedik bir hata oluştu. Tekrar denemek genellikle sorunu çözer.";
}

/**
 * Supabase auth akışlarının (giriş, kayıt, şifre sıfırlama) İngilizce hata
 * metinlerini çevirir. Sırayla eşleştiriliyor — daha ÖZEL kalıplar üstte olmalı.
 */
const AUTH_MESSAGES: { match: string; text: string }[] = [
  { match: "invalid login credentials", text: "E-posta veya şifre hatalı." },
  {
    match: "email not confirmed",
    text: "E-posta adresini doğrulaman gerekiyor. Gelen kutunu kontrol et.",
  },
  { match: "user already registered", text: "Bu e-posta zaten kayıtlı. Giriş yapmayı dene." },
  { match: "password should be at least", text: "Şifre en az 6 karakter olmalı." },
  {
    match: "new password should be different",
    text: "Yeni şifre eskisinden farklı olmalı.",
  },
  {
    match: "unable to validate email address",
    text: "E-posta adresi geçerli görünmüyor.",
  },
  { match: "token has expired", text: "Kodun süresi dolmuş. Yeni bir kod iste." },
  { match: "invalid token", text: "Kod hatalı. Tekrar kontrol edip gir." },
  { match: "otp_expired", text: "Kodun süresi dolmuş. Yeni bir kod iste." },
  {
    match: "for security purposes",
    text: "Güvenliğiniz için işlem durduruldu. Lütfen 5 dakika bekleyip tekrar deneyin.",
  },
  {
    match: "email rate limit exceeded",
    text: "Çok fazla e-posta gönderildi. Lütfen yaklaşık 1 saat bekleyip tekrar deneyin.",
  },
];

/**
 * Auth ekranlarında satır içi gösterilecek tek satırlık mesaj.
 *
 * Tanınmayan hatalarda ham İngilizce metni GÖSTERMİYORUZ; genel bir mesaj
 * dönüyoruz. Kullanıcı için teknik metnin bir faydası yok, gerçek ayrıntı
 * Sentry'ye gidiyor (bkz. captureError çağrıları).
 */
export function authErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.";
  }

  const msg = messageOf(error);
  const hit = AUTH_MESSAGES.find((m) => msg.includes(m.match));
  if (hit) return hit.text;

  return "İşlem tamamlanamadı. Lütfen tekrar dene.";
}

