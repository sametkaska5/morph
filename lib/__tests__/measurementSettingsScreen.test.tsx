import { render, screen, fireEvent } from "@testing-library/react-native";
import type { MeasurementType } from "../measurementTypes";

/**
 * app/settings/measurements.tsx — ölçüm tiplerinin yönetimi.
 *
 * Silme GERİ ALINAMAZ: ölçüm tipiyle birlikte o ölçüme girilmiş TÜM geçmiş
 * değerler de gidiyor (migration 0004'teki delete politikası). Aylardır
 * biriktirilen bir kilo/bel serisi tek dokunuşla yok olabilir, o yüzden
 * ekranın kapıları burada sabitleniyor.
 *
 * Korunanlar:
 *  1. Silme onaysız çalışmamalı ve ne kaybedileceği söylenmeli.
 *  2. Sistem ölçümleri silinememeli — silme düğmesi yalnızca kullanıcının
 *     kendi eklediklerinde. Sistem tipleri tüm kullanıcılarda ortak
 *     (user_id is null), biri silinse herkesi etkilerdi.
 *  3. Eksik bilgiyle ekleme yapılmamalı; isim/birim boşlukla dolu olabilir.
 */

const mockUseAuth = jest.fn();
const mockUseTypes = jest.fn();
const mockAddMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockShowAlert = jest.fn();

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../measurementTypes", () => ({
  useMeasurementTypes: () => mockUseTypes(),
  useAddMeasurementType: () => ({ mutate: mockAddMutate, isPending: false }),
  useDeleteMeasurementType: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));
