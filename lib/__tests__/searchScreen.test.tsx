import { render, screen, fireEvent } from "@testing-library/react-native";
import type { SearchEntry } from "../entries";

/**
 * app/search.tsx — arama filtresi.
 *
 * Buradaki asıl mantık Türkçe yerelde küçük harfe çevirip hem TARİH
 * ETİKETİNDE hem NOTTA arama yapmak. Türkçe'nin "I/ı" ve "İ/i" davranışı
 * varsayılan toLowerCase ile yanlış sonuç verdiği için `toLocaleLowerCase("tr-TR")`
 * kullanılıyor — testler bunu da kapsıyor.
 */

const mockUseSearchIndex = jest.fn();
const mockPush = jest.fn();

jest.mock("../entries", () => ({ useSearchIndex: () => mockUseSearchIndex() }));
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("expo-router", () => ({ router: { push: (p: string) => mockPush(p), back: jest.fn() } }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("../storage", () => ({ photoCacheKey: (p: string) => p }));

import SearchScreen from "@/app/search";

const ENTRIES: SearchEntry[] = [
  { id: "e1", date: "2026-03-10", note: "Tatil dönüşü", photoUrl: null, photoPath: null },
  { id: "e2", date: "2026-07-15", note: "Ağır antrenman", photoUrl: null, photoPath: null },
  { id: "e3", date: "2026-07-20", note: null, photoUrl: null, photoPath: null },
];

const SEARCH_BOX = "Arama kutusu";

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSearchIndex.mockReturnValue({ data: ENTRIES, isLoading: false });
});

describe("arama ekranı", () => {
  it("arama yapılmadan ipucu gösterir, sonuç listelemez", async () => {
    await render(<SearchScreen />);

    expect(screen.getByText(/anılarında arama yapabilirsin/)).toBeTruthy();
    expect(screen.queryByText("Tatil dönüşü")).toBeNull();
  });

  it("notta geçen kelimeyi bulur", async () => {
    await render(<SearchScreen />);

    await fireEvent.changeText(screen.getByLabelText(SEARCH_BOX), "antrenman");

    expect(screen.getByText("Ağır antrenman")).toBeTruthy();
    expect(screen.queryByText("Tatil dönüşü")).toBeNull();
  });

  it("tarih etiketinde ay adıyla arama yapabilir", async () => {
    await render(<SearchScreen />);

    await fireEvent.changeText(screen.getByLabelText(SEARCH_BOX), "temmuz");

    expect(screen.getByText("15 Temmuz 2026")).toBeTruthy();
    expect(screen.getByText("20 Temmuz 2026")).toBeTruthy();
    expect(screen.queryByText("10 Mart 2026")).toBeNull();
  });

  it("Türkçe büyük/küçük harf farkına takılmaz", async () => {
    // "TATİL" → toLocaleLowerCase("tr-TR") ile "tatil" olmalı. Varsayılan
    // toLowerCase kullanılsaydı "İ" harfi "i̇" (nokta+i) olup eşleşmezdi.
    await render(<SearchScreen />);

    await fireEvent.changeText(screen.getByLabelText(SEARCH_BOX), "TATİL");

    expect(screen.getByText("Tatil dönüşü")).toBeTruthy();
  });

  it("eşleşme yoksa bunu açıkça söyler", async () => {
    await render(<SearchScreen />);

    await fireEvent.changeText(screen.getByLabelText(SEARCH_BOX), "bulunmayanbirkelime");

    expect(screen.getByText("Eşleşen bir anı bulunamadı.")).toBeTruthy();
  });

  it("yalnızca boşluk yazmak arama saymaz", async () => {
    await render(<SearchScreen />);

    await fireEvent.changeText(screen.getByLabelText(SEARCH_BOX), "   ");

    expect(screen.getByText(/anılarında arama yapabilirsin/)).toBeTruthy();
  });

  it("sonuca dokununca kaydın detayına gider", async () => {
    await render(<SearchScreen />);

    await fireEvent.changeText(screen.getByLabelText(SEARCH_BOX), "antrenman");
    await fireEvent.press(screen.getByText("15 Temmuz 2026"));

    expect(mockPush).toHaveBeenCalledWith("/entry/e2");
  });

  it("temizle düğmesi aramayı sıfırlar", async () => {
    await render(<SearchScreen />);

    await fireEvent.changeText(screen.getByLabelText(SEARCH_BOX), "antrenman");
    await fireEvent.press(screen.getByLabelText("Aramayı temizle"));

    expect(screen.getByLabelText(SEARCH_BOX).props.value).toBe("");
    expect(screen.getByText(/anılarında arama yapabilirsin/)).toBeTruthy();
  });
});
