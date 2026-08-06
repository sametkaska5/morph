/**
 * "Bu sayfa yok" ekranı.
 *
 * Statik metinli ekranların (yasal metinler, yardım) render testi yok — içerikleri
 * değişmiyor. Bu ekran farklı: VAR OLMA SEBEBİ tek bir eylem, kurtarma yolu.
 * Düğme çalışmazsa kullanıcı derin bağlantıyla düştüğü çıkmazda kalıyor ve
 * uygulamayı kapatmaktan başka seçeneği olmuyor — üstelik bu, ekran doğru
 * render edildiği için gözle bakınca fark edilmiyor.
 *
 * `replace` (push değil) olması da test ediliyor: push olsaydı geri tuşu
 * kullanıcıyı bulunamayan sayfaya geri getirirdi.
 */

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: { replace: (a: unknown) => mockReplace(a) },
  usePathname: () => "/entry/silinmis-kayit",
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import NotFound from "@/app/+not-found";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("+not-found ekranı", () => {
  it("ne olduğunu açıklayan bir mesaj gösterir", async () => {
    await render(<NotFound />);

    expect(screen.getByText("Bu sayfa yok")).toBeTruthy();
  });

  it("ana ekrana dönüş düğmesi route'u DEĞİŞTİRİR (push etmez)", async () => {
    await render(<NotFound />);

    await fireEvent.press(screen.getByLabelText("Ana ekrana dön"));

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("tutmayan yolu hata bildirimi için ekranda gösterir", async () => {
    // "Bağlantın çalışmıyor" diyen kullanıcıdan ekran görüntüsü istediğimizde
    // asıl yolun elimizde olması için.
    await render(<NotFound />);

    expect(screen.getByText("/entry/silinmis-kayit")).toBeTruthy();
  });
});
