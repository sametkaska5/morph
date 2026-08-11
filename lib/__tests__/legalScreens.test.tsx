/**
 * Yasal metinler: Gizlilik Politikası + Kullanım Şartları.
 *
 * NE TEST EDİLMİYOR: metnin kendisi. "16 yaşın altı" cümlesini birebir
 * doğrulayan bir test değişiklik dedektörüdür — biri ifadeyi düzeltince kırılır,
 * karşılığında hiçbir hata yakalamaz. Bu ekranlarda test edilmeye değer olan,
 * metnin İÇERİĞİ değil metnin SAĞLAMASI GEREKEN özellikleri:
 *
 * 1. Başlıklar benzersiz olmalı — LegalScreen bölümleri `key={s.heading}` ile
 *    çiziyor. İki bölüm aynı başlığı taşırsa React anahtarı çakışır.
 * 2. Hiçbir bölüm boş kalmamalı — boş gövdeli bir bölüm ekranda başlığıyla
 *    yapayalnız durur, gözle bakınca "eksik yüklenmiş" gibi görünür.
 * 3. Gizlilik politikası veri silme yolunu TARİF ETMELİ. Bu bir üslup tercihi
 *    değil: Play Console'un veri güvenliği beyanı kullanıcının verisini nasıl
 *    sileceğinin politikada yazmasını istiyor. O bölüm silinirse uygulama
 *    uyumsuz hâle gelir ve bunu yakalayacak başka hiçbir şey yok.
 * 4. İkisinde de bir iletişim adresi bulunmalı — adresin KENDİSİ değil, bir
 *    e-posta adresi biçiminde bir şeyin var olduğu doğrulanıyor.
 *
 * Bir de gerçek bir davranış var: geri düğmesi. Bu ekranlara Ayarlar'dan tam
 * sayfa olarak giriliyor; düğme çalışmazsa kullanıcı burada mahsur kalıyor ve
 * ekran doğru render edildiği için sorun gözle fark edilmiyor.
 */

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));

import type { ReactElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { LegalScreen } from "@/components/LegalScreen";
import PrivacyPolicyScreen from "@/app/privacy-policy";
import TermsScreen from "@/app/terms";

type Section = { heading: string; body: string };

/**
 * Ekranın LegalScreen'e verdiği veriyi doğrudan okur.
 *
 * Bu iki ekran saf veri taşıyıcısı — hook kullanmıyorlar, tek yaptıkları
 * LegalScreen'i sabit props'la döndürmek. Veriyi ekrana çizdirip metinden geri
 * okumak yerine props'tan okumak hem daha dürüst hem de bölümlerin SIRASINI ve
 * BENZERSİZLİĞİNİ görebilmenin tek yolu (aynı başlık iki kez çizilseydi
 * getByText zaten patlardı, ama nedenini söylemezdi).
 */
function sectionsOf(Screen: () => ReactElement): Section[] {
  return (Screen() as ReactElement<{ sections: Section[] }>).props.sections;
}

function titleOf(Screen: () => ReactElement): string {
  return (Screen() as ReactElement<{ title: string }>).props.title;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("LegalScreen", () => {
  const sections = [
    { heading: "Birinci başlık", body: "Birinci gövde." },
    { heading: "İkinci başlık", body: "İkinci gövde." },
  ];

  it("başlığı, güncelleme tarihini ve bütün bölümleri gösterir", async () => {
    await render(<LegalScreen title="Sözleşme" updatedAt="20 Temmuz 2026" sections={sections} />);

    expect(screen.getByText("Sözleşme")).toBeTruthy();
    expect(screen.getByText("Son güncelleme: 20 Temmuz 2026")).toBeTruthy();
    for (const s of sections) {
      expect(screen.getByText(s.heading)).toBeTruthy();
      expect(screen.getByText(s.body)).toBeTruthy();
    }
  });

  it("geri düğmesi önceki ekrana döner", async () => {
    await render(<LegalScreen title="Sözleşme" updatedAt="20 Temmuz 2026" sections={sections} />);

    await fireEvent.press(screen.getByLabelText("Geri dön"));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe.each([
  ["Gizlilik Politikası", PrivacyPolicyScreen],
  ["Kullanım Şartları", TermsScreen],
])("%s", (expectedTitle, Screen) => {
  it("doğru başlıkla açılır ve bölümlerini çizer", async () => {
    await render(<Screen />);

    expect(screen.getByText(expectedTitle)).toBeTruthy();
    expect(titleOf(Screen)).toBe(expectedTitle);
    for (const s of sectionsOf(Screen)) {
      expect(screen.getByText(s.heading)).toBeTruthy();
    }
  });

  it("bölüm başlıkları benzersiz (LegalScreen onları React anahtarı olarak kullanıyor)", () => {
    const headings = sectionsOf(Screen).map((s) => s.heading);

    expect(new Set(headings).size).toBe(headings.length);
  });

  it("hiçbir bölüm boş değil", () => {
    for (const s of sectionsOf(Screen)) {
      expect(s.heading.trim()).not.toBe("");
      expect(s.body.trim()).not.toBe("");
    }
  });

  it("bir iletişim adresi içerir", () => {
    const allText = sectionsOf(Screen)
      .map((s) => s.body)
      .join(" ");

    expect(allText).toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  });
});

describe("Gizlilik Politikası — mağaza yükümlülüğü", () => {
  it("kullanıcının verisini nasıl sileceğini tarif eder", () => {
    // Play Console'un veri güvenliği beyanı bunu şart koşuyor. Metnin nasıl
    // yazıldığı değil, silme YOLUNUN tarif edilmiş olması aranıyor.
    const allText = sectionsOf(PrivacyPolicyScreen)
      .map((s) => s.body)
      .join(" ");

    expect(allText).toMatch(/Hesabı Sil/);
  });
});
