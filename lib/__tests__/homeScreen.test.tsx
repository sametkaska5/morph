import { render, screen, fireEvent } from "@testing-library/react-native";
import type { EntryRow } from "../entries";

/**
 * app/(tabs)/index.tsx — Ana Ekran ızgarası.
 *
 * Kapsanan riskler: (1) hücreler `memo`'lu — veri değişince gerçekten yeniden
 * çiziliyor mu? (2) hata durumunda artık ham metin değil ErrorState + yeniden
 * deneme gösteriliyor, (3) offline eklenmiş "bekleyen" kayıt dokunulamaz olmalı
 * — id'si gerçek bir uuid olmadığı için detay ekranı hata veriyordu.
 */

const mockUseTimelineEntries = jest.fn();
const mockPush = jest.fn();
const mockOpenCapturePicker = jest.fn();
const mockReduceMotion = jest.fn();

jest.mock("../entries", () => ({ useTimelineEntries: () => mockUseTimelineEntries() }));
jest.mock("expo-router", () => ({ router: { push: (p: string) => mockPush(p) } }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("../capture", () => ({ openCapturePicker: () => mockOpenCapturePicker() }));
jest.mock("../storage", () => ({ photoCacheKey: (p: string) => p }));
jest.mock("../useReduceMotion", () => ({ useReduceMotion: () => mockReduceMotion() }));

import AnaEkran from "@/app/(tabs)/index";

const ENTRY: EntryRow = {
  id: "e1",
  date: "2026-07-15",
  note: "not",
  cover_photo_url: "https://example.test/a.jpg",
  cover_photo_path: "u1/e1/a.jpg",
  photo_count: 1,
  back_photos: [],
};

/** Aynı gün, üç fotoğraflı: kartta yaprak destesi ve sayı rozeti çıkmalı. */
const MULTI_ENTRY: EntryRow = {
  ...ENTRY,
  id: "e2",
  date: "2026-07-16",
  photo_count: 3,
  back_photos: [
    { url: "https://example.test/b.jpg", path: "u1/e2/b.jpg" },
    { url: "https://example.test/c.jpg", path: "u1/e2/c.jpg" },
  ],
};

function mockList(overrides: Partial<ReturnType<typeof baseState>> = {}) {
  mockUseTimelineEntries.mockReturnValue({ ...baseState(), ...overrides });
}
function baseState() {
  return {
    data: [ENTRY],
    isLoading: false,
    isRefetching: false,
    error: null as unknown,
    refetch: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion.mockReturnValue(false);
  mockList();
});

/**
 * Kapağın arkasındaki yaprak destesi.
 *
 * Buradaki asıl güvence "animasyon oynadı mı" değil — o Reanimated'in işi ve
 * jest'te ölçülmez. Korunması gereken üç şey var: (1) tek fotoğraflı günlerde
 * kart bugünkü gibi kalmalı, (2) çoklu günde kaç fotoğraf olduğu animasyondan
 * BAĞIMSIZ olarak da anlaşılmalı (animasyonu kaçıran kullanıcı bilgiyi
 * kaybetmesin), (3) "hareketi azalt" açıkken bilgi yine görünür kalmalı.
 */
describe("ana ekran — çoklu fotoğraflı gün", () => {
  it("tek fotoğraflı kartta sayı rozeti göstermez", async () => {
    await render(<AnaEkran />);

    expect(screen.queryByText("3")).toBeNull();
  });

  it("çoklu günde fotoğraf sayısını rozette gösterir", async () => {
    mockList({ data: [MULTI_ENTRY] });
    await render(<AnaEkran />);

    expect(screen.getByText("3")).toBeTruthy();
  });

  it("fotoğraf sayısını erişilebilirlik etiketine de yazar", async () => {
    // Rozet görsel bir ipucu; ekran okuyucu kullanıcısı için etiket şart.
    mockList({ data: [MULTI_ENTRY] });
    await render(<AnaEkran />);

    expect(screen.getByLabelText(/16 Temmuz 2026 tarihli anı, 3 fotoğraf/)).toBeTruthy();
  });

  it("tek fotoğraflı günün etiketine sayı EKLEMEZ", async () => {
    await render(<AnaEkran />);

    expect(screen.getByLabelText(/15 Temmuz 2026 tarihli anı$/)).toBeTruthy();
  });

  it("çoklu karta dokunmak yine detaya götürür", async () => {
    // Yaprak destesi kapağın arkasında ve pointerEvents=none — dokunmayı
    // yutarsa kullanıcı karta hiç giremezdi.
    mockList({ data: [MULTI_ENTRY] });
    await render(<AnaEkran />);

    await fireEvent.press(screen.getByLabelText(/16 Temmuz 2026 tarihli anı/));

    expect(mockPush).toHaveBeenCalledWith("/entry/e2");
  });

  it("hareketi azalt açıkken de sayı ve kart görünür kalır", async () => {
    mockReduceMotion.mockReturnValue(true);
    mockList({ data: [MULTI_ENTRY] });
    await render(<AnaEkran />);

    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByLabelText(/16 Temmuz 2026 tarihli anı, 3 fotoğraf/)).toBeTruthy();
  });

  it("bekleyen kayıtta sayı rozeti yerine 'Bekliyor' gösterir", async () => {
    // İkisi aynı köşede; senkronizasyon durumu daha acil bir bilgi.
    mockList({ data: [{ ...MULTI_ENTRY, id: "pending-x", pending: true }] });
    await render(<AnaEkran />);

    expect(screen.getByText("Bekliyor")).toBeTruthy();
    expect(screen.queryByText("3")).toBeNull();
  });
});

describe("ana ekran", () => {
  it("kayıtları ızgarada listeler ve sayısını gösterir", async () => {
    mockList({ data: [ENTRY, { ...ENTRY, id: "e2", date: "2026-07-14" }] });
    await render(<AnaEkran />);

    expect(screen.getByText("Son Kayıtlar")).toBeTruthy();
    expect(screen.getByText("2 kayıt")).toBeTruthy();
  });

  it("bir kayda dokununca detayına gider", async () => {
    await render(<AnaEkran />);

    await fireEvent.press(screen.getByLabelText(/15 Temmuz 2026 tarihli anı/));

    expect(mockPush).toHaveBeenCalledWith("/entry/e1");
  });

  it("henüz senkronize olmamış kayda dokunmayı ENGELLER", async () => {
    // "pending-..." id'si gerçek bir uuid değil; detay sorgusu hata verip
    // kırmızı hata sayfası gösteriyordu.
    mockList({ data: [{ ...ENTRY, id: "pending-2026-07-15", pending: true }] });
    await render(<AnaEkran />);

    const cell = screen.getByLabelText(/senkronize edilmeyi bekliyor/);
    await fireEvent.press(cell);

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("Bekliyor")).toBeTruthy();
  });

  it("kayıt yokken boş durum ve ekleme çağrısı gösterir", async () => {
    mockList({ data: [] });
    await render(<AnaEkran />);

    expect(screen.getByText("Henüz bir kaydın yok")).toBeTruthy();
    await fireEvent.press(screen.getByText("İlk anını ekle"));
    expect(mockOpenCapturePicker).toHaveBeenCalled();
  });

  it("yükleme sırasında 'Son Kayıtlar' başlığını göstermez", async () => {
    // isEmpty veri gelmeden undefined olduğu için başlık erken görünüyordu.
    mockList({ data: undefined, isLoading: true });
    await render(<AnaEkran />);

    expect(screen.queryByText("Son Kayıtlar")).toBeNull();
  });

  it("hata durumunda ham metin değil ErrorState + yeniden deneme gösterir", async () => {
    const refetch = jest.fn();
    mockList({ data: undefined, error: new TypeError("Network request failed"), refetch });
    await render(<AnaEkran />);

    expect(screen.getByText("Bağlantı kurulamadı")).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();

    await fireEvent.press(screen.getByLabelText("Tekrar dene"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("veri değişince memo'lu hücreler yeniden çizilir", async () => {
    // memo yanlış kurulsaydı liste eski veriyi göstermeye devam ederdi.
    const { rerender } = await render(<AnaEkran />);
    expect(screen.getByText("15 Tem")).toBeTruthy();

    mockList({ data: [{ ...ENTRY, id: "e9", date: "2026-08-02" }] });
    await rerender(<AnaEkran />);

    expect(screen.getByText("2 Ağu")).toBeTruthy();
    expect(screen.queryByText("15 Tem")).toBeNull();
  });
});
