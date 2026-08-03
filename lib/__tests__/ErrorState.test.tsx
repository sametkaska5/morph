import { render, screen, fireEvent, within } from "@testing-library/react-native";
import { ErrorState } from "@/components/ErrorState";

/**
 * ErrorState, dört ekranın paylaştığı hata görünümü. Buradaki testler iki şeyi
 * güvence altına alıyor: (1) hata sınıfına göre DOĞRU mesaj gösteriliyor,
 * (2) ham teknik metin ekrana asla sızmıyor — bileşenin varlık sebebi bu.
 *
 * NOT: @testing-library/react-native v14'te `render` ve `fireEvent` ASYNC.
 * await unutulursa `render` bir Promise döner ve sorgular sessizce çalışmaz.
 */

describe("ErrorState", () => {
  it("ağ hatasında bağlantı mesajını ve verinin güvende olduğunu gösterir", async () => {
    await render(<ErrorState error={new TypeError("Network request failed")} />);

    expect(screen.getByText("Bağlantı kurulamadı")).toBeTruthy();
    expect(screen.getByText(/güvende/)).toBeTruthy();
  });

  it("oturum hatasında yeniden giriş mesajı gösterir", async () => {
    await render(<ErrorState error={{ message: "JWT expired" }} />);

    expect(screen.getByText("Oturumun sona ermiş")).toBeTruthy();
  });

  it("tanınmayan hatada genel mesaja düşer", async () => {
    await render(<ErrorState error={new Error("kaboom")} />);

    expect(screen.getByText("Bir şeyler ters gitti")).toBeTruthy();
  });

  it("ham teknik hata metnini ASLA ekrana basmaz", async () => {
    await render(<ErrorState error={new Error("Network request failed")} />);

    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it("onRetry verildiğinde düğmeyi gösterir ve basınca çağırır", async () => {
    const onRetry = jest.fn();
    await render(<ErrorState error={new Error("x")} onRetry={onRetry} />);

    await fireEvent.press(screen.getByLabelText("Tekrar dene"));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("onRetry verilmediğinde düğmeyi hiç göstermez", async () => {
    await render(<ErrorState error={new Error("x")} />);

    expect(screen.queryByLabelText("Tekrar dene")).toBeNull();
  });

  it("başlık ve açıklamayı tek bir alert düğümü olarak duyurur", async () => {
    await render(<ErrorState error={new Error("x")} />);

    // Ekran okuyucu ikisini bir arada okumalı — ayrı ayrı değil.
    // Regex: toHaveTextContent varsayılan olarak TAM eşleşme arıyor, oysa
    // düğümün metni başlık + açıklamanın birleşimi.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Bir şeyler ters gitti/);
    expect(alert).toHaveTextContent(/Beklenmedik bir hata oluştu/);
  });

  it("retry düğmesi alert düğümünün DIŞINDA kalır (ayrı odak hedefi)", async () => {
    // Düğme accessible sarmalayıcının içine girseydi ekran okuyucuda ayrı bir
    // öğe olarak odaklanılamaz, dolayısıyla basılamazdı.
    await render(<ErrorState error={new Error("x")} onRetry={jest.fn()} />);

    // Metin araması yapmıyoruz: açıklama zaten "Tekrar denemek..." diye geçiyor
    // ve yanlış eşleşirdi. Doğrudan soruyu soruyoruz — düğme alert düğümünün
    // ALTINDA bir yerde mi?
    expect(within(screen.getByRole("alert")).queryByLabelText("Tekrar dene")).toBeNull();
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });
});
