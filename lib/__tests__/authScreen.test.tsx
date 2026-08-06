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
const mockVerifyOtp = jest.fn();
const mockResend = jest.fn();

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      signUp: (...a: unknown[]) => mockSignUp(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
      resend: (...a: unknown[]) => mockResend(...a),
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
  mockSignIn.mockResolvedValue({ data: { session: {} }, error: null });
  // Varsayılan: Supabase e-posta doğrulaması bekliyor (oturum yok).
  mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
  mockResend.mockResolvedValue({ error: null });
  mockCheckAccount.mockResolvedValue("missing");
});

/** Kayıt olup doğrulama adımına geçer. */
async function signUpTo(email = "yeni@ornek.com") {
  await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));
  await fireEvent.changeText(screen.getByLabelText(EMAIL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD), "sifre123");
  await fireEvent.press(screen.getByText("Hesabı oluştur"));
  await waitFor(() => expect(screen.getByText("E-postanı doğrula")).toBeTruthy());
}

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
    expect(screen.getByText("Hesabı oluştur")).toBeTruthy();
  });

  it("kayıt kipine geçerken e-posta ve şifreyi korur", async () => {
    // Sıfırlansaydı kullanıcı ikisini de yeniden yazmak zorunda kalırdı.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("missing");
    await render(<AuthScreen />);

    await submit("yok@ornek.com", "sifre123");

    await waitFor(() => expect(screen.getByText("Hesabı oluştur")).toBeTruthy());
    expect(screen.getByLabelText(EMAIL).props.value).toBe("yok@ornek.com");
    expect(screen.getByLabelText(PASSWORD).props.value).toBe("sifre123");
  });

  it("otomatik geçiş sonrası giriş ekranına dönüş yolu açık kalır", async () => {
    // Yönlendirme yanlış olduysa (kullanıcı başka bir e-posta yazacaktı)
    // alttaki bağlantı hep orada.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("missing");
    await render(<AuthScreen />);

    await submit("yok@ornek.com", "sifre123");
    await waitFor(() => expect(screen.getByText("Hesabı oluştur")).toBeTruthy());
    await fireEvent.press(screen.getByLabelText("Giriş ekranına geç"));

    expect(screen.getByText("Giriş yap")).toBeTruthy();
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
    expect(screen.getByText("Giriş yap")).toBeTruthy();
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

    expect(screen.getByText("Hesabı oluştur")).toBeTruthy();
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

/**
 * İki kipin ayrışması.
 *
 * Kip değiştirici ekranın EN ALTINDA, üstünde ayraçla (Instagram/Facebook
 * deseni). Kipler başlık, buton metni ve şifre alanı etiketiyle ayrışıyor —
 * biri değişip diğeri kalırsa iki ekran yine birbirine karışır.
 */
/**
 * Kayıt sonrası e-posta doğrulaması.
 *
 * Amaç: adresin gerçekten kullanıcıya ait olduğunu bilmek. Bunu ancak o adrese
 * gönderilen kodu geri yazabilmesiyle anlayabiliyoruz.
 *
 * Kod ekranı, e-postadaki LİNKE tercih edildi: link kullanıcıyı uygulamadan
 * tarayıcıya çıkarıyor ve mobilde çoğu kişi geri dönmüyor. Şifre sıfırlama
 * akışı da aynı deseni kullanıyor.
 */
describe("giriş ekranı — e-posta doğrulama", () => {
  it("kayıt sonrası oturum açılmadıysa doğrulama adımına geçer", async () => {
    await render(<AuthScreen />);

    await signUpTo("yeni@ornek.com");

    expect(screen.getByText("yeni@ornek.com")).toBeTruthy();
    expect(screen.getByLabelText("Doğrulama kodu")).toBeTruthy();
  });

  it("doğrulama KAPALIYSA (oturum geldiyse) kod adımını atlar", async () => {
    // Supabase'de "Confirm email" kapalıyken signUp doğrudan oturum döner;
    // kullanıcıyı gereksiz bir kod ekranında bekletmemeliyiz.
    mockSignUp.mockResolvedValue({ data: { session: {} }, error: null });
    await render(<AuthScreen />);

    await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));
    await fireEvent.changeText(screen.getByLabelText(EMAIL), "yeni@ornek.com");
    await fireEvent.changeText(screen.getByLabelText(PASSWORD), "sifre123");
    await fireEvent.press(screen.getByText("Hesabı oluştur"));

    await waitFor(() => expect(screen.queryByText("E-postanı doğrula")).toBeNull());
  });

  it("kodu kayıt olunan e-postayla birlikte doğrular", async () => {
    await render(<AuthScreen />);
    await signUpTo("yeni@ornek.com");

    await fireEvent.changeText(screen.getByLabelText("Doğrulama kodu"), "123456");
    await fireEvent.press(screen.getByLabelText("Kodu doğrula"));

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "yeni@ornek.com",
      token: "123456",
      type: "signup",
    });
  });

  it("koddaki boşluğu temizler", async () => {
    // Kod e-postadan kopyalanınca yanında boşluk geliyor; temizlenmezse
    // "Kod hatalı" hatası alınıyordu.
    await render(<AuthScreen />);
    await signUpTo();

    await fireEvent.changeText(screen.getByLabelText("Doğrulama kodu"), " 123456 ");
    await fireEvent.press(screen.getByLabelText("Kodu doğrula"));

    expect(mockVerifyOtp).toHaveBeenCalledWith(expect.objectContaining({ token: "123456" }));
  });

  it("kod boşken doğrulamaya çalışmaz", async () => {
    await render(<AuthScreen />);
    await signUpTo();

    await fireEvent.press(screen.getByLabelText("Kodu doğrula"));

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(screen.getByText("Doğrulama kodu gerekli.")).toBeTruthy();
  });

  it("hatalı kodda anlaşılır mesaj gösterir", async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: "Invalid token" } });
    await render(<AuthScreen />);
    await signUpTo();

    await fireEvent.changeText(screen.getByLabelText("Doğrulama kodu"), "000000");
    await fireEvent.press(screen.getByLabelText("Kodu doğrula"));

    await waitFor(() => expect(screen.getByText(/Kod hatalı/)).toBeTruthy());
  });

  it("kodu tekrar gönderebilir", async () => {
    await render(<AuthScreen />);
    await signUpTo("yeni@ornek.com");

    await fireEvent.press(screen.getByLabelText("Kodu tekrar gönder"));

    expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "yeni@ornek.com" });
    await waitFor(() => expect(screen.getByText("Yeni bir kod gönderdik.")).toBeTruthy());
  });

  it("yanlış adres yazıldıysa geri dönülebilir", async () => {
    // Dönüş yolu olmasaydı kullanıcı yanlış adresle kilitli kalırdı.
    await render(<AuthScreen />);
    await signUpTo();

    await fireEvent.press(screen.getByLabelText("Farklı e-posta ile dene"));

    expect(screen.queryByText("E-postanı doğrula")).toBeNull();
    expect(screen.getByLabelText(EMAIL)).toBeTruthy();
  });
});

