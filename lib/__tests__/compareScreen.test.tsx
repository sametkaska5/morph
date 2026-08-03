import { render, screen, fireEvent } from "@testing-library/react-native";
import type { ComparisonData } from "../comparison";

/**
 * app/compare/index.tsx — iki kaydın karşılaştırması.
 *
 * Asıl mantık ölçüm satırlarının hesaplanması: yalnızca EN AZ BİR tarafında
 * değer olan ölçümler listelenir, fark hedef yönüne göre iyi/kötü renklenir.
 * Ayrıca yeni ErrorState entegrasyonu burada da doğrulanıyor.
 */

const mockUseComparison = jest.fn();

jest.mock("../comparison", () => ({ useComparison: () => mockUseComparison() }));
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("../units", () => ({
  ...jest.requireActual("../units"),
  useUnitPreference: () => ({ data: "metric" }),
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ a: "e1", b: "e2" }),
}));
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("../alerts", () => ({ alertError: jest.fn() }));

import Compare from "@/app/compare/index";

const DATA: ComparisonData = {
  start: { entryId: "e1", date: "2026-01-01", photoUrl: "a", measurements: { kilo: 85, bel: 95 } },
  end: { entryId: "e2", date: "2026-07-01", photoUrl: "b", measurements: { kilo: 80 } },
  daysBetween: 181,
  types: [
    { id: "kilo", name: "kilo", unit: "kg", targetDirection: "decrease_is_good" },
    { id: "bel", name: "bel", unit: "cm", targetDirection: "decrease_is_good" },
    { id: "gogus", name: "göğüs", unit: "cm", targetDirection: "increase_is_good" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseComparison.mockReturnValue({ data: DATA, isLoading: false, error: null, refetch: jest.fn() });
});

describe("karşılaştırma ekranı", () => {
  it("iki tarih arasındaki gün sayısını gösterir", async () => {
    await render(<Compare />);

    expect(screen.getByText(/181/)).toBeTruthy();
  });

  it("iki tarafta da değeri OLMAYAN ölçümü listelemez", async () => {
    // "göğüs" hiçbir tarafta yok — satır olarak çizilmemeli, yoksa boş
    // satırlar tabloyu şişirirdi.
    await render(<Compare />);

    expect(screen.getByText("kilo")).toBeTruthy();
    expect(screen.getByText("bel")).toBeTruthy();
    expect(screen.queryByText("göğüs")).toBeNull();
  });

  it("yalnızca tek tarafta değeri olan ölçümü yine de gösterir", async () => {
    // "bel" sadece başlangıçta var; fark hesaplanamaz ama bilgi gösterilmeli.
    await render(<Compare />);

    expect(screen.getByText("bel")).toBeTruthy();
  });

  it("hata durumunda ham metin değil ErrorState + yeniden deneme gösterir", async () => {
    const refetch = jest.fn();
    mockUseComparison.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new TypeError("Network request failed"),
      refetch,
    });
    await render(<Compare />);

    expect(screen.getByText("Bağlantı kurulamadı")).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();

    await fireEvent.press(screen.getByLabelText("Tekrar dene"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("veri yoksa açıklayıcı mesaj gösterir", async () => {
    mockUseComparison.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    await render(<Compare />);

    expect(screen.getByText("Karşılaştırma yüklenemedi.")).toBeTruthy();
  });
});
