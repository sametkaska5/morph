import { render, screen, fireEvent } from "@testing-library/react-native";

/**
 * app/entry/[id].tsx — kayıt detayı (yatay sayfalayıcı).
 *
 * Kapsanan riskler:
 *  1. AKTİF İNDEKS senkronizasyonu — sıra verisi geç geldiğinde aktif sayfa
 *     render sırasında (effect'siz) hizalanıyor. Yanlış kurulursa ya hiç
 *     hizalanmaz ya sonsuz döngüye girer.
 *  2. Düzenle/sil EKRANDA GÖRÜNEN kayda uygulanmalı — kaydırdıktan sonra hâlâ
 *     URL'deki ilk id'ye işlem yapmak SESSİZCE YANLIŞ KAYDI SİLERDİ.
 *  3. Silme sonrası navigasyon ekranın, invalidation'lar hook'un işi.
 */

const mockUseEntryDetail = jest.fn();
const mockUseEntryOrder = jest.fn();
const mockDeleteMutate = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: "e2" };

jest.mock("../entries", () => ({
  useEntryDetail: () => mockUseEntryDetail(),
  useEntryOrder: () => mockUseEntryOrder(),
  useDeleteEntry: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));
jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("../storage", () => ({ photoCacheKey: (p: string) => p }));

import EntryDetail from "@/app/entry/[id]";

const DETAIL = {
  id: "e2",
  date: "2026-07-15",
  note: "harika gündü",
  photoUrl: "https://x/a.jpg",
  photoPath: "u1/e2/a.jpg",
  measurement_values: [{ value: 80, measurement_types: { name: "kilo", unit: "kg" } }],
  workout_items: [
    {
      name: "Bench Press",
      order_index: 0,
      workout_sets: [
        { reps: 8, weight: 60, order_index: 0 },
        { reps: 6, weight: 65, order_index: 1 },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: "e2" };
  mockUseEntryDetail.mockReturnValue({ data: DETAIL, isLoading: false, error: null, refetch: jest.fn() });
  mockUseEntryOrder.mockReturnValue({ data: ["e1", "e2", "e3"], isLoading: false });
});

describe("kayıt detayı — içerik", () => {
  it("tarihi, ölçümleri ve programı gösterir", async () => {
    await render(<EntryDetail />);

    expect(screen.getByText("15.07.2026")).toBeTruthy();
    expect(screen.getByText("kilo")).toBeTruthy();
    expect(screen.getByText("80 kg")).toBeTruthy();
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("60 kg × 8")).toBeTruthy();
    expect(screen.getByText("harika gündü")).toBeTruthy();
  });

  it("seti olmayan hareketi 'Set girilmemiş' diye işaretler", async () => {
    mockUseEntryDetail.mockReturnValue({
      data: { ...DETAIL, workout_items: [{ name: "Koşu", order_index: 0, workout_sets: [] }] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    await render(<EntryDetail />);

    expect(screen.getByText("Set girilmemiş")).toBeTruthy();
  });

  it("hata durumunda ham metin değil ErrorState gösterir", async () => {
    const refetch = jest.fn();
    mockUseEntryDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new TypeError("Network request failed"),
      refetch,
    });
    await render(<EntryDetail />);

    expect(screen.getByText("Bağlantı kurulamadı")).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();

    await fireEvent.press(screen.getAllByLabelText("Tekrar dene")[0]);
    expect(refetch).toHaveBeenCalled();
  });
});

describe("kayıt detayı — sayfalayıcı", () => {
  it("sıradaki konumunu sayaçta gösterir", async () => {
    // URL'deki kayıt sıranın 2. elemanı → "2/3"
    await render(<EntryDetail />);

    expect(screen.getByText("2/3")).toBeTruthy();
  });

  it("sıra verisi SONRADAN gelince aktif sayfayı hizalar", async () => {
    // Sıra yüklenmeden ekran tek sayfalık listeye düşüyor; veri gelince
    // doğru indekse hizalanmalı. Render sırasında senkronizasyon yanlış
    // kurulsaydı ya sayaç 1/3'te kalırdı ya sonsuz döngü olurdu.
    mockUseEntryOrder.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = await render(<EntryDetail />);

    mockUseEntryOrder.mockReturnValue({ data: ["e1", "e2", "e3"], isLoading: false });
    await rerender(<EntryDetail />);

    expect(screen.getByText("2/3")).toBeTruthy();
  });

  it("sırada olmayan ESKİ bir kayıt açılırsa tek sayfaya düşer", async () => {
    // Arama ya da yıllık takvimden açılan kayıt son 60'ın dışında olabilir.
    mockParams = { id: "eski" };
    await render(<EntryDetail />);

    // Tek sayfa: sayaç hiç gösterilmez.
    expect(screen.queryByText(/\/3$/)).toBeNull();
  });

  it("sıra yüklenirken içerik yerine gösterge çizer", async () => {
    mockUseEntryOrder.mockReturnValue({ data: undefined, isLoading: true });
    await render(<EntryDetail />);

    expect(screen.queryByText("15.07.2026")).toBeNull();
  });
});

describe("kayıt detayı — işlemler", () => {
  it("düzenleme, EKRANDA GÖRÜNEN kaydı açar", async () => {
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Anı için işlemler"));
    await fireEvent.press(screen.getByText("Düzenle"));

    expect(mockPush).toHaveBeenCalledWith("/entry/edit/e2");
  });

  it("silme, onay istemeden çalışmaz", async () => {
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Anı için işlemler"));
    await fireEvent.press(screen.getByText("Sil"));

    // Onay ekranı açıldı ama henüz silme yok.
    expect(screen.getByText("Bu anıyı sil?")).toBeTruthy();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("onay verilince görünen kaydı siler ve geri döner", async () => {
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Anı için işlemler"));
    await fireEvent.press(screen.getByText("Sil"));
    await fireEvent.press(screen.getByText("Sil", { exact: true }));

    expect(mockDeleteMutate).toHaveBeenCalledWith("e2", expect.any(Object));

    // Navigasyon ekranın sorumluluğu: hook yalnızca cache'i tazeliyor.
    const options = mockDeleteMutate.mock.calls[0][1] as { onSuccess: () => void };
    options.onSuccess();
    expect(mockBack).toHaveBeenCalled();
  });

  it("vazgeçilince silmez", async () => {
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Anı için işlemler"));
    await fireEvent.press(screen.getByText("Sil"));
    await fireEvent.press(screen.getByText("Vazgeç"));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});