describe("giriş ekranı — iki kipin ayrışması", () => {
  it("giriş kipinde başlık, buton ve alttaki bağlantı tutarlı", async () => {
    await render(<AuthScreen />);

    expect(screen.getByText("Tekrar hoş geldin")).toBeTruthy();
    expect(screen.getByText("Giriş yap")).toBeTruthy();
    expect(screen.getByLabelText("Kayıt ekranına geç")).toBeTruthy();
  });

  it("alttaki bağlantı kayıt kipine geçirir, başlık ve buton da değişir", async () => {
    await render(<AuthScreen />);

    await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));

    expect(screen.getByText("Hesap oluştur")).toBeTruthy();
    expect(screen.getByText("Hesabı oluştur")).toBeTruthy();
    expect(screen.queryByText("Tekrar hoş geldin")).toBeNull();
  });

  it("kayıt kipinden geri dönülebilir", async () => {
    await render(<AuthScreen />);

    await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));
    await fireEvent.press(screen.getByLabelText("Giriş ekranına geç"));

    expect(screen.getByText("Tekrar hoş geldin")).toBeTruthy();
  });

  it("kayıt kipinde şifre alanı kural bilgisi verir", async () => {
    await render(<AuthScreen />);
    expect(screen.getByText("Şifre")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));

    expect(screen.getByText("Şifre belirle (en az 6 karakter)")).toBeTruthy();
  });

  it("şifremi unuttum yalnızca giriş kipinde çıkar", async () => {
    await render(<AuthScreen />);
    expect(screen.getByText("Şifremi unuttum")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));

    expect(screen.queryByText("Şifremi unuttum")).toBeNull();
  });

  it("kip değiştirince önceki hata mesajı silinir", async () => {
    // Kalsaydı kayıt ekranında alakasız bir giriş hatası asılı kalırdı.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockCheckAccount.mockResolvedValue("unknown");
    await render(<AuthScreen />);
    await submit("ben@ornek.com", "yanlis");
    await waitFor(() => expect(screen.getByText("E-posta veya şifre hatalı.")).toBeTruthy());

    await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));

    expect(screen.queryByText("E-posta veya şifre hatalı.")).toBeNull();
  });
});

describe("giriş ekranı — kayıt kipi", () => {
  it("kayıt olurken de e-postayı temizler", async () => {
    await render(<AuthScreen />);

    await fireEvent.press(screen.getByLabelText("Kayıt ekranına geç"));
    await fireEvent.changeText(screen.getByLabelText(EMAIL), " yeni@ornek.com ");
    await fireEvent.changeText(screen.getByLabelText(PASSWORD), "sifre123");
    await fireEvent.press(screen.getByText("Hesabı oluştur"));

    expect(mockSignUp).toHaveBeenCalledWith({ email: "yeni@ornek.com", password: "sifre123" });
  });
});
