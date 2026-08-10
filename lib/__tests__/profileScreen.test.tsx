import { render, screen, fireEvent } from "@testing-library/react-native";

/**
 * app/(tabs)/profil.tsx — hesap silme akışı.
 *
 * Uygulamanın geri alınamaz tek işlemi buradan başlıyor: tüm kayıtlar,
 * ölçümler ve depodaki fotoğraflar kalıcı olarak gidiyor. `deleteAccount`'un
 * kendi sözleşmesi account.test.ts'te; burada korunan şey EKRANIN kapısı —
 * silmenin onaysız çalışmaması ve işlem sürerken kutunun kapanmaması.
 */

const mockUseAuth = jest.fn();
const mockUseProfileStats = jest.fn();
const mockUseProfile = jest.fn();
const mockUseUnitPreference = jest.fn();
const mockSetUnit = jest.fn();
const mockDeleteMutate = jest.fn();
let mockDeletePending = false;
const mockSignOut = jest.fn();

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../profileStats", () => ({ useProfileStats: () => mockUseProfileStats() }));
jest.mock("../profile", () => ({ useProfile: () => mockUseProfile() }));
jest.mock("../units", () => ({
  ...jest.requireActual("../units"),
  useUnitPreference: () => mockUseUnitPreference(),
  useSetUnitPreference: () => ({ mutate: mockSetUnit }),
}));
jest.mock("../account", () => ({ deleteAccount: jest.fn() }));
jest.mock("../alerts", () => ({ alertError: jest.fn() }));
jest.mock("../supabase", () => ({ supabase: { auth: { signOut: () => mockSignOut() } } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: mockDeleteMutate, isPending: mockDeletePending }),
}));

import Profil from "@/app/(tabs)/profil";
import { alertError } from "../alerts";

beforeEach(() => {
  jest.clearAllMocks();
  // Gerçek supabase-js `{ error }` döndürüyor — mock da öyle olmalı, yoksa
  // ekranın hata kontrolü test edilemez hâle geliyor.
  mockSignOut.mockResolvedValue({ error: null });
  mockDeletePending = false;
  mockUseAuth.mockReturnValue({ user: { id: "u1", email: "ben@ornek.com" } });
  mockUseProfileStats.mockReturnValue({
    data: { firstDate: "2026-01-01", totalMemories: 12, longest: 5, monthsSinceFirst: 7 },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });
  mockUseProfile.mockReturnValue({ data: { name: "Samet", avatarUrl: null, avatarPath: null } });
  mockUseUnitPreference.mockReturnValue({ data: "metric" });
});

describe("profil — hesap silme", () => {
  it("silme ONAYSIZ çalışmaz", async () => {
    await render(<Profil />);

    await fireEvent.press(screen.getByText("Hesabı sil"));

    // Onay kutusu açıldı ama silme başlamadı.
    expect(screen.getByText("Hesabını sil?")).toBeTruthy();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("geri alınamaz olduğunu ve neyin gideceğini açıkça söyler", async () => {
    // Kullanıcı ne kaybedeceğini bilmeden onaylamamalı.
    await render(<Profil />);

    await fireEvent.press(screen.getByText("Hesabı sil"));

    expect(screen.getByText(/geri alınamaz/)).toBeTruthy();
    expect(screen.getByText(/fotoğrafların, ölçümlerin ve anıların/)).toBeTruthy();
  });

  it("onay verilince silmeyi başlatır", async () => {
    await render(<Profil />);

    await fireEvent.press(screen.getByText("Hesabı sil"));
    // Kutu içindeki onay butonu — listedeki satırla aynı metinde, sonuncusu kutudaki.
    const buttons = screen.getAllByText("Hesabı sil");
    await fireEvent.press(buttons[buttons.length - 1]);

    expect(mockDeleteMutate).toHaveBeenCalled();
  });

  it("vazgeçilince silmez", async () => {
    await render(<Profil />);

    await fireEvent.press(screen.getByText("Hesabı sil"));
    await fireEvent.press(screen.getByText("Vazgeç"));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByText("Hesabını sil?")).toBeNull();
  });

  it("silme sürerken kutu KAPANMAZ", async () => {
    // Kapanabilseydi kullanıcı işlem yarıda kaldı sanıp tekrar başlatabilirdi;
    // silme depoyu tarayıp temizlediği için birkaç saniye sürüyor.
    mockDeletePending = true;
    await render(<Profil />);

    await fireEvent.press(screen.getByText("Hesabı sil"));
    await fireEvent.press(screen.getByText("Vazgeç"));

    expect(screen.getByText("Hesabını sil?")).toBeTruthy();
  });
});

describe("profil — genel", () => {
  it("istatistikler yüklenemezse ham veri değil hata durumu gösterir", async () => {
    mockUseProfileStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<Profil />);

    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });

  it("çıkış yap oturumu kapatır", async () => {
    await render(<Profil />);

    await fireEvent.press(screen.getByText("Çıkış yap"));

    expect(mockSignOut).toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();
  });

  /**
   * signOut AĞ hatasında oturumu yerelde de temizlemiyor: supabase-js yalnızca
   * 401/403/404'ü yutup devam ediyor, diğer hatalarda `_removeSession()`a hiç
   * gelmeden erken dönüyor. Yani kullanıcı çıkış yaptığını sanıyor ama oturum
   * yerinde kalıyor — sessiz kalmak burada en kötü seçenek.
   */
  it("çıkış başarısız olursa kullanıcıya bildirir", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "Network request failed" } });

    await render(<Profil />);
    await fireEvent.press(screen.getByText("Çıkış yap"));

    expect(alertError).toHaveBeenCalledWith(
      "Çıkış yapılamadı",
      { message: "Network request failed" },
      "profile.signOut"
    );
  });
});
