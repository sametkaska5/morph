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
const mockPickPhotos = jest.fn();
const mockAddPhotos = jest.fn();
const mockSetCover = jest.fn();
const mockDeletePhoto = jest.fn();
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
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("../capture", () => ({ pickPhotosForEntry: () => mockPickPhotos() }));
jest.mock("../alerts", () => ({ alertError: jest.fn() }));
jest.mock("../photos", () => ({
  ...jest.requireActual("../photos"),
  useAddEntryPhotos: () => ({ mutate: mockAddPhotos, isPending: false }),
  useSetCoverPhoto: () => ({ mutate: mockSetCover, isPending: false }),
  useDeleteEntryPhoto: () => ({ mutate: mockDeletePhoto, isPending: false }),
}));

import EntryDetail from "@/app/entry/[id]";

/** Bir günün fotoğrafı — kapak her zaman listenin başında gelir (orderEntryPhotos). */
const photo = (id: string, isCover = false) => ({
  id,
  url: `https://x/${id}.jpg`,
  path: `u1/e2/${id}.jpg`,
  isCover,
});

const DETAIL = {
  id: "e2",
  date: "2026-07-15",
  note: "harika gündü",
  photos: [photo("p1", true)],
  photoUrl: "https://x/p1.jpg",
  photoPath: "u1/e2/p1.jpg",
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
  mockPickPhotos.mockResolvedValue([]);
});

/**
 * Bir güne birden fazla fotoğraf.
 *
 * Şerit yalnızca çoklu günlerde çıkıyor: tek fotoğraflı günlerde ekran
 * bugünküyle aynı kalmalı, yoksa kullanıcıların çoğu için ekran sebepsiz
 * kalabalıklaşırdı.
 */
