/**
 * Yardım & Destek ekranı.
 *
 * Yasal metinlerden farklı olarak burada gerçek davranış var ve üçü de sessizce
 * bozulabilecek türden:
 *
 * 1. Geri bildirim düğmesi bir `mailto:` URL'i KURUYOR. Konu başlığı
 *    encodeURIComponent'ten geçmezse içindeki boşluklar URL'i bozar ve bazı
 *    e-posta uygulamaları bağlantıyı hiç açmaz — ekranda ise her şey normal
 *    görünür.
 * 2. İki yasal ekrana yönlendirme sabit yol dizeleriyle yapılıyor. Yolda bir
 *    harf hatası kullanıcıyı "bu sayfa yok" ekranına düşürür.
 * 3. Sürüm numarası burada yazıyor. Kullanıcıdan hata bildirimi isterken
 *    baktığımız yer burası; `expoConfig` okunamazsa herkese "—" gösterip
 *    bildirimleri sürümsüz bırakabilir.
 *
 * SSS'nin METNİ test edilmiyor (bkz. legalScreens.test.tsx'teki gerekçe), yalnızca
 * soruların benzersiz olduğu — ekran onları React anahtarı olarak kullanıyor.
 */

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: (to: unknown) => mockPush(to) },
}));

// Sürümün iki dalını da denemek için değiştirilebilir olmalı: okunabildiği hâl
// ve hiç gelmediği hâl.
let mockVersion: string | undefined = "9.9.9";

jest.mock("expo-constants", () => ({
  __esModule: true,
  get default() {
    return { expoConfig: { version: mockVersion } };
  },
}));

import fs from "fs";
import path from "path";
import { Linking } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import HelpScreen, { FAQ } from "@/app/settings/help";

let openURL: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockVersion = "9.9.9";
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

afterEach(() => {
  openURL.mockRestore();
});

describe("Yardım ekranı", () => {
  it("sık sorulanların hepsini gösterir", async () => {
    await render(<HelpScreen />);

    for (const item of FAQ) {
      expect(screen.getByText(item.q)).toBeTruthy();
      expect(screen.getByText(item.a)).toBeTruthy();
    }
  });

  it("sorular benzersiz (ekran onları React anahtarı olarak kullanıyor)", () => {
    const questions = FAQ.map((f) => f.q);

    expect(new Set(questions).size).toBe(questions.length);
  });

  it("hiçbir soru veya cevap boş değil", () => {
    for (const item of FAQ) {
      expect(item.q.trim()).not.toBe("");
      expect(item.a.trim()).not.toBe("");
    }
  });

  it("geri düğmesi önceki ekrana döner", async () => {
    await render(<HelpScreen />);

    await fireEvent.press(screen.getByLabelText("Geri dön"));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("yasal metinlere GERÇEKTEN var olan yollarla gider", async () => {
    await render(<HelpScreen />);

    await fireEvent.press(screen.getByText("Gizlilik Politikası"));
    await fireEvent.press(screen.getByText("Kullanım Şartları"));

    const routes = mockPush.mock.calls.map((c) => String(c[0]));
    expect(routes).toEqual(["/privacy-policy", "/terms"]);

    // expo-router dosya tabanlı: "/x" yolunun karşılığı app/x.tsx. Yoldaki bir
    // harf hatası tip denetiminden geçer ama kullanıcıyı "bu sayfa yok"
    // ekranına düşürür — dizede kalmayıp dosyayı da arıyoruz.
    for (const route of routes) {
      expect(fs.existsSync(path.join(process.cwd(), "app", `${route}.tsx`))).toBe(true);
    }
  });
});

describe("Geri bildirim düğmesi", () => {
  it("e-posta uygulamasını konusu KODLANMIŞ bir mailto ile açar", async () => {
    await render(<HelpScreen />);

    await fireEvent.press(screen.getByLabelText("Geri bildirim gönder"));

    expect(openURL).toHaveBeenCalledTimes(1);
    const url = String(openURL.mock.calls[0][0]);

    // Adresin kendisi sabitlenmiyor — biçimi ve konunun kodlanmış olması aranıyor.
    expect(url).toMatch(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+\?subject=/);
    // Ham boşluk mailto'yu bozar: encodeURIComponent düşerse burası yakalar.
    expect(url).not.toMatch(/\s/);
    expect(decodeURIComponent(url.split("subject=")[1])).toBe("Remory Geri Bildirim");
  });

  it("ekran okuyucuya uygulamadan çıkılacağını önceden söyler", async () => {
    // İpucu olmadan ekran okuyucu kullanıcısı için uygulama bir anda kapanmış
    // gibi olur; bu yüzden bilerek konmuş bir ipucu, kozmetik değil.
    await render(<HelpScreen />);

    expect(screen.getByLabelText("Geri bildirim gönder").props.accessibilityHint).toBe(
      "E-posta uygulamanı açar",
    );
  });
});

describe("Sürüm satırı", () => {
  it("uygulama sürümünü gösterir", async () => {
    await render(<HelpScreen />);

    expect(screen.getByText("Remory v9.9.9")).toBeTruthy();
  });

  it("sürüm okunamazsa satırı boş bırakmaz", async () => {
    mockVersion = undefined;

    await render(<HelpScreen />);

    expect(screen.getByText("Remory v—")).toBeTruthy();
  });
});
