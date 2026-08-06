/**
 * Hesap var mı kontrolü ve hız sınırına verilen tepki.
 *
 * `email_exists` artık IP başına sınırlı (bkz. migration 0012) ve sınır
 * aşıldığında HATA fırlatıyor. Bu dosyanın koruduğu şey, o hatanın istemcide
 * nasıl karşılandığı.
 *
 * Kritik ayrım: hata "unknown" olarak ele alınmalı, "missing" olarak DEĞİL.
 * "missing" dönseydi giriş ekranı kullanıcıyı doğrudan kayıt kipine alır ve
 * "bu e-postayla kayıtlı bir hesap yok" derdi — oysa hesabı gayet var, sadece
 * sorgu yapılamadı. Hesabı olan kullanıcıya hesabının olmadığını söylemek,
 * belirsiz bir mesaj göstermekten çok daha kötü. Üstelik bu, ekranda hiçbir
 * hata belirtisi olmadan gerçekleşirdi.
 */

const mockRpc = jest.fn();

jest.mock("../supabase", () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));

import { checkAccountExists } from "../accountLookup";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("checkAccountExists", () => {
  it("hesap varsa 'exists' döner", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    await expect(checkAccountExists("sen@ornek.com")).resolves.toBe("exists");
  });

  it("hesap yoksa 'missing' döner", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    await expect(checkAccountExists("yok@ornek.com")).resolves.toBe("missing");
  });

  it("HIZ SINIRINDA 'unknown' döner — 'missing' DEĞİL", async () => {
    // Bu dosyanın en önemli testi. "missing" dönseydi, sınıra takılan
    // kullanıcıya hesabının olmadığı söylenip kayıt ekranına gönderilirdi.
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "email_exists rate limit exceeded", code: "P0001" },
    });

    await expect(checkAccountExists("sen@ornek.com")).resolves.toBe("unknown");
  });

  it("ağ hatası fırlatırsa 'unknown' döner", async () => {
    // Fonksiyon henüz migrate edilmemiş, yetki değişmiş, ağ kopmuş — hangisi
    // olursa olsun aynı güvenli davranış.
    mockRpc.mockRejectedValue(new TypeError("Network request failed"));

    await expect(checkAccountExists("sen@ornek.com")).resolves.toBe("unknown");
  });

  it("boş e-postada sunucuya hiç gitmez", async () => {
    await expect(checkAccountExists("   ")).resolves.toBe("unknown");

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("e-postayı boşluklardan temizleyerek gönderir", async () => {
    // Boşluklu e-posta Supabase'de BAŞKA bir kimlik; temizlenmezse kontrol
    // her zaman "missing" derdi (bkz. (auth)/index.tsx'teki aynı gerekçe).
    mockRpc.mockResolvedValue({ data: true, error: null });

    await checkAccountExists("  sen@ornek.com  ");

    expect(mockRpc).toHaveBeenCalledWith("email_exists", { check_email: "sen@ornek.com" });
  });
});
