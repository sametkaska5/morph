import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

/**
 * app/(auth)/index.tsx — giriş / kayıt.
 *
 * İki şey korunuyor:
 *
 *  1. E-POSTA TRIM. Telefon klavyeleri otomatik tamamlamadan sonra sona boşluk
 *     ekliyor. Boşluklu e-posta Supabase'de başka bir kimlik: kullanıcı doğru
 *     adresi ve şifreyi yazdığı hâlde "e-posta veya şifre hatalı" alıyor ve
 *     neyin yanlış olduğunu anlaması imkânsız oluyor. Şifre BİLEREK trim
 *     edilmiyor — boşluk şifrenin meşru parçası olabilir.
 *
 *  2. "HESAP OLUŞTUR" KISAYOLU yalnızca doğru koşulda çıkmalı. Supabase, hesap
 *     yokken de şifre yanlışken de aynı hatayı döndürüyor (kullanıcı sayımını
 *     engellemek için) — biz hangisi olduğunu bilmiyoruz, o yüzden "böyle bir
 *     hesap yok" DEMİYORUZ, sadece iki çıkış yolunu da gösteriyoruz.
 */

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockPush = jest.fn();
const mockCheckAccount = jest.fn();

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      signUp: (...a: unknown[]) => mockSignUp(...a),
    },
  },
}));
jest.mock("../useAuth", () => ({ useAuth: () => ({ session: null, loading: false }) }));
jest.mock("../monitoring", () => ({ captureError: jest.fn() }));
jest.mock("../accountLookup", () => ({ checkAccountExists: () => mockCheckAccount() }));
jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p) },
  Redirect: () => null,
}));

import AuthScreen from "@/app/(auth)/index";

const EMAIL = "E-posta";
const PASSWORD = "Şifre";

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  mockSignUp.mockResolvedValue({ error: null });
  mockCheckAccount.mockResolvedValue("missing");
});

/** Formu doldurup gönderir. */
async function submit(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText(EMAIL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD), password);
  await fireEvent.press(screen.getByText("Giriş yap"));
}

describe("giriş ekranı — e-posta temizliği", () => {
  it("e-postanın başındaki/sonundaki boşluğu atar", async () => {
    await render(<AuthScreen />);

    await submit("  ben@ornek.com  ", "sifre123");

    expect(mockSignIn).toHaveBeenCalledWith({ email: "ben@ornek.com", password: "sifre123" });
  });

  it("şifreyi trim ETMEZ — boşluk şifrenin parçası olabilir", async () => {
    await render(<AuthScreen />);

    await submit("ben@ornek.com", " sifre ");

    expect(mockSignIn).toHaveBeenCalledWith({ email: "ben@ornek.com", password: " sifre " });
  });

  it("yalnızca boşluktan ibaret e-postayı boş sayar ve istek atmaz", async () => {
    await render(<AuthScreen />);

    await submit("   ", "sifre123");

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByText("E-posta ve şifre gerekli.")).toBeTruthy();
  });
});

/**
 * "E-postam mı yanlış, şifrem mi" belirsizliği.
 *
 * Supabase iki durumu da aynı hatayla döndürüyor; ayrımı kendi kontrolümüzle
 * yapıyoruz (lib/accountLookup.ts + migration 0011). Kontrol yapılamazsa
 * UYDURMUYORUZ — eski genel mesaja düşüyoruz.
 */
