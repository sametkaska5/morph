/**
 * Şifre değiştirme ekranı.
 *
 * Buradaki asıl güvence şu: Supabase'in `updateUser({ password })` çağrısı eski
 * şifreyi SORMUYOR, açık oturum yeterli. Yeniden kimlik doğrulaması olmadan
 * kilidi açık bir telefonu eline geçiren biri şifreyi değiştirip hesabın asıl
 * sahibini kilitleyebilir. Bu adım kaldırılırsa ekran gözle bakınca AYNEN
 * çalışmaya devam eder — hiçbir belirti yok. O yüzden "yanlış mevcut şifrede
 * updateUser'a HİÇ gidilmiyor" testi bu dosyanın en önemli satırı.
 *
 * İkinci grup, ağa çıkmadan yapılan doğrulamalar: her biri kullanıcıya
 * beklemeden ve net bir sebeple dönüyor.
 */

const mockSignIn = jest.fn();
const mockUpdateUser = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockShowAlert = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), replace: (a: unknown) => mockReplace(a) },
}));

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (a: unknown) => mockSignIn(a),
      updateUser: (a: unknown) => mockUpdateUser(a),
    },
  },
}));

jest.mock("../useAuth", () => ({
  useAuth: () => ({ user: { email: "sen@ornek.com" }, session: {}, loading: false }),
}));

jest.mock("../appAlert", () => ({
  showAlert: (...a: unknown[]) => mockShowAlert(...a),
}));

jest.mock("../monitoring", () => ({ captureError: jest.fn() }));

import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ChangePasswordScreen from "@/app/settings/password";

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
});

/** Üç alanı doldurup gönderir. */
async function fillAndSubmit(current: string, next: string, confirm: string) {
  await fireEvent.changeText(screen.getByLabelText("Mevcut şifre"), current);
  await fireEvent.changeText(screen.getByLabelText("Yeni şifre"), next);
  await fireEvent.changeText(screen.getByLabelText("Yeni şifre tekrar"), confirm);
  await fireEvent.press(screen.getByLabelText("Şifreyi güncelle"));
}

describe("şifre değiştirme — kimlik doğrulaması", () => {
  it("mevcut şifre YANLIŞSA şifreyi değiştirmeye HİÇ gitmez", async () => {
    // Bu ekranın varlık sebebi. Kaldırılırsa hiçbir test kırılmaz, hiçbir hata
    // çıkmaz — sadece hesap korumasız kalır.
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    await render(<ChangePasswordScreen />);
    await fillAndSubmit("yanlissifre", "yenisifre123", "yenisifre123");

    await waitFor(() => expect(screen.getByText("Mevcut şifren hatalı.")).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("doğru mevcut şifreyle önce kimliği doğrular, sonra şifreyi değiştirir", async () => {
    await render(<ChangePasswordScreen />);
    await fillAndSubmit("dogrusifre", "yenisifre123", "yenisifre123");

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "sen@ornek.com",
        password: "dogrusifre",
      })
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "yenisifre123" });
  });

  it("başarıda kullanıcıya haber verip ekranı kapatır", async () => {
    // Geri bildirim olmadan kullanıcı şifresinin gerçekten değişip
    // değişmediğinden emin olamıyor.
    await render(<ChangePasswordScreen />);
    await fillAndSubmit("dogrusifre", "yenisifre123", "yenisifre123");

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());
    expect(mockBack).toHaveBeenCalled();
  });

  it("güncelleme patlarsa ekranı KAPATMAZ", async () => {
    // Kapansaydı kullanıcı şifresinin değiştiğini sanırdı.
    mockUpdateUser.mockResolvedValue({ error: { message: "boom" } });

    await render(<ChangePasswordScreen />);
    await fillAndSubmit("dogrusifre", "yenisifre123", "yenisifre123");

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("şifre değiştirme — ağa çıkmadan doğrulamalar", () => {
  it("boş alanlarda hiç istek atmaz", async () => {
    await render(<ChangePasswordScreen />);

    await fireEvent.press(screen.getByLabelText("Şifreyi güncelle"));

    expect(screen.getByText("Üç alanı da doldurman gerekiyor.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("kısa şifreyi reddeder", async () => {
    await render(<ChangePasswordScreen />);
    await fillAndSubmit("dogrusifre", "kisa", "kisa");

    expect(screen.getByText("Yeni şifre en az 6 karakter olmalı.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("yeni şifre eskisiyle aynıysa reddeder", async () => {
    await render(<ChangePasswordScreen />);
    await fillAndSubmit("ayni-sifre", "ayni-sifre", "ayni-sifre");

    expect(screen.getByText("Yeni şifre eskisinden farklı olmalı.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("tekrar alanı eşleşmezse reddeder", async () => {
    await render(<ChangePasswordScreen />);
    await fillAndSubmit("dogrusifre", "yenisifre123", "yenisifre124");

    expect(screen.getByText("Yeni şifreler birbiriyle eşleşmiyor.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("şifreleri TRIM ETMEZ — boşluk şifrenin parçası olabilir", async () => {
    await render(<ChangePasswordScreen />);
    await fillAndSubmit("  bosluklu  ", "yeni sifre ", "yeni sifre ");

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "sen@ornek.com",
        password: "  bosluklu  ",
      })
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "yeni sifre " });
  });
});

describe("şifre değiştirme — çıkmaz yok", () => {
  it("şifresini hatırlamayan kullanıcıyı e-posta yoluna gönderir", async () => {
    // Mevcut şifre zorunlu olduğu için, hatırlamayan kullanıcının bu ekranda
    // ilerlemesi imkânsız — kurtarma yolu görünür olmalı.
    await render(<ChangePasswordScreen />);

    await fireEvent.press(screen.getByLabelText("Mevcut şifremi hatırlamıyorum"));

    expect(mockReplace).toHaveBeenCalledWith("/forgot-password");
  });
});
