import { render, screen, fireEvent } from "@testing-library/react-native";
import type { ProfileInfo } from "../profile";

/**
 * app/profile/edit.tsx — form doldurma davranışı.
 *
 * NEDEN BU TEST: bu ekranda form, veri gelince `useEffect` ile değil RENDER
 * SIRASINDA "önceki değerle karşılaştır" kalıbıyla dolduruluyor. Kalıp doğru
 * uygulanmazsa iki şey olur ve ikisi de sessizdir:
 *   1. Form hiç dolmaz (karşılaştırma hep eşit sanır), ya da
 *   2. Kullanıcının yazdığı her şey her render'da geri ezilir.
 * Aşağıdaki testler tam olarak bu ikisini kilitliyor.
 */

const mockUseAuth = jest.fn();
const mockUseProfile = jest.fn();
const mockMutate = jest.fn();
const mockRouterBack = jest.fn();

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../profile", () => ({
  useProfile: () => mockUseProfile(),
  useUpdateProfile: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock("expo-router", () => ({ router: { back: () => mockRouterBack() } }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));
jest.mock("../storage", () => ({ uploadAvatar: jest.fn() }));
jest.mock("../supabase", () => ({ supabase: { storage: { from: () => ({ remove: jest.fn() }) } } }));
jest.mock("../alerts", () => ({ alertError: jest.fn() }));

import EditProfileScreen from "@/app/profile/edit";

const PROFILE: ProfileInfo = {
  name: "Samet",
  avatarPath: "u1/avatar/a.jpg",
  avatarUrl: "https://example.test/a.jpg",
  createdAt: "2026-01-01",
};

/** Ekrandaki isim alanının o anki değeri. */
function nameValue() {
  return screen.getByLabelText("İsim").props.value;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseProfile.mockReturnValue({ data: PROFILE, isLoading: false });
});

describe("profil düzenleme — form doldurma", () => {
  it("veri hazırken formu ilk render'da doldurur", async () => {
    await render(<EditProfileScreen />);

    expect(nameValue()).toBe("Samet");
  });

  it("yükleme bitip veri gelince formu doldurur (asıl senaryo)", async () => {
    // Gerçek akış: ekran önce yükleniyor, sonra sorgu dönüyor.
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = await render(<EditProfileScreen />);
    expect(screen.queryByLabelText("İsim")).toBeNull(); // yükleme göstergesi

    mockUseProfile.mockReturnValue({ data: PROFILE, isLoading: false });
    await rerender(<EditProfileScreen />);

    expect(nameValue()).toBe("Samet");
  });

  it("kullanıcının yazdığını sonraki render'lar EZMEZ", async () => {
    // En kritik test: render sırasında setState yapan bir kalıp, yanlış
    // yazılırsa her render'da formu profil verisine geri döndürür ve
    // kullanıcı yazdıkça yazısı kaybolur.
    const { rerender } = await render(<EditProfileScreen />);

    await fireEvent.changeText(screen.getByLabelText("İsim"), "Yeni İsim");
    expect(nameValue()).toBe("Yeni İsim");

    // Aynı profil nesnesiyle birkaç kez yeniden render — hiçbiri ezmemeli.
    await rerender(<EditProfileScreen />);
    await rerender(<EditProfileScreen />);

    expect(nameValue()).toBe("Yeni İsim");
  });

  it("profil verisi GERÇEKTEN değişince formu tazeler", async () => {
    const { rerender } = await render(<EditProfileScreen />);
    expect(nameValue()).toBe("Samet");

    // Örn. refetch farklı veri döndürdü (başka cihazdan güncellenmiş).
    mockUseProfile.mockReturnValue({
      data: { ...PROFILE, name: "Güncellenmiş" },
      isLoading: false,
    });
    await rerender(<EditProfileScreen />);

    expect(nameValue()).toBe("Güncellenmiş");
  });

  it("adı null olan profilde boş alanla açılır, çökmez", async () => {
    mockUseProfile.mockReturnValue({ data: { ...PROFILE, name: null }, isLoading: false });
    await render(<EditProfileScreen />);

    expect(nameValue()).toBe("");
  });
});

describe("profil düzenleme — kaydetme", () => {
  it("ismi kırpıp gönderir ve avatar yolunu korur", async () => {
    await render(<EditProfileScreen />);

    await fireEvent.changeText(screen.getByLabelText("İsim"), "  Ahmet  ");
    await fireEvent.press(screen.getByText("Kaydet"));

    expect(mockMutate).toHaveBeenCalledWith(
      { name: "Ahmet", avatar_path: "u1/avatar/a.jpg" },
      expect.any(Object)
    );
  });

  it("isim tamamen boşaltılırsa null gönderir (boş string değil)", async () => {
    await render(<EditProfileScreen />);

    await fireEvent.changeText(screen.getByLabelText("İsim"), "   ");
    await fireEvent.press(screen.getByText("Kaydet"));

    expect(mockMutate).toHaveBeenCalledWith(
      { name: null, avatar_path: "u1/avatar/a.jpg" },
      expect.any(Object)
    );
  });
});
