/**
 * Karşılaştırma ekranındaki değişim satırının ekran okuyucu metni.
 *
 * İki ayrı sorunu birden çözüyor ve ikisi de sessizce geri gelebilir:
 *
 *  1. Satır görselde dört ayrı metin düğümü (ad, başlangıç, bitiş, değişim).
 *     Gruplanmazsa ekran okuyucu "Kilo", "80", "75", "↓ 5 kg" diye ilişkisiz
 *     parçalar okuyor; neyin neye dönüştüğü kayboluyor.
 *  2. Değişimin hedefe uygun olup olmadığı görselde SADECE renkle anlatılıyor
 *     (yeşil/kırmızı). Renk körü kullanıcı ve ekran okuyucu bu bilgiyi hiç
 *     alamıyor — etikete sözle girmesi şart.
 *
 * Ekran görünüşte çalışmaya devam ettiği için bu kayıplar gözle fark edilmez.
 */

jest.mock("expo-router", () => ({ router: {}, useLocalSearchParams: () => ({}) }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("expo-sharing", () => ({}));
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn() }));
jest.mock("../comparison", () => ({ useComparison: jest.fn() }));
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: null }) }));

import { measurementRowLabel } from "@/app/compare/index";

describe("measurementRowLabel", () => {
  it("azalan ve hedefe uygun değişimi sözle anlatır", () => {
    const label = measurementRowLabel({
      name: "Kilo",
      unit: "kg",
      startVal: 80,
      endVal: 75,
      delta: -5,
      isGood: true,
    });

    expect(label).toContain("Kilo");
    expect(label).toContain("80 kg");
    expect(label).toContain("75 kg");
    expect(label).toContain("azaldı");
    // Asıl mesele: renkle anlatılan yargı metne giriyor mu.
    expect(label).toContain("hedefe uygun");
  });

  it("hedeften uzaklaşan değişimi de sözle anlatır", () => {
    const label = measurementRowLabel({
      name: "Bel",
      unit: "cm",
      startVal: 90,
      endVal: 95,
      delta: 5,
      isGood: false,
    });

    expect(label).toContain("arttı");
    expect(label).toContain("hedeften uzak");
  });

  it("değişim yoksa yön/yargı uydurmaz", () => {
    const label = measurementRowLabel({
      name: "Kilo",
      unit: "kg",
      startVal: 80,
      endVal: 80,
      delta: 0,
      isGood: true,
    });

    expect(label).toContain("değişim yok");
    expect(label).not.toContain("arttı");
    expect(label).not.toContain("azaldı");
  });

  it("eksik ölçümde 'kayıt yok' der, sayı uydurmaz", () => {
    // Bir günde ölçüm girilmemişse görselde "—" görünüyor; ekran okuyucuya
    // bunun ne demek olduğu açıkça söylenmeli.
    const label = measurementRowLabel({
      name: "Kol",
      unit: "cm",
      startVal: null,
      endVal: 35,
      delta: null,
      isGood: true,
    });

    expect(label).toContain("kayıt yok");
    expect(label).toContain("35 cm");
  });
});
