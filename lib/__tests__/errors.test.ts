import { describeError, authErrorMessage, isNetworkError, isInvalidCredentials } from "../errors";

describe("isNetworkError", () => {
  it("React Native'in fetch hatasını tanır", () => {
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
  });

  it("büyük/küçük harf farkına takılmaz", () => {
    expect(isNetworkError({ message: "NETWORK REQUEST FAILED" })).toBe(true);
  });

  it("tarayıcı/fetch varyantlarını da tanır", () => {
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("request timeout"))).toBe(true);
  });

  it("ilgisiz hataları ağ hatası saymaz", () => {
    expect(isNetworkError(new Error("duplicate key value"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe("describeError", () => {
  it("ağ hatasında verinin güvende olduğunu söyler (offline-first güveni)", () => {
    const result = describeError(new TypeError("Network request failed"));
    expect(result.kind).toBe("offline");
    expect(result.title).toBe("Bağlantı kurulamadı");
    expect(result.message).toContain("güvende");
  });

  it("süresi dolmuş oturumu tanır", () => {
    expect(describeError({ message: "JWT expired" }).kind).toBe("auth");
    expect(describeError({ code: "PGRST301", message: "..." }).kind).toBe("auth");
    expect(describeError({ status: 401, message: "Unauthorized" }).kind).toBe("auth");
  });

  it("RLS/izin hatasını tanır", () => {
    expect(describeError({ code: "42501", message: "..." }).kind).toBe("permission");
    expect(describeError({ message: "new row violates row-level security policy" }).kind).toBe(
      "permission",
    );
  });

  it("silinmiş kaydı (PGRST116) tanır", () => {
    expect(describeError({ code: "PGRST116", message: "0 rows" }).kind).toBe("notFound");
  });

  it("tanımadığı her şeyde genel mesaja düşer", () => {
    const result = describeError(new Error("boom"));
    expect(result.kind).toBe("unknown");
    expect(result.title).toBe("Bir şeyler ters gitti");
  });

  it("ham teknik metni ASLA kullanıcıya sızdırmaz", () => {
    // Bu modülün varlık sebebi: "TypeError: Network request failed" gibi
    // metinler kullanıcıya gösterilmemeli.
    for (const raw of ["Network request failed", "JWT expired", "boom", "42501"]) {
      const { title, message } = describeError(new Error(raw));
      expect(`${title} ${message}`).not.toContain(raw);
    }
  });

  it("null/undefined ile çağrılınca çökmez", () => {
    expect(describeError(null).kind).toBe("unknown");
    expect(describeError(undefined).kind).toBe("unknown");
  });
});

/**
 * Bu hata İKİ durumu birden kapsıyor: hesap yok, ya da şifre yanlış. Supabase
 * hangisi olduğunu bilerek söylemiyor (kullanıcı sayımını engellemek için).
 * Giriş ekranı bunu "hesabın yoksa oluştur" kısayolunu göstermek için
 * kullanıyor — "böyle bir hesap yok" DEMEK için değil, çünkü bilmiyoruz.
 */
describe("isInvalidCredentials", () => {
  it("geçersiz kimlik hatasını tanır", () => {
    expect(isInvalidCredentials({ message: "Invalid login credentials" })).toBe(true);
  });

  it("büyük/küçük harften etkilenmez", () => {
    expect(isInvalidCredentials({ message: "INVALID LOGIN CREDENTIALS" })).toBe(true);
  });

  it("başka auth hatalarını bununla karıştırmaz", () => {
    // Karıştırsaydı "hesap oluştur" kısayolu, hesabı ZATEN olan kullanıcıya
    // (örn. e-postası doğrulanmamış) gösterilirdi.
    expect(isInvalidCredentials({ message: "Email not confirmed" })).toBe(false);
    expect(isInvalidCredentials({ message: "User already registered" })).toBe(false);
  });

  it("ağ hatasını geçersiz kimlik sanmaz", () => {
    expect(isInvalidCredentials(new TypeError("Network request failed"))).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("hatalı giriş bilgisini Türkçeleştirir", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" })).toBe(
      "E-posta veya şifre hatalı.",
    );
  });

  it("doğrulanmamış e-postada ne yapılacağını söyler", () => {
    expect(authErrorMessage({ message: "Email not confirmed" })).toContain("Gelen kutunu");
  });

  it("zaten kayıtlı e-postayı giriş yapmaya yönlendirir", () => {
    expect(authErrorMessage({ message: "User already registered" })).toContain("Giriş yapmayı");
  });

  it("kısa şifre uyarısını çevirir", () => {
    expect(authErrorMessage({ message: "Password should be at least 6 characters" })).toBe(
      "Şifre en az 6 karakter olmalı.",
    );
  });

  it("süresi dolmuş / hatalı OTP kodunu ayırt eder", () => {
    expect(authErrorMessage({ message: "Token has expired" })).toContain("süresi dolmuş");
    expect(authErrorMessage({ message: "Invalid token" })).toContain("Kod hatalı");
  });

  it("hız sınırında beklemeyi söyler", () => {
    expect(
      authErrorMessage({
        message: "For security purposes, you can only request this after 51 seconds",
      }),
    ).toContain("bekleyip");
  });

  it("ağ hatasını auth hatası sanmaz", () => {
    expect(authErrorMessage(new TypeError("Network request failed"))).toContain(
      "İnternet bağlantısı",
    );
  });

  it("tanımadığı hatada ham İngilizce metni göstermez", () => {
    const raw = "unexpected_failure: something exploded";
    const result = authErrorMessage({ message: raw });
    expect(result).toBe("İşlem tamamlanamadı. Lütfen tekrar dene.");
    expect(result).not.toContain(raw);
  });
});