describe("giriş ekranı — hesap var mı ayrımı", () => {
  it("hesap yoksa DOĞRUDAN kayıt kipine geçer ve sebebini söyler", async () => {
    // Bağlantıya tıklatmıyoruz: hesabın olmadığı KESİN olduğuna göre
    // kullanıcıyı bir adım daha yürütmenin anlamı yok.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("missing");
    await render(<AuthScreen />);

    await submit("yok@ornek.com", "sifre123");

    await waitFor(() => expect(screen.getByText(/kayıt ekranına aldık/)).toBeTruthy());
    expect(screen.getByLabelText("Kayıt sekmesi")).toBeSelected();
    expect(screen.getByText("Hesabı oluştur")).toBeTruthy();
  });

  it("kayıt kipine geçerken e-posta ve şifreyi korur", async () => {
    // Sıfırlansaydı kullanıcı ikisini de yeniden yazmak zorunda kalırdı.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("missing");
    await render(<AuthScreen />);

    await submit("yok@ornek.com", "sifre123");

    await waitFor(() => expect(screen.getByLabelText("Kayıt sekmesi")).toBeSelected());
    expect(screen.getByLabelText(EMAIL).props.value).toBe("yok@ornek.com");
    expect(screen.getByLabelText(PASSWORD).props.value).toBe("sifre123");
  });

  it("hesap VARSA şifrenin yanlış olduğunu söyler, kayıt kısayolu göstermez", async () => {
    // Hesabı olan kullanıcıya "hesap oluştur" demek onu "zaten kayıtlı"
    // duvarına toslatırdı.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("exists");
    await render(<AuthScreen />);

    await submit("ben@ornek.com", "yanlis");

    await waitFor(() => expect(screen.getByText(/Şifre hatalı/)).toBeTruthy());
    expect(screen.queryByLabelText("Bu e-postayla hesap oluştur")).toBeNull();
  });

  it("kontrol yapılamazsa UYDURMAZ, genel mesajı ve İKİ çıkış yolunu gösterir", async () => {
    // Ağ hatası ya da fonksiyon henüz migrate edilmemiş olabilir. "Hesap yok"
    // demek, hesabı olan birine yanlış bilgi vermek olurdu — o yüzden karar
    // vermiyor, kullanıcıya iki yolu da açıyoruz. Kısayolun asıl yeri burası.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("unknown");
    await render(<AuthScreen />);

    await submit("ben@ornek.com", "yanlis");

    await waitFor(() => expect(screen.getByText("E-posta veya şifre hatalı.")).toBeTruthy());
    expect(screen.getByLabelText("Bu e-postayla hesap oluştur")).toBeTruthy();
    // Kayıt kipine KENDİLİĞİNDEN geçmiyor: hesabın olmadığını bilmiyoruz.
    expect(screen.getByLabelText("Giriş sekmesi")).toBeSelected();
  });

  it("kontrolü yalnızca giriş başarısız olunca yapar", async () => {
    // Her girişte fazladan gidiş-dönüş yapmanın anlamı yok.
    await render(<AuthScreen />);

    await submit("ben@ornek.com", "dogru");

    expect(mockCheckAccount).not.toHaveBeenCalled();
  });

  it("BAŞKA auth hatalarında kısayolu göstermez", async () => {
    // Hesabı zaten olan (e-postası doğrulanmamış) kullanıcıya "hesap oluştur"
    // demek onu yanlış yola sokardı.
    mockSignIn.mockResolvedValue({ error: { message: "Email not confirmed" } });
    await render(<AuthScreen />);

    await submit("ben@ornek.com", "sifre123");

    await waitFor(() => expect(screen.getByText(/Gelen kutunu/)).toBeTruthy());
    expect(screen.queryByLabelText("Bu e-postayla hesap oluştur")).toBeNull();
  });

  it("belirsiz durumda kısayola dokununca kayıt kipine geçer, e-postayı korur", async () => {
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("unknown");
    await render(<AuthScreen />);

    await submit("ben@ornek.com", "yanlis");
    await waitFor(() => expect(screen.getByLabelText("Bu e-postayla hesap oluştur")).toBeTruthy());
    await fireEvent.press(screen.getByLabelText("Bu e-postayla hesap oluştur"));

    expect(screen.getByLabelText("Kayıt sekmesi")).toBeSelected();
    expect(screen.getByLabelText(EMAIL).props.value).toBe("ben@ornek.com");
  });

  it("yeni denemede kısayol kaybolur", async () => {
    // Kalıcı olsaydı, sonraki hatalarda alakasız bir öneri olarak asılı kalırdı.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("unknown");
    await render(<AuthScreen />);
    await submit("ben@ornek.com", "yanlis");
    await waitFor(() => expect(screen.getByLabelText("Bu e-postayla hesap oluştur")).toBeTruthy());

    mockSignIn.mockResolvedValue({ error: null });
    await fireEvent.press(screen.getByText("Giriş yap"));

    await waitFor(() =>
      expect(screen.queryByLabelText("Bu e-postayla hesap oluştur")).toBeNull()
    );
  });
});

describe("giriş ekranı — iki kipin ayrışması", () => {
  it("hangi kipte olunduğunu üstteki sekmelerde sürekli gösterir", async () => {
    // Eskiden tek ayırt edici şey başlık ve buton metniydi; ikisi de ekranın
    // farklı yerlerinde kaldığı için iki sayfa birbirine karışıyordu.
    await render(<AuthScreen />);

    expect(screen.getByLabelText("Giriş sekmesi")).toBeSelected();
    expect(screen.getByLabelText("Kayıt sekmesi")).not.toBeSelected();
  });

  it("sekmeden kayıt kipine geçince başlık ve buton da değişir", async () => {
    await render(<AuthScreen />);

    await fireEvent.press(screen.getByLabelText("Kayıt sekmesi"));

    expect(screen.getByText("Hesap oluştur")).toBeTruthy();
    expect(screen.getByText("Hesabı oluştur")).toBeTruthy();
    expect(screen.queryByText("Giriş yap")).toBeNull();
  });

  it("kayıt kipinde şifre alanı kural bilgisi verir", async () => {
    await render(<AuthScreen />);
    expect(screen.getByText("Şifre")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Kayıt sekmesi"));

    expect(screen.getByText("Şifre belirle (en az 6 karakter)")).toBeTruthy();
  });

  it("kip değiştirince önceki hata mesajı silinir", async () => {
    // Kalsaydı kayıt ekranında alakasız bir giriş hatası asılı kalırdı.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("unknown");
    await render(<AuthScreen />);
    await submit("ben@ornek.com", "yanlis");
    await waitFor(() => expect(screen.getByText("E-posta veya şifre hatalı.")).toBeTruthy());

    await fireEvent.press(screen.getByLabelText("Kayıt sekmesi"));

    expect(screen.queryByText("E-posta veya şifre hatalı.")).toBeNull();
  });
});

describe("giriş ekranı — kayıt kipi", () => {
  it("kayıt olurken de e-postayı temizler", async () => {
    await render(<AuthScreen />);

    await fireEvent.press(screen.getByLabelText("Kayıt sekmesi"));
    await fireEvent.changeText(screen.getByLabelText(EMAIL), " yeni@ornek.com ");
    await fireEvent.changeText(screen.getByLabelText(PASSWORD), "sifre123");
    await fireEvent.press(screen.getByText("Hesabı oluştur"));

    expect(mockSignUp).toHaveBeenCalledWith({ email: "yeni@ornek.com", password: "sifre123" });
  });
});
