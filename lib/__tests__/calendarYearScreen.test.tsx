import { render, screen, fireEvent } from "@testing-library/react-native";

/**
 * app/calendar-year.tsx — yıllık takvim.
 *
 * İki şey test ediliyor: (1) yıl gezinmesi ve sorgunun DOĞRU YILLA yapılması —
 * bu ekranın sorgu anahtarı Faz B'de değiştirilmişti (`yearEntries` → entries
 * ailesine taşındı), yanlış yıl istenirse takvim sessizce boş görünür;
 * (2) gün kutularının durumu — ızgara bilgiyi renkle aktarıyor, doğruluğunu
 * erişilebilirlik etiketleri üzerinden okuyoruz.
 */

const mockUseYearEntries = jest.fn();

jest.mock("../entries", () => ({
  useYearEntries: (...args: unknown[]) => mockUseYearEntries(...args),
}));
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

import CalendarYear from "@/app/calendar-year";

const THIS_YEAR = new Date().getFullYear();

/** Bu yılın ocak ayından birkaç gün — takvim her zaman güncel yılı açıyor. */
const STATUS_MAP: Record<string, string> = {
  [`${THIS_YEAR}-01-05`]: "log",
  [`${THIS_YEAR}-01-06`]: "workout",
  [`${THIS_YEAR}-01-07`]: "off_day",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseYearEntries.mockReturnValue({ data: STATUS_MAP, isLoading: false });
});

describe("yıllık takvim — gezinme", () => {
  it("içinde bulunulan yılla açılır ve o yılı sorgular", async () => {
    await render(<CalendarYear />);

    expect(screen.getByText(String(THIS_YEAR))).toBeTruthy();
    expect(mockUseYearEntries).toHaveBeenCalledWith("u1", THIS_YEAR);
  });

  it("on iki ayı da çizer", async () => {
    await render(<CalendarYear />);

    expect(screen.getByText("Ocak")).toBeTruthy();
    expect(screen.getByText("Haziran")).toBeTruthy();
    expect(screen.getByText("Aralık")).toBeTruthy();
  });

  it("önceki yıla geçince o yılın verisini ister", async () => {
    await render(<CalendarYear />);

    await fireEvent.press(screen.getByLabelText("Önceki yıl"));

    expect(screen.getByText(String(THIS_YEAR - 1))).toBeTruthy();
    expect(mockUseYearEntries).toHaveBeenLastCalledWith("u1", THIS_YEAR - 1);
  });

  it("gelecek yıla geçmeyi engeller (henüz yaşanmadı)", async () => {
    await render(<CalendarYear />);

    const next = screen.getByLabelText("Sonraki yıl");
    expect(next).toBeDisabled();

    await fireEvent.press(next);
    expect(screen.getByText(String(THIS_YEAR))).toBeTruthy();
  });

  it("geriye gidildikten sonra ileri düğmesi açılır", async () => {
    await render(<CalendarYear />);

    await fireEvent.press(screen.getByLabelText("Önceki yıl"));
    expect(screen.getByLabelText("Sonraki yıl")).not.toBeDisabled();

    await fireEvent.press(screen.getByLabelText("Sonraki yıl"));
    expect(screen.getByText(String(THIS_YEAR))).toBeTruthy();
  });

  it("yüklenirken ayları çizmez", async () => {
    mockUseYearEntries.mockReturnValue({ data: undefined, isLoading: true });
    await render(<CalendarYear />);

    expect(screen.queryByText("Ocak")).toBeNull();
  });
});

describe("yıllık takvim — gün durumları", () => {
  it("her kayıt türünü ekran okuyucuya ayırt edilebilir şekilde bildirir", async () => {
    // Izgara bilgiyi yalnızca RENKLE aktarıyor; etiketler olmadan görme
    // engelli kullanıcı için takvim tamamen boş.
    await render(<CalendarYear />);

    expect(screen.getByLabelText("5 Ocak, fotoğraflı kayıt")).toBeTruthy();
    expect(screen.getByLabelText("6 Ocak, antrenman günü")).toBeTruthy();
    expect(screen.getByLabelText("7 Ocak, off day")).toBeTruthy();
  });

  it("kaydı olmayan günleri odak listesine sokmaz", async () => {
    // 365 kutunun hepsi odaklanabilir olsaydı ekran okuyucuyla gezinmek
    // kullanılamaz hâle gelirdi.
    await render(<CalendarYear />);

    expect(screen.queryByLabelText("4 Ocak, kayıt yok")).toBeNull();
  });

  it("veri boşken çökmez, hiçbir gün işaretli görünmez", async () => {
    mockUseYearEntries.mockReturnValue({ data: {}, isLoading: false });
    await render(<CalendarYear />);

    expect(screen.getByText("Ocak")).toBeTruthy();
    expect(screen.queryByLabelText(/fotoğraflı kayıt/)).toBeNull();
  });

  it("açıklama şeridi üç durumu da tanıtır", async () => {
    await render(<CalendarYear />);

    expect(screen.getByText("kayıt")).toBeTruthy();
    expect(screen.getByText("antrenman")).toBeTruthy();
    expect(screen.getByText("off day")).toBeTruthy();
  });
});
