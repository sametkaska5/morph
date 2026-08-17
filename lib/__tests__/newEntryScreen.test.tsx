import { render, screen, fireEvent } from "@testing-library/react-native";
import type { MeasurementType } from "../measurementTypes";

/**
 * app/entry/new.tsx — uygulamanın BİRİNCİL akışı: fotoğraflı kayıt oluşturma.
 *
 * Buradaki dört kapı sessizce bozulabilecek türden:
 *
 *  1. Fotoğraf HENÜZ HAZIR DEĞİLKEN kaydetme engellenmeli. Fotoğraf çekilir
 *     çekilmez ekran açılıyor, küçültme/base64 üretimi arka planda sürüyor.
 *     Engel kalkarsa `photoBase64: undefined` ile kayıt gider ve fotoğrafsız
 *     bir "fotoğraflı gün" oluşur.
 *  2. Geçersiz ölçüm kaydı durdurmalı — yoksa kullanıcı kaydettiğini sanır,
 *     değer sessizce düşer.
 *  3. IMPERIAL → METRİK çevrimi kaydetmeden ÖNCE yapılmalı. Yapılmazsa 176 lb
 *     veritabanına 176 kg olarak yazılır; hiçbir hata alınmaz ve grafik aylar
 *     sonra saçmalar. Bu dosyadaki en tehlikeli senaryo.
 *  4. Kaydettikten sonra fotoğraf store'u temizlenip ana ekrana dönülmeli —
 *     temizlenmezse sonraki kayıt eski fotoğrafla açılır.
 *
 * units GERÇEK bırakılıyor: çevrimin doğruluğu bu testin asıl konusu.
 */

const mockUseAuth = jest.fn();
const mockUseMeasurementTypes = jest.fn();
const mockUseUnitPreference = jest.fn();
const mockMutate = jest.fn();
const mockClearPhoto = jest.fn();
const mockReplace = jest.fn();
const mockShowAlert = jest.fn();
const mockBack = jest.fn();
let mockPhoto: { uri: string; base64?: string; thumbBase64?: string; takenAt?: string } | null =
  null;

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../measurementTypes", () => ({
  useMeasurementTypes: () => mockUseMeasurementTypes(),
}));
jest.mock("../units", () => ({
  ...jest.requireActual("../units"),
  useUnitPreference: () => mockUseUnitPreference(),
}));
// Zustand seçici deseni: bileşen useCaptureStore((s) => s.photo) diye çağırıyor.
jest.mock("../captureStore", () => ({
  useCaptureStore: (selector: (s: unknown) => unknown) =>
    selector({ photo: mockPhoto, clear: mockClearPhoto }),
}));
jest.mock("../entryMutations", () => ({
  saveEntry: jest.fn(),
  SAVE_ENTRY_MUTATION_KEY: ["saveEntry"],
}));
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), replace: (p: string) => mockReplace(p) },
}));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("../alerts", () => ({ alertError: jest.fn() }));
// Uyarılar artık native Alert değil, uygulamanın temalı global kutusu.
jest.mock("../appAlert", () => ({ showAlert: (...a: unknown[]) => mockShowAlert(...a) }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
  }),
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
}));

import NewEntry from "@/app/entry/new";

/**
 * Ölçüm alanını ETİKETİNDEN bulur ("kilo, kg" gibi). Eskiden placeholder'dan
 * bulunuyordu (`— kg`) ama birim placeholder'dan çıkarıldı: placeholder değer
 * yazılır yazılmaz kayboluyor, yani birim tam da kullanıcının sayıyı girdiği anda
 * görünmez oluyordu. Etiket hem kalıcı hem erişilebilirlik için doğru yer.
 */
const measureField = (unit: string) => screen.getByLabelText(new RegExp(`, ${unit}$`));
const measureValue = (unit: string) => measureField(unit).props.value;

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
];

/** Hazır fotoğraf: küçültme bitmiş, base64 üretilmiş. */
const READY_PHOTO = { uri: "file://a.jpg", base64: "PHOTO", thumbBase64: "THUMB" };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseMeasurementTypes.mockReturnValue({ data: TYPES });
  mockUseUnitPreference.mockReturnValue({ data: "metric" });
  mockPhoto = READY_PHOTO;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("yeni kayıt — fotoğrafın hazır olması", () => {
  it("fotoğraf işlenirken kaydetmeyi engeller ve durumu gösterir", async () => {
    mockPhoto = { uri: "file://a.jpg" }; // base64 yok: küçültme sürüyor
    await render(<NewEntry />);

    expect(screen.getByText("Hazırlanıyor…")).toBeTruthy();
    expect(screen.getByLabelText("Kaydı kaydet")).toBeDisabled();
  });

  it("fotoğraf hazırken normal kaydet düğmesini gösterir", async () => {
    await render(<NewEntry />);

    expect(screen.getByText("Kaydet")).toBeTruthy();
    expect(screen.getByLabelText("Kaydı kaydet")).not.toBeDisabled();
  });

  it("hiç fotoğraf yokken kaydetmez", async () => {
    // Fotoğrafsız kayıt "fotoğraflı gün" tipinde boş bir satır oluştururdu.
    mockPhoto = null;
    await render(<NewEntry />);

    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalled();
  });
});

