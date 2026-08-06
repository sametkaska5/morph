import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { showAlert, useAppAlertStore } from "../appAlert";
import { AppAlert } from "@/components/AppAlert";

/**
 * Uygulamanın kendi uyarı kutusu — native `Alert.alert` yerine.
 *
 * İki şey korunuyor:
 *
 *  1. React DIŞINDAN çağrılabilmesi. Uyarıların bir kısmı ekranda değil modülde
 *     üretiliyor (lib/capture.ts izin uyarıları, lib/alerts.ts hata bildirimi) —
 *     orada hook kullanılamaz. `showAlert` bir fonksiyon olmalı, hook değil.
 *  2. Kapanınca durumun temizlenmesi. Kalıcı olsaydı bir sonraki uyarı eskisinin
 *     üstüne binerdi ya da kutu kendiliğinden yeniden açılırdı.
 */

beforeEach(() => {
  useAppAlertStore.setState({ visible: false, title: "", message: "", tone: "info" });
});

/**
 * showAlert store'u React DIŞINDAN güncelliyor (gerçek kullanımda da öyle:
 * modüllerden çağrılıyor). Testte React'in bunu görebilmesi için act gerekiyor.
 */
async function fire(fn: () => void) {
  await act(async () => {
    fn();
  });
}

describe("showAlert", () => {
  it("başlangıçta kutu görünmez", async () => {
    await render(<AppAlert />);

    expect(screen.queryByText("Tamam")).toBeNull();
  });

  it("React dışından çağrılabilir ve başlık/mesajı gösterir", async () => {
    // Hook değil düz fonksiyon olması şart: lib/capture.ts gibi modüllerden
    // çağrılıyor, orada hook kullanılamaz.
    await render(<AppAlert />);

    await fire(() => showAlert("İzin gerekli", "Kamera iznini açman gerekiyor."));

    expect(screen.getByText("İzin gerekli")).toBeTruthy();
    expect(screen.getByText("Kamera iznini açman gerekiyor.")).toBeTruthy();
  });

  it("tek 'Tamam' butonlu bilgi kipinde açılır (onay kutusu değil)", async () => {
    await render(<AppAlert />);

    await fire(() => showAlert("Kaydedildi", "Paylaşım kartı galerine kaydedildi."));

    expect(screen.getByText("Tamam")).toBeTruthy();
    expect(screen.queryByText("Vazgeç")).toBeNull();
  });

  it("Tamam'a basınca kapanır ve durum temizlenir", async () => {
    // Temizlenmezse bir sonraki uyarı eskisinin üstüne biner.
    await render(<AppAlert />);
    await fire(() => showAlert("Bir hata", "mesaj"));

    await fireEvent.press(screen.getByText("Tamam"));

    expect(screen.queryByText("Bir hata")).toBeNull();
    expect(useAppAlertStore.getState().visible).toBe(false);
  });

  it("art arda çağrılınca son uyarıyı gösterir", async () => {
    await render(<AppAlert />);

    await fire(() => showAlert("İlk", "bir"));
    await fire(() => showAlert("İkinci", "iki"));

    expect(screen.getByText("İkinci")).toBeTruthy();
    expect(screen.queryByText("İlk")).toBeNull();
  });

  it("tonu 'danger' verilince hata görünümüne geçer", async () => {
    await render(<AppAlert />);

    await fire(() => showAlert("Kayıt başarısız", "Bağlantı kurulamadı.", "danger"));

    expect(useAppAlertStore.getState().tone).toBe("danger");
    expect(screen.getByText("Kayıt başarısız")).toBeTruthy();
  });
});

/**
 * alertError, uygulamadaki TÜM hata bildirimlerinin geçtiği yer. Temalı kutuya
 * bağlı kalması tek satırlık bir bağımlılık ama kapsamı geniş.
 */
describe("alertError → temalı kutu", () => {
  it("hata mesajını danger tonuyla kutuya düşürür", async () => {
    const { alertError } = require("../alerts");
    await render(<AppAlert />);

    await fire(() =>
      alertError("Kayıt başarısız", new TypeError("Network request failed"), "test.flow")
    );

    expect(screen.getByText("Kayıt başarısız")).toBeTruthy();
    // Ham İngilizce metin DEĞİL, çevrilmiş kullanıcı mesajı görünmeli.
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    expect(useAppAlertStore.getState().tone).toBe("danger");
  });
});
