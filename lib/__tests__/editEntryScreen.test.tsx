import { render, screen, fireEvent } from "@testing-library/react-native";
import type { MeasurementType } from "../measurementTypes";

/**
 * app/entry/edit/[id].tsx — düzenleme formunun doldurulması.
 *
 * Render-time senkronizasyon kullanan DÖRDÜNCÜ ekran ve en karmaşığı: burada
 * karşılaştırma iki değerli (`data` VE `unitPref`), çünkü birim tercihi
 * değişince kayıtlı metrik değerlerin yeniden çevrilmesi gerekiyor. Ayrıca
 * ekran önce başka sorguların cache'inden "tohumlanmış" (placeholder) veriyle
 * açılıyor, gerçek veri sonra geliyor — form her iki aşamada da doğru dolmalı.
 */

const mockUseAuth = jest.fn();
const mockUseEditableEntry = jest.fn();
const mockUseMeasurementTypes = jest.fn();
const mockUseUnitPreference = jest.fn();
const mockMutate = jest.fn();
const mockMutationState = { isPending: false, isError: false, error: null as unknown };

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../entries", () => ({ useEditableEntry: () => mockUseEditableEntry() }));
jest.mock("../measurementTypes", () => ({
  useMeasurementTypes: () => mockUseMeasurementTypes(),
}));
jest.mock("../units", () => ({
  ...jest.requireActual("../units"),
  useUnitPreference: () => mockUseUnitPreference(),
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "e1" }),
}));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("../capture", () => ({ resizeAndCompress: jest.fn() }));
jest.mock("../storage", () => ({
  uploadPhoto: jest.fn(),
  uploadThumb: jest.fn(),
  coverPhotoRow: jest.fn(() => null),
  photoCacheKey: (p: string) => p,
}));
jest.mock("../supabase", () => ({ supabase: {} }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: () => ({ mutate: mockMutate, ...mockMutationState }),
}));

import EditEntry from "@/app/entry/edit/[id]";

const TYPES: MeasurementType[] = [
  { id: "kilo", name: "kilo", unit: "kg", target_direction: "decrease_is_good", is_default: true, sort_order: 1 },
  { id: "bel", name: "bel", unit: "cm", target_direction: "decrease_is_good", is_default: true, sort_order: 2 },
];

const ENTRY = {
  id: "e1",
  note: "güzel bir gündü",
  cover_photo_id: "p1",
  photoUrl: "https://example.test/a.jpg",
  photoPath: "u1/e1/a.jpg",
  thumbUrl: null,
  thumbPath: null,
  measurement_values: [
    { id: "mv1", value: 80, measurement_type_id: "kilo", measurement_types: { name: "kilo", unit: "kg" } },
  ],
};

const measureValue = (unit: string) => screen.getByPlaceholderText(`— ${unit}`).props.value;
const noteValue = () => screen.getByLabelText("Not").props.value;

beforeEach(() => {
  jest.clearAllMocks();
  mockMutationState.isPending = false;
  mockMutationState.isError = false;
  mockMutationState.error = null;
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseEditableEntry.mockReturnValue({ data: ENTRY, isLoading: false });
  mockUseMeasurementTypes.mockReturnValue({ data: TYPES });
  mockUseUnitPreference.mockReturnValue({ data: "metric" });
});

describe("düzenleme ekranı — form doldurma", () => {
  it("notu ve kayıtlı ölçümleri doldurur", async () => {
    await render(<EditEntry />);

    expect(noteValue()).toBe("güzel bir gündü");
    expect(measureValue("kg")).toBe("80");
    expect(measureValue("cm")).toBe(""); // bu kayıtta girilmemiş
  });

  it("tohumlanmış (placeholder) veriden gerçek veriye geçişte ölçümleri doldurur", async () => {
    // Ekran cache'ten gelen kısmi veriyle açılıyor: not ve fotoğraf var,
    // ölçümler henüz boş. Gerçek sorgu dönünce ölçümler gelmeli.
    mockUseEditableEntry.mockReturnValue({
      data: { ...ENTRY, measurement_values: [] },
      isLoading: false,
    });
    const { rerender } = await render(<EditEntry />);
    expect(measureValue("kg")).toBe("");

    mockUseEditableEntry.mockReturnValue({ data: ENTRY, isLoading: false });
    await rerender(<EditEntry />);

    expect(measureValue("kg")).toBe("80");
  });

  it("kullanıcının yazdığını sonraki render'lar EZMEZ", async () => {
    const { rerender } = await render(<EditEntry />);

    await fireEvent.changeText(screen.getByLabelText("Not"), "değiştirdim");
    await fireEvent.changeText(screen.getByPlaceholderText("— kg"), "78");

    await rerender(<EditEntry />);
    await rerender(<EditEntry />);

    expect(noteValue()).toBe("değiştirdim");
    expect(measureValue("kg")).toBe("78");
  });

  it("birim tercihi değişince kayıtlı değeri yeni birime çevirir", async () => {
    // Bu ekranın karşılaştırması `data` VE `unitPref` ikilisine bakıyor;
    // yalnızca data'ya baksaydı imperial'e geçince değer 80 (kg) olarak
    // kalır, kullanıcı 80 lb sanırdı.
    const { rerender } = await render(<EditEntry />);
    expect(measureValue("kg")).toBe("80");

    mockUseUnitPreference.mockReturnValue({ data: "imperial" });
    await rerender(<EditEntry />);

    expect(measureValue("lb")).toBe("176.4");
  });

  it("yüklenirken form yerine gösterge çizer", async () => {
    mockUseEditableEntry.mockReturnValue({ data: undefined, isLoading: true });
    await render(<EditEntry />);

    expect(screen.queryByLabelText("Not")).toBeNull();
  });
});

describe("düzenleme ekranı — doğrulama ve hata", () => {
  it("geçersiz ölçümde uyarı gösterir ve kaydetmeyi engeller", async () => {
    await render(<EditEntry />);

    await fireEvent.changeText(screen.getByPlaceholderText("— kg"), "abc");
    expect(screen.getByText("Sayı gir")).toBeTruthy();

    await fireEvent.press(screen.getByText("Kaydet"));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("makul olmayan yüksek değeri engeller", async () => {
    await render(<EditEntry />);

    await fireEvent.changeText(screen.getByPlaceholderText("— kg"), "5000");
    expect(screen.getByText(/Çok yüksek/)).toBeTruthy();

    await fireEvent.press(screen.getByText("Kaydet"));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("geçerli değerlerde kaydeder", async () => {
    await render(<EditEntry />);

    await fireEvent.changeText(screen.getByPlaceholderText("— kg"), "78,5");
    await fireEvent.press(screen.getByText("Kaydet"));

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("kayıt hatasında HAM metin değil anlaşılır mesaj gösterir", async () => {
    // Bu satır hata mesajı temizliğinde gözden kaçmıştı: değişken adı
    // `updateMutation.error` olduğu için taramaya takılmamıştı.
    mockMutationState.isError = true;
    mockMutationState.error = new TypeError("Network request failed");
    await render(<EditEntry />);

    expect(screen.getByText(/İnternet bağlantısı kurulamadı/)).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });
});