describe("yeni kayıt — ölçüm doğrulama", () => {
  it("geçersiz ölçüm varken kaydetmez", async () => {
    await render(<NewEntry />);

    await fireEvent.changeText(measureField("kg"), "abc");
    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalled();
  });

  it("negatif ölçüm varken kaydetmez", async () => {
    await render(<NewEntry />);

    await fireEvent.changeText(measureField("kg"), "-5");
    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("boş bırakılan ölçümü hataya saymaz, kaydı geçirir", async () => {
    await render(<NewEntry />);

    await fireEvent.changeText(measureField("kg"), "80");
    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ values: { kilo: "80" } }));
  });
});

describe("yeni kayıt — kaydetme", () => {
  it("fotoğrafı, notu ve ölçümleri birlikte gönderir", async () => {
    await render(<NewEntry />);

    await fireEvent.changeText(measureField("kg"), "80");
    await fireEvent.changeText(screen.getByLabelText("Not"), "iyi geçti");
    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        note: "iyi geçti",
        photoBase64: "PHOTO",
        thumbBase64: "THUMB",
        values: { kilo: "80" },
      }),
    );
  });

  it("IMPERIAL girdiyi metriğe çevirerek kaydeder", async () => {
    // En tehlikeli senaryo: çevrim atlanırsa 176.4 lb, DB'ye 176.4 KG olarak
    // yazılır. Hata alınmaz, grafik aylar sonra saçmalar.
    mockUseUnitPreference.mockReturnValue({ data: "imperial" });
    await render(<NewEntry />);

    await fireEvent.changeText(measureField("lb"), "176.4");
    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    // 176.4 lb = 80.01 kg. Asıl mesele sayının 176.4 OLMAMASI — çevrim
    // atlanırsa girdi olduğu gibi kg olarak yazılır.
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ values: { kilo: "80.01" } }));
  });

  it("kaydettikten sonra fotoğrafı temizler ve ana ekrana döner", async () => {
    // Temizlenmezse bir sonraki kayıt ekranı ESKİ fotoğrafla açılır.
    await render(<NewEntry />);

    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockClearPhoto).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("notsuz kayıtta note null gider (boş string değil)", async () => {
    await render(<NewEntry />);

    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });
});

describe("yeni kayıt — tarih", () => {
  it("galeriden seçilen fotoğrafın EXIF çekim tarihini kullanır", async () => {
    // Kullanıcı eski bir fotoğrafı seçince kayıt BUGÜNE değil çekildiği güne
    // düşmeli; aksi halde geçmiş fotoğraflar hep bugüne yığılırdı.
    mockPhoto = { ...READY_PHOTO, takenAt: "2026-03-15T10:30:00" };
    await render(<NewEntry />);

    expect(screen.getByText("15 Mart 2026")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-03-15" }));
  });

  it("EXIF tarihi yoksa bugünü kullanır", async () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await render(<NewEntry />);

    await fireEvent.press(screen.getByLabelText("Kaydı kaydet"));

    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ date: key }));
  });
});

/**
 * Birim, DEĞER YAZILDIKTAN SONRA da görünmek zorunda.
 *
 * Eskiden birim yalnızca placeholder'da yaşıyordu (`— kg`). Placeholder değer
 * yazılır yazılmaz kaybolduğu için birim tam da kullanıcının sayıyı girdiği anda
 * görünmez oluyordu. Üstelik alan sabit 80px olduğundan uzun birimler
 * ("kilogram" gibi) placeholder'da da kırpılıyordu.
 */
describe("yeni kayıt — ölçüm birimi", () => {
  const LONG_UNIT: MeasurementType = {
    id: "cevre",
    name: "kol çevresi",
    unit: "santimetre",
    target_direction: "increase_is_good",
    is_default: false,
    sort_order: 100,
  };

  it("birim, değer girildikten sonra da ekranda kalır", async () => {
    await render(<NewEntry />);

    // Placeholder hâlindeyken birim görünüyor...
    expect(screen.getByText("kg")).toBeTruthy();

    await fireEvent.changeText(measureField("kg"), "80");

    // ...ve değer yazıldıktan sonra da duruyor (asıl regresyon bu).
    expect(screen.getByText("kg")).toBeTruthy();
    expect(measureValue("kg")).toBe("80");
  });

  it("uzun birimi kırpmadan gösterir ve kendisi kısalır", async () => {
    mockUseMeasurementTypes.mockReturnValue({ data: [LONG_UNIT] });
    await render(<NewEntry />);

    const unitLabel = screen.getByText("santimetre");
    // Tek satıra sıkışıp taşmak yerine kendisi kısalıyor; satır bozulmuyor.
    expect(unitLabel.props.numberOfLines).toBe(1);

    // Alan da etiketiyle bulunabiliyor — birim adı ne kadar uzun olursa olsun.
    await fireEvent.changeText(measureField("santimetre"), "38");
    expect(measureValue("santimetre")).toBe("38");
  });
});
