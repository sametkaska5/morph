/**
 * Açılış yönlendirmesi ve karşılama ekranı.
 *
 * Karşılama ekranı bir yıl boyunca ölü koddu: `app/index.tsx` doğrudan giriş
 * ekranına yönlendirdiği için hiç görünmüyordu. Şimdi bağlandı — ama bu tür bir
 * "bir kez göster" mantığının iki sessiz kırılma biçimi var ve ikisi de gözle
 * bakınca fark edilmiyor:
 *
 *  1. Bayrak hiç yazılmaz → kullanıcı HER açılışta karşılamaya düşer.
 *  2. Depolama okunamaz → kullanıcı karşılamada kilitlenip uygulamaya giremez.
 *
 * Bir de ürün kuralı var: oturumu olan kullanıcıya karşılama gösterilmez.
 * Uygulamayı silip yeniden kuran birinde cihaz bayrağı sıfırlanıyor ama oturum
 * geri geliyor — o kişiye "hoş geldin, işte Remory" demek yanlış olurdu.
 */

const mockRedirect = jest.fn();
const mockReplace = jest.fn();
let mockSession: object | null = null;
let mockLoading = false;

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  router: { replace: (a: unknown) => mockReplace(a) },
}));

jest.mock("../useAuth", () => ({
  useAuth: () => ({ session: mockSession, loading: mockLoading, user: null }),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import Index from "@/app/index";
import Welcome from "@/app/(onboarding)/welcome";
import { ONBOARDING_SEEN_KEY } from "../onboarding";

beforeEach(async () => {
  jest.clearAllMocks();
  mockSession = null;
  mockLoading = false;
  await AsyncStorage.clear();
});

describe("açılış yönlendirmesi", () => {
  it("ilk açılışta karşılama ekranına götürür", async () => {
    await render(<Index />);

    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/(onboarding)/welcome"));
  });

  it("karşılama görüldüyse giriş ekranına götürür", async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");

    await render(<Index />);

    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/(auth)"));
    expect(mockRedirect).not.toHaveBeenCalledWith("/(onboarding)/welcome");
  });

  it("oturum varsa karşılamayı ATLAR (bayrak yazılmamış olsa bile)", async () => {
    // Uygulamayı silip yeniden kuran kullanıcı: cihaz bayrağı sıfır ama oturum geri geldi.
    mockSession = { access_token: "x" };

    await render(<Index />);

    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/(auth)"));
    expect(mockRedirect).not.toHaveBeenCalledWith("/(onboarding)/welcome");
  });

  it("oturum yüklenirken hiçbir yere yönlendirmez", async () => {
    // Erken yönlendirme, oturumu olan kullanıcıyı bir an giriş ekranında gösterirdi.
    mockLoading = true;

    await render(<Index />);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("depolama okunamıyorsa kullanıcıyı karşılamada KİLİTLEMEZ", async () => {
    // Okuma kalıcı olarak patlıyorsa yazma da patlar; karşılamayı göstermek
    // kullanıcıyı her açılışta aynı ekrana hapsederdi.
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("storage bozuk"));

    await render(<Index />);

    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/(auth)"));
  });
});

describe("karşılama ekranı", () => {
  it("İleri, görüldü bayrağını yazar ve giriş ekranına geçer", async () => {
    await render(<Welcome />);

    await fireEvent.press(screen.getByLabelText("Devam et"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("1")
    );
    expect(mockReplace).toHaveBeenCalledWith("/(auth)");
  });

  it("sekmelere DEĞİL giriş ekranına gider", async () => {
    // Eski hedef `/(tabs)`'tı: oturumsuz kullanıcıyı tab layout anında geri atardı.
    await render(<Welcome />);

    await fireEvent.press(screen.getByLabelText("Devam et"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalledWith("/(tabs)");
  });
});
