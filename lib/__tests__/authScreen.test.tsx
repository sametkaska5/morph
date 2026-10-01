import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockPush = jest.fn();

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...a: unknown[]) => mockSignInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
    },
  },
}));
jest.mock("../useAuth", () => ({ useAuth: () => ({ session: null, loading: false }) }));
jest.mock("../monitoring", () => ({ captureError: jest.fn() }));
jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p) },
  Redirect: () => null,
}));

import AuthScreen from "@/app/(auth)/index";

const EMAIL = "E-posta";

beforeEach(() => {
  jest.clearAllMocks();
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
});

async function submitEmail(email: string) {
  await fireEvent.changeText(screen.getByLabelText(EMAIL), email);
  await fireEvent.press(screen.getByLabelText("Devam Et"));
}

describe("giriş ekranı — e-posta", () => {
  it("e-postanın başındaki/sonundaki boşluğu atar", async () => {
    await render(<AuthScreen />);

    await submitEmail("  ben@ornek.com  ");

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "ben@ornek.com",
      options: { shouldCreateUser: true },
    });
  });

  it("geçersiz e-postayı reddeder", async () => {
    await render(<AuthScreen />);

    await submitEmail("   ");

    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(screen.getByText("Lütfen geçerli bir e-posta adresi girin.")).toBeTruthy();
  });

  it("başarılı gönderimden sonra doğrulama ekranına geçer", async () => {
    await render(<AuthScreen />);

    await submitEmail("ben@ornek.com");

    await waitFor(() => expect(screen.getByText("E-postanı kontrol et")).toBeTruthy());
    expect(screen.getByText("ben@ornek.com", { exact: false })).toBeTruthy();
  });
});

describe("giriş ekranı — doğrulama", () => {
  async function goToVerification(email = "ben@ornek.com") {
    await render(<AuthScreen />);
    await submitEmail(email);
    await waitFor(() => expect(screen.getByText("E-postanı kontrol et")).toBeTruthy());
  }

  it("kodu doğrular", async () => {
    await goToVerification();

    await fireEvent.changeText(screen.getByLabelText("Doğrulama kodu"), "123456");
    await fireEvent.press(screen.getByLabelText("Kodu doğrula"));

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "ben@ornek.com",
      token: "123456",
      type: "email",
    });
  });

  it("koddaki boşluğu temizler", async () => {
    await goToVerification();

    await fireEvent.changeText(screen.getByLabelText("Doğrulama kodu"), " 123456 ");
    await fireEvent.press(screen.getByLabelText("Kodu doğrula"));

    expect(mockVerifyOtp).toHaveBeenCalledWith(expect.objectContaining({ token: "123456" }));
  });

  it("kod boşken doğrulamaya çalışmaz", async () => {
    await goToVerification();

    await fireEvent.press(screen.getByLabelText("Kodu doğrula"));

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(screen.getByText("Doğrulama kodu gerekli.")).toBeTruthy();
  });

  it("kodu tekrar gönderebilir", async () => {
    await goToVerification("yeni@ornek.com");

    await fireEvent.press(screen.getByLabelText("Kodu tekrar gönder"));

    expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: "yeni@ornek.com" });
    await waitFor(() => expect(screen.getByText("Yeni bir kod gönderdik.")).toBeTruthy());
  });

  it("farklı e-posta ile denemeye geri dönebilir", async () => {
    await goToVerification();

    await fireEvent.press(screen.getByLabelText("Farklı e-posta ile dene"));

    expect(screen.queryByText("E-postanı kontrol et")).toBeNull();
    expect(screen.getByLabelText(EMAIL)).toBeTruthy();
  });
});
