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
const mockPush = jest.fn();

jest.mock("../entries", () => ({
  useYearEntries: (...args: unknown[]) => mockUseYearEntries(...args),
}));
jest.mock("../useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: (p: string) => mockPush(p) } }));

import CalendarYear from "@/app/calendar-year";
import { MONTH_NAMES } from "../date";

const THIS_YEAR = new Date().getFullYear();

/** Bu yılın ocak ayından birkaç gün — takvim her zaman güncel yılı açıyor. */
const STATUS_MAP: Record<string, { id: string; type: string }> = {
  [`${THIS_YEAR}-01-05`]: { id: "e1", type: "log" },
  [`${THIS_YEAR}-01-06`]: { id: "e2", type: "workout" },
  [`${THIS_YEAR}-01-07`]: { id: "e3", type: "off_day" },
};

/**
 * Yarının etiketi — "gelecek gün odak dışında" testi için. Yarın gelecek yıla
 * düşerse takvim o kutuyu hiç çizmez, sorgu yine boş döner: test her koşulda
 * anlamlı kalır.
 */
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW_LABEL = `${tomorrow.getDate()} ${MONTH_NAMES[tomorrow.getMonth()]}`;

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

    expect(screen.getByLabelText(/^5 Ocak, fotoğraflı kayıt/)).toBeTruthy();
    expect(screen.getByLabelText(/^6 Ocak, antrenman günü/)).toBeTruthy();
    expect(screen.getByLabelText(/^7 Ocak, off day/)).toBeTruthy();
  });

  it("boş geçmiş günleri de odak listesine alır", async () => {
    // Kutular artık düğme: boş bir güne dokunmak o tarihe kayıt eklemenin
    // yolu. Odaklanamayan kutu, ekran okuyucu kullanıcısından bu özelliği
    // tümden gizlerdi.
    await render(<CalendarYear />);

    expect(
      screen.getByLabelText(/^4 Ocak, kayıt yok, ölçüm veya program eklemek için dokun$/),
    ).toBeTruthy();
  });

  it("gelecek günleri odak dışında bırakır", async () => {
    // Gelecek gün salt dekor — dokunulamıyor, dolayısıyla odak durağı da olmamalı.
    await render(<CalendarYear />);

    expect(screen.queryByLabelText(new RegExp(`^${TOMORROW_LABEL},`))).toBeNull();
  });

  it("sorgu hata verdiyse 365 boş kutu yerine hata durumu gösterir", async () => {
    // Hatasız hâlde takvim "o yıl hiç kayıt yapmamışsın" gibi okunuyordu.
    mockUseYearEntries.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<CalendarYear />);

    expect(screen.queryByText("Ocak")).toBeNull();
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
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

/**
 * Takvim eskiden salt görseldi: aylar öncesine dönük bir kayıt (off day dahil)
 * eklemenin tek yolu hafta şeridinde onlarca hafta geriye tıklamaktı. Kurallar
 * lib/dayRoute.ts'te ve orada ayrıca test ediliyor; buradaki güvence
 * DOKUNMANIN doğru güne bağlandığı.
 */
describe("yıllık takvim — güne dokunma", () => {
  it("fotoğraflı güne dokununca o kaydın detayına gider", async () => {
    await render(<CalendarYear />);

    await fireEvent.press(screen.getByLabelText(/^5 Ocak, fotoğraflı kayıt/));

    expect(mockPush).toHaveBeenCalledWith("/entry/e1");
  });

  it("off day gününe dokununca fotoğrafsız gün ekranını O TARİHLE açar", async () => {
    await render(<CalendarYear />);

    await fireEvent.press(screen.getByLabelText(/^7 Ocak, off day/));

    expect(mockPush).toHaveBeenCalledWith(`/entry/workout?date=${THIS_YEAR}-01-07`);
  });

  it("boş güne dokununca fotoğrafsız gün ekranını O TARİHLE açar", async () => {
    await render(<CalendarYear />);

    await fireEvent.press(screen.getByLabelText(/^4 Ocak, kayıt yok/));

    expect(mockPush).toHaveBeenCalledWith(`/entry/workout?date=${THIS_YEAR}-01-04`);
  });

  it("önceki yıla geçtikten sonra O YILIN tarihini gönderir", async () => {
    // Tarih ay ızgarasından üretiliyor; yıl gezinmesiyle senkron kalmazsa
    // kullanıcı geçen yılın kutusuna dokunup bu yıla kayıt eklerdi.
    await render(<CalendarYear />);

    await fireEvent.press(screen.getByLabelText("Önceki yıl"));
    await fireEvent.press(screen.getByLabelText(/^4 Ocak, kayıt yok/));

    expect(mockPush).toHaveBeenCalledWith(`/entry/workout?date=${THIS_YEAR - 1}-01-04`);
  });

  it("gelecek güne dokunmak hiçbir şey yapmaz", async () => {
    await render(<CalendarYear />);

    // Gelecek kutular odak dışında; dokunulabilir olsalardı etiketleri olurdu.
    expect(screen.queryByLabelText(new RegExp(`^${TOMORROW_LABEL},`))).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
