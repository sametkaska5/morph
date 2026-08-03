import { render, screen, fireEvent } from "@testing-library/react-native";
import type { PickableEntry } from "../entries";

/**
 * app/compare/pick.tsx — karşılaştırma için iki fotoğraf seçme.
 *
 * Buradaki mantık küçük ama kolay bozulur: en fazla İKİ seçim tutulur, üçüncüye
 * dokunulduğunda EN ESKİ seçim düşer. Ayrıca hücreler `memo`'lu ve `onToggle`
 * sabit referans olmak zorunda — bu ekranda her dokunuşta 60 hücre yeniden
 * çiziliyordu, düzeltmenin çalışmaya devam ettiğini seçim davranışı üzerinden
 * doğruluyoruz.
 */

const mockUsePickableEntries = jest.fn();
const mockPrefetchQuery = jest.fn();
const mockReplace = jest.fn();

jest.mock("../entries", () => ({ usePickableEntries: () => mockUsePickableEntries() }));
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: (a: unknown) => mockReplace(a) },
}));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("../storage", () => ({ photoCacheKey: (p: string) => p }));
jest.mock("../comparison", () => ({ fetchComparisonBetween: jest.fn() }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ prefetchQuery: (o: unknown) => mockPrefetchQuery(o) }),
}));

import PickComparison from "@/app/compare/pick";

const ENTRIES: PickableEntry[] = [
  { id: "e1", date: "2026-01-10", photoUrl: "u1", photoPath: "p1" },
  { id: "e2", date: "2026-02-10", photoUrl: "u2", photoPath: "p2" },
  { id: "e3", date: "2026-03-10", photoUrl: "u3", photoPath: "p3" },
];

const cell = (label: RegExp) => screen.getByLabelText(label);

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePickableEntries.mockReturnValue({ data: ENTRIES, isLoading: false });
});

describe("karşılaştırma seçimi", () => {
  it("seçim sayacını başlıkta gösterir", async () => {
    await render(<PickComparison />);

    expect(screen.getByText(/\(0\/2\)/)).toBeTruthy();

    await fireEvent.press(cell(/10 Ocak 2026/));

    expect(screen.getByText(/\(1\/2\)/)).toBeTruthy();
  });

  it("seçilen hücreyi sıra numarasıyla işaretler", async () => {
    await render(<PickComparison />);

    await fireEvent.press(cell(/10 Ocak 2026/));
    await fireEvent.press(cell(/10 Şubat 2026/));

    expect(cell(/10 Ocak 2026.*1\. seçim/)).toBeTruthy();
    expect(cell(/10 Şubat 2026.*2\. seçim/)).toBeTruthy();
  });

  it("aynı hücreye tekrar dokunmak seçimi kaldırır", async () => {
    await render(<PickComparison />);

    await fireEvent.press(cell(/10 Ocak 2026/));
    await fireEvent.press(cell(/10 Ocak 2026/));

    expect(screen.getByText(/\(0\/2\)/)).toBeTruthy();
  });

  it("üçüncü seçimde EN ESKİ seçim düşer", async () => {
    await render(<PickComparison />);

    await fireEvent.press(cell(/10 Ocak 2026/)); // 1.
    await fireEvent.press(cell(/10 Şubat 2026/)); // 2.
    await fireEvent.press(cell(/10 Mart 2026/)); // Ocak düşmeli

    expect(screen.getByText(/\(2\/2\)/)).toBeTruthy();
    expect(cell(/10 Şubat 2026.*1\. seçim/)).toBeTruthy();
    expect(cell(/10 Mart 2026.*2\. seçim/)).toBeTruthy();
    // Ocak artık seçili değil — etiketinde seçim ibaresi olmamalı.
    expect(screen.getByLabelText("10 Ocak 2026 tarihli anı")).toBeTruthy();
  });

  it("iki seçim tamamlanmadan karşılaştırmaya geçmez", async () => {
    await render(<PickComparison />);

    await fireEvent.press(cell(/10 Ocak 2026/));
    await fireEvent.press(screen.getByText("Karşılaştır"));

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("iki seçimle veriyi ÖN YÜKLEYİP karşılaştırma ekranına geçer", async () => {
    // Prefetch, geçiş animasyonu sürerken sorguyu başlatıyor; ekran açıldığında
    // veri çoğunlukla hazır oluyor. Bu davranış kaybolursa geçiş yavaşlar.
    await render(<PickComparison />);

    await fireEvent.press(cell(/10 Ocak 2026/));
    await fireEvent.press(cell(/10 Şubat 2026/));
    await fireEvent.press(screen.getByText("Karşılaştır"));

    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["comparison", "e1", "e2"] })
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/compare",
      params: { a: "e1", b: "e2" },
    });
  });
});
