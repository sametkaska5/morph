import { render, screen, fireEvent } from "@testing-library/react-native";
import type { CapsuleEntry } from "../entries";

/**
 * app/(tabs)/zaman-kapsulu.tsx — Anı Akışı (dikey sayfalayıcı).
 *
 * Sonsuz sorgu + `memo`'lu sayfalar + yeni ErrorState entegrasyonu. Testler
 * durum geçişlerini (yükleme / hata / boş / veri) ve sayfa içeriğinin doğru
 * çizildiğini kilitliyor.
 */

const mockUseCapsuleEntries = jest.fn();
const mockOpenCapturePicker = jest.fn();
const mockPrefetchEdit = jest.fn();
const mockPrefetchTypes = jest.fn();

jest.mock("../entries", () => ({
  useCapsuleEntries: () => mockUseCapsuleEntries(),
  usePrefetchEditableEntry: () => mockPrefetchEdit,
}));
jest.mock("../measurementTypes", () => ({
  usePrefetchMeasurementTypes: () => mockPrefetchTypes,
}));
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("../units", () => ({
  ...jest.requireActual("../units"),
  useUnitPreference: () => ({ data: "metric" }),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("../storage", () => ({ photoCacheKey: (p: string) => p }));
jest.mock("../capture", () => ({ openCapturePicker: () => mockOpenCapturePicker() }));

import ZamanKapsulu from "@/app/(tabs)/zaman-kapsulu";

const ENTRY: CapsuleEntry = {
  id: "e1",
  date: "2026-07-15",
  note: "harika bir gündü",
  photoUrl: "https://example.test/a.jpg",
  photoPath: "u1/e1/a.jpg",
  measurements: [{ name: "kilo", unit: "kg", value: 80 }],
  program: [{ name: "Bench Press", setCount: 3 }],
};

function mockCapsule(over: Record<string, unknown> = {}) {
  mockUseCapsuleEntries.mockReturnValue({
    data: { pages: [[ENTRY]] },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...over,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCapsule();
});

describe("anı akışı", () => {
  it("kaydı tarihi ve sayfa sayacıyla gösterir", async () => {
    await render(<ZamanKapsulu />);

    expect(screen.getByText("Anı Akışı")).toBeTruthy();
    expect(screen.getByText("1/1")).toBeTruthy();
  });

  it("hata durumunda ham metin değil ErrorState + yeniden deneme gösterir", async () => {
    const refetch = jest.fn();
    mockCapsule({ data: undefined, error: new TypeError("Network request failed"), refetch });
    await render(<ZamanKapsulu />);

    expect(screen.getByText("Bağlantı kurulamadı")).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();

    await fireEvent.press(screen.getByLabelText("Tekrar dene"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("hiç kayıt yokken boş durum gösterir ve ekleme çağrısı yapar", async () => {
    mockCapsule({ data: { pages: [[]] } });
    await render(<ZamanKapsulu />);

    expect(screen.getByText("Henüz bir kaydın yok")).toBeTruthy();
    await fireEvent.press(screen.getByText("İlk anını ekle"));
    expect(mockOpenCapturePicker).toHaveBeenCalled();
  });

  /**
   * Kart çevrilince düzenleme verisi ÖNDEN çekiliyor.
   *
   * Düzenle düğmesi yalnızca arka yüzde; çevirme animasyonu 450 ms sürüyor ve
   * kullanıcının düğmeyi bulup dokunması da zaman alıyor. Sorgu o boşlukta
   * tamamlanınca düzenleme ekranı ilk karede dolu açılıyor — bu çağrı düşerse
   * ekran yine açılır ama "Kaydet" ve ölçüm alanları bir ağ turu kadar bekler,
   * yani hata sessizdir. Test onu sessiz olmaktan çıkarıyor.
   */
  it("kart çevrilince düzenleme verisini önden çeker", async () => {
    await render(<ZamanKapsulu />);

    expect(mockPrefetchEdit).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText(/tarihli anı/));
    expect(mockPrefetchEdit).toHaveBeenCalledWith("e1");
    // Ölçüm tipleri de aynı anda: form alanları o listeden üretiliyor, yani
    // kayıt gelse bile liste gelmeden form çizilmiyor.
    expect(mockPrefetchTypes).toHaveBeenCalled();
  });

  it("kart geri çevrilince tekrar çekmez", async () => {
    await render(<ZamanKapsulu />);

    const card = screen.getByLabelText(/tarihli anı/);
    await fireEvent.press(card); // ön → arka: çeker
    await fireEvent.press(card); // arka → ön: çekmemeli

    expect(mockPrefetchEdit).toHaveBeenCalledTimes(1);
  });

  it("birden fazla sayfada sayacı doğru gösterir", async () => {
    mockCapsule({
      data: { pages: [[ENTRY, { ...ENTRY, id: "e2", date: "2026-07-14" }]] },
    });
    await render(<ZamanKapsulu />);

    expect(screen.getByText("1/2")).toBeTruthy();
  });
});