describe("kayıt detayı — çoklu fotoğraf", () => {
  const MULTI = {
    ...DETAIL,
    photos: [photo("p1", true), photo("p2"), photo("p3")],
  };

  it("tek fotoğraflı günde şerit ÇIKMAZ, yalnızca ekleme yolu durur", async () => {
    await render(<EntryDetail />);

    expect(screen.queryByLabelText("1. fotoğraf, kapak")).toBeNull();
    expect(screen.getAllByLabelText("Bu güne fotoğraf ekle").length).toBeGreaterThan(0);
  });

  it("çoklu günde fotoğraf sayısını ve şeridi gösterir", async () => {
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    expect(screen.getByText("3 FOTOĞRAF")).toBeTruthy();
    expect(screen.getByLabelText("1. fotoğraf, kapak")).toBeTruthy();
    expect(screen.getByLabelText("3. fotoğraf")).toBeTruthy();
  });

  it("açılışta kapak seçili gelir", async () => {
    // Kapak seçili gelmezse detay, ızgarada dokunulan fotoğraftan başka bir
    // fotoğrafla açılır ve kullanıcı yanlış günü açtığını sanar.
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    expect(screen.getByLabelText("1. fotoğraf, kapak")).toBeSelected();
    expect(screen.getByLabelText("2. fotoğraf")).not.toBeSelected();
  });

  it("şeritten seçim yapınca o fotoğraf aktif olur", async () => {
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("2. fotoğraf"));

    expect(screen.getByLabelText("2. fotoğraf")).toBeSelected();
    expect(screen.getByLabelText("1. fotoğraf, kapak")).not.toBeSelected();
  });

  it("kapak olmayan fotoğraf seçiliyken 'Kapak yap' çıkar ve o fotoğrafı gönderir", async () => {
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    expect(screen.queryByLabelText("Bu fotoğrafı kapak yap")).toBeNull(); // kapak seçiliyken gereksiz

    await fireEvent.press(screen.getByLabelText("2. fotoğraf"));
    await fireEvent.press(screen.getByLabelText("Bu fotoğrafı kapak yap"));

    expect(mockSetCover).toHaveBeenCalledWith("p2", expect.anything());
  });

  it("fotoğraf silme ONAYSIZ çalışmaz, uygulamanın kendi onay kutusunu açar", async () => {
    // Native Alert yerine temalı ConfirmDialog: Alert bir sistem penceresi,
    // koyu temanın ortasında beyaz kutu olarak beliriyordu. Testte de bunun
    // karşılığı var — Alert olsaydı ekranda hiçbir metin görünmezdi.
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Seçili fotoğrafı sil"));

    expect(screen.getByText("Fotoğrafı sil?")).toBeTruthy();
    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });

  it("onay verilince kapağı silerken devredilecek fotoğrafı da gönderir", async () => {
    // Kapak devredilmezse FK "on delete set null" ile boşalır ve o gün
    // ızgarada fotoğrafsız görünür.
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Seçili fotoğrafı sil"));
    await fireEvent.press(screen.getByText("Sil"));

    expect(mockDeletePhoto).toHaveBeenCalledWith(
      { photoId: "p1", nextCoverId: "p2" },
      expect.anything()
    );
  });

  it("kapak OLMAYAN fotoğraf silinirken kapak devri istenmez", async () => {
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("2. fotoğraf"));
    await fireEvent.press(screen.getByLabelText("Seçili fotoğrafı sil"));
    await fireEvent.press(screen.getByText("Sil"));

    expect(mockDeletePhoto).toHaveBeenCalledWith(
      { photoId: "p2", nextCoverId: null },
      expect.anything()
    );
  });

  it("vazgeçilince fotoğrafı silmez", async () => {
    mockUseEntryDetail.mockReturnValue({ data: MULTI, isLoading: false, error: null, refetch: jest.fn() });
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Seçili fotoğrafı sil"));
    await fireEvent.press(screen.getByText("Vazgeç"));

    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });

  it("tek fotoğraf silinmek istenince siler DEĞİL, açıklayıcı kutu gösterir", async () => {
    // Silinseydi kayıt fotoğrafsız kalırdı: ızgarada boş kutu, akışta kapaksız satır.
    await render(<EntryDetail />);

    // Tek fotoğraflı günde şerit yok; silme düğmesi de yok — yol tümüyle kapalı.
    expect(screen.queryByLabelText("Seçili fotoğrafı sil")).toBeNull();
  });

  it("galeriden seçim yapılmazsa yükleme başlatmaz", async () => {
    mockPickPhotos.mockResolvedValue([]);
    await render(<EntryDetail />);

    await fireEvent.press(screen.getAllByLabelText("Bu güne fotoğraf ekle")[0]);

    expect(mockAddPhotos).not.toHaveBeenCalled();
  });

  it("seçilen fotoğrafları kullanıcının id'siyle yüklemeye gönderir", async () => {
    mockPickPhotos.mockResolvedValue(["file://a.jpg", "file://b.jpg"]);
    await render(<EntryDetail />);

    await fireEvent.press(screen.getAllByLabelText("Bu güne fotoğraf ekle")[0]);

    expect(mockAddPhotos).toHaveBeenCalledWith(
      { userId: "u1", uris: ["file://a.jpg", "file://b.jpg"] },
      expect.anything()
    );
  });
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

  /**
   * Program SALT OKUNUR değil, düzenleme kapısı.
   *
   * dayRoute fotoğraflı günleri buraya yönlendiriyor (hafta şeridi ve yıl takvimi
   * dahil), ama buradan program ekranına hiçbir bağlantı yoktu: geçmiş bir
   * fotoğraflı güne yazılmış programı düzenlemenin tek yolu Anı Akışı'nda o kartı
   * bulup çevirmekti. Ana ekran/istatistikler kısayolları tarih GÖNDERMİYOR,
   * yani hep bugünü açıyor.
   */
  it("programa dokunmak o GÜNÜN program ekranını açar", async () => {
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Antrenman programını düzenle"));

    // Kaydın kendi tarihiyle — bugünle değil.
    expect(mockPush).toHaveBeenCalledWith("/entry/program?date=2026-07-15");
  });

  it("programı OLMAYAN günde ekleme yolu sunar", async () => {
    // Programsız günde de o tarihe program yazmanın bir yolu olmalı; eskiden
    // program ekranını açıp tarih seçicisiyle uğraşmak gerekiyordu.
    mockUseEntryDetail.mockReturnValue({
      data: { ...DETAIL, workout_items: [] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    await render(<EntryDetail />);

    expect(screen.queryByLabelText("Antrenman programını düzenle")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Bu güne antrenman programı ekle"));

    expect(mockPush).toHaveBeenCalledWith("/entry/program?date=2026-07-15");
  });

  /**
   * Ölçümler ve not da "gördüğün şeye dokun" kalıbında.
   *
   * İkisi de zaten entry/edit ekranında düzenleniyordu ama oraya giden tek yol sağ
   * üstteki işlem menüsüydü — kullanıcı değiştirmek istediği sayının üstüne
   * dokunmayı bekliyor. Hedef, sayfalayıcıda GÖRÜNEN kaydın id'si olmalı; ekran
   * seviyesindeki ilk id kullanılırsa kaydırdıktan sonra yanlış kayıt açılır.
   */
  it("ölçümlere dokunmak o kaydın düzenleme ekranını açar", async () => {
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Ölçümleri düzenle"));

    expect(mockPush).toHaveBeenCalledWith("/entry/edit/e2");
  });

  it("nota dokunmak da düzenleme ekranını açar", async () => {
    await render(<EntryDetail />);

    await fireEvent.press(screen.getByLabelText("Notu düzenle"));

    expect(mockPush).toHaveBeenCalledWith("/entry/edit/e2");
  });

  it("ölçümü ve notu olmayan günde o kartlar hiç çizilmez", async () => {
    mockUseEntryDetail.mockReturnValue({
      data: { ...DETAIL, measurement_values: [], note: null },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    await render(<EntryDetail />);

    expect(screen.queryByLabelText("Ölçümleri düzenle")).toBeNull();
    expect(screen.queryByLabelText("Notu düzenle")).toBeNull();
  });

  it("veri gelmeden program bloğunu hiç çizmez", async () => {
    // data undefined iken "ekle" kutusunu göstermek, kaydın tarihi bilinmediği
    // için yanlış güne yönlendirme riski demek.
    mockUseEntryDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });
    await render(<EntryDetail />);

    expect(screen.queryByLabelText("Bu güne antrenman programı ekle")).toBeNull();
    expect(screen.queryByLabelText("Antrenman programını düzenle")).toBeNull();
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