jest.mock("../alerts", () => ({ alertError: jest.fn() }));
jest.mock("../appAlert", () => ({ showAlert: (...a: unknown[]) => mockShowAlert(...a) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

import MeasurementSettingsScreen from "@/app/settings/measurements";

const TYPES: MeasurementType[] = [
  {
    id: "kilo",
    name: "kilo",
    unit: "kg",
    target_direction: "decrease_is_good",
    is_default: true,
    sort_order: 1,
  },
  {
    id: "bel",
    name: "bel",
    unit: "cm",
    target_direction: "decrease_is_good",
    is_default: true,
    sort_order: 2,
  },
  {
    id: "kol",
    name: "kol",
    unit: "cm",
    target_direction: "increase_is_good",
    is_default: false,
    sort_order: 3,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseTypes.mockReturnValue({ data: TYPES, isLoading: false, error: null, refetch: jest.fn() });
});

describe("ölçüm ayarları — listeleme", () => {
  it("sistem ölçümleriyle kullanıcının eklediklerini ayrı gösterir", async () => {
    await render(<MeasurementSettingsScreen />);

    expect(screen.getByText("SİSTEM ÖLÇÜMLERİ")).toBeTruthy();
    expect(screen.getByText("YENİ ÖLÇÜMLERİN")).toBeTruthy();
    expect(screen.getByText("kilo")).toBeTruthy();
    expect(screen.getByText("kol")).toBeTruthy();
  });

  it("SİSTEM ölçümlerinde silme düğmesi YOK", async () => {
    // Sistem tipleri tüm kullanıcılarda ortak (user_id is null); biri silinse
    // herkesi etkilerdi.
    await render(<MeasurementSettingsScreen />);

    expect(screen.queryByLabelText("kilo ölçümünü sil")).toBeNull();
    expect(screen.getByLabelText("kol ölçümünü sil")).toBeTruthy();
  });

  it("kullanıcının eklediği yoksa bunu söyler", async () => {
    mockUseTypes.mockReturnValue({
      data: TYPES.filter((t) => t.is_default),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    await render(<MeasurementSettingsScreen />);

    expect(screen.getByText("Henüz yeni ölçüm eklemedin.")).toBeTruthy();
  });

  it("liste çekilemezse boş form yerine hata durumu gösterir", async () => {
    // Boş forma düşseydi kullanıcı ölçümlerinin silindiğini sanıp yeniden
    // ekler, istek geri gelince mükerrer kayıtla karşılaşırdı.
    mockUseTypes.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<MeasurementSettingsScreen />);

    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
    expect(screen.queryByText("YENİ ÖLÇÜM EKLE")).toBeNull();
  });
});

describe("ölçüm ayarları — silme", () => {
  it("silme ONAYSIZ çalışmaz", async () => {
    await render(<MeasurementSettingsScreen />);

    await fireEvent.press(screen.getByLabelText("kol ölçümünü sil"));

    expect(screen.getByText("Ölçümü sil?")).toBeTruthy();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("geçmiş değerlerin de gideceğini açıkça söyler", async () => {
    // Kullanıcı yalnızca "tipi" sildiğini sanmamalı — aylarca biriken seri de
    // gidiyor.
    await render(<MeasurementSettingsScreen />);

    await fireEvent.press(screen.getByLabelText("kol ölçümünü sil"));

    expect(screen.getByText(/geçmiş değerleri de kaybolacak/)).toBeTruthy();
    expect(screen.getByText(/geri alınamaz/)).toBeTruthy();
  });

  it("onay kutusunda HANGİ ölçümün silineceğini yazar", async () => {
    // Yanlış satıra dokunulduysa kullanıcının son fark etme şansı bu.
    await render(<MeasurementSettingsScreen />);

    await fireEvent.press(screen.getByLabelText("kol ölçümünü sil"));

    expect(screen.getByText(/"kol"/)).toBeTruthy();
  });

  it("onay verilince DOĞRU ölçümü siler", async () => {
    await render(<MeasurementSettingsScreen />);

    await fireEvent.press(screen.getByLabelText("kol ölçümünü sil"));
    await fireEvent.press(screen.getByText("Sil"));

    expect(mockDeleteMutate).toHaveBeenCalledWith("kol", expect.anything());
  });

  it("vazgeçilince silmez ve kutu kapanır", async () => {
    await render(<MeasurementSettingsScreen />);

    await fireEvent.press(screen.getByLabelText("kol ölçümünü sil"));
    await fireEvent.press(screen.getByText("Vazgeç"));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByText("Ölçümü sil?")).toBeNull();
  });
});

describe("ölçüm ayarları — ekleme", () => {
  it("isim boşken eklemez", async () => {
    await render(<MeasurementSettingsScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("Birim (örn. cm)"), "cm");
    await fireEvent.press(screen.getByText("Ekle"));

    expect(mockAddMutate).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalled();
  });

  it("yalnızca boşluktan ibaret isim geçerli sayılmaz", async () => {
    // trim edilmeseydi DB'ye adı görünmez bir ölçüm tipi yazılırdı.
    await render(<MeasurementSettingsScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("İsim (örn. Kol Çevresi)"), "   ");
    await fireEvent.changeText(screen.getByPlaceholderText("Birim (örn. cm)"), "cm");
    await fireEvent.press(screen.getByText("Ekle"));

    expect(mockAddMutate).not.toHaveBeenCalled();
  });

  it("isim ve birimi kırpılmış olarak, seçilen yönle gönderir", async () => {
    await render(<MeasurementSettingsScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("İsim (örn. Kol Çevresi)"), "  omuz  ");
    await fireEvent.changeText(screen.getByPlaceholderText("Birim (örn. cm)"), " cm ");
    await fireEvent.press(screen.getByText("Artması İyi"));
    await fireEvent.press(screen.getByText("Ekle"));

    expect(mockAddMutate).toHaveBeenCalledWith(
      { name: "omuz", unit: "cm", target_direction: "increase_is_good" },
      expect.anything(),
    );
  });

  it("varsayılan yön 'azalması iyi'", async () => {
    // Kilo/bel gibi ölçümler çoğunlukta; varsayılanın yanlış olması kullanıcının
    // grafikteki iyi/kötü renklerini ters görmesine yol açardı.
    await render(<MeasurementSettingsScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("İsim (örn. Kol Çevresi)"), "omuz");
    await fireEvent.changeText(screen.getByPlaceholderText("Birim (örn. cm)"), "cm");
    await fireEvent.press(screen.getByText("Ekle"));

    expect(mockAddMutate).toHaveBeenCalledWith(
      expect.objectContaining({ target_direction: "decrease_is_good" }),
      expect.anything(),
    );
  });
});
