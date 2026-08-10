import { render, screen, fireEvent } from "@testing-library/react-native";
import type { WorkoutDayData } from "../workout";
import type { MeasurementType } from "../measurementTypes";

/**
 * app/entry/workout.tsx — fotoğrafsız gün formunun doldurulması.
 *
 * Bu ekranın hydration koşulu diğerlerinden bir adım daha katı: veri gelmiş
 * olsa bile ÖLÇÜM TİPLERİ (allTypes) yüklenmeden form doldurulmuyor. Sebep:
 * kayıtlı değerler DB'de metrik, ekranda kullanıcının tercihine göre imperial
 * gösterilebiliyor ve doğru dönüşüm için ölçümün birimini bilmek şart. Tipler
 * gelmeden doldurulsaydı değerler yanlış birimde görünür, kullanıcı da farkında
 * olmadan yanlış veriyi kaydederdi. Aşağıdaki testler bu kapıyı koruyor.
 */

const mockUseAuth = jest.fn();
const mockUseWorkoutDay = jest.fn();
const mockUseMeasurementTypes = jest.fn();
const mockUseUnitPreference = jest.fn();
const mockMutate = jest.fn();

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../workout", () => ({
  useWorkoutDay: (...args: unknown[]) => mockUseWorkoutDay(...args),
  saveWorkoutDay: jest.fn(),
}));
jest.mock("../measurementTypes", () => ({
  useMeasurementTypes: () => mockUseMeasurementTypes(),
}));
jest.mock("../units", () => ({
  ...jest.requireActual("../units"),
  useUnitPreference: () => mockUseUnitPreference(),
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ date: "2026-08-01" }),
}));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("../alerts", () => ({ alertError: jest.fn() }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
}));

import WorkoutDayScreen from "@/app/entry/workout";

const TYPES: MeasurementType[] = [
  { id: "kilo", name: "kilo", unit: "kg", target_direction: "decrease_is_good", is_default: true, sort_order: 1 },
  { id: "bel", name: "bel", unit: "cm", target_direction: "decrease_is_good", is_default: true, sort_order: 2 },
];

const DAY: WorkoutDayData = {
  id: "e1",
  date: "2026-08-01",
  type: "workout",
  note: "ağır gün",
  measurement_values: [{ measurement_type_id: "kilo", value: 80 }],
};

/**
 * Ölçüm alanını ETİKETİNDEN bulur ("kilo, kg" gibi). Eskiden placeholder'dan
 * bulunuyordu (`— kg`) ama birim placeholder'dan çıkarıldı: placeholder değer
 * yazılır yazılmaz kayboluyor, yani birim tam da kullanıcının sayıyı girdiği anda
 * görünmez oluyordu. Etiket hem kalıcı hem erişilebilirlik için doğru yer.
 */
const measureField = (unit: string) => screen.getByLabelText(new RegExp(`, ${unit}$`));

/** Bir ölçüm alanının o anki değeri. */
function measureValue(unitLabel: string) {
  return measureField(unitLabel).props.value;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseWorkoutDay.mockReturnValue({ data: DAY, isLoading: false });
  mockUseMeasurementTypes.mockReturnValue({ data: TYPES });
  mockUseUnitPreference.mockReturnValue({ data: "metric" });
});

describe("fotoğrafsız gün — form doldurma", () => {
  it("kayıtlı günün ölçümlerini ve notunu doldurur", async () => {
    await render(<WorkoutDayScreen />);

    expect(measureValue("kg")).toBe("80");
    expect(measureValue("cm")).toBe(""); // o gün girilmemiş
  });

  it("ÖLÇÜM TİPLERİ gelmeden formu doldurmaz (yanlış birim riski)", async () => {
    mockUseMeasurementTypes.mockReturnValue({ data: undefined });
    const { rerender } = await render(<WorkoutDayScreen />);

    // Tipler yokken satır da çizilmiyor, dolayısıyla değer de yazılmamış olmalı.
    expect(screen.queryByPlaceholderText("— kg")).toBeNull();

    // Tipler gelince doldurulmalı.
    mockUseMeasurementTypes.mockReturnValue({ data: TYPES });
    await rerender(<WorkoutDayScreen />);

    expect(measureValue("kg")).toBe("80");
  });

  it("imperial tercihte değeri çevirerek gösterir", async () => {
    // 80 kg ≈ 176.4 lb — DB metrik kalır, ekran çevirir.
    mockUseUnitPreference.mockReturnValue({ data: "imperial" });
    await render(<WorkoutDayScreen />);

    expect(measureValue("lb")).toBe("176.4");
  });

  it("kullanıcının yazdığını sonraki render'lar EZMEZ", async () => {
    const { rerender } = await render(<WorkoutDayScreen />);

    await fireEvent.changeText(measureField("kg"), "82.5");
    expect(measureValue("kg")).toBe("82.5");

    await rerender(<WorkoutDayScreen />);
    await rerender(<WorkoutDayScreen />);

    expect(measureValue("kg")).toBe("82.5");
  });

  it("sorgu HATA verdiyse formu hiç açmaz", async () => {
    // Hatada isLoading false, data undefined: form o gün hiç kayıt yokmuş gibi
    // boş dolardı ve Kaydet, günün ölçümleriyle notunu silerdi.
    mockUseWorkoutDay.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<WorkoutDayScreen />);

    expect(screen.queryByPlaceholderText("— kg")).toBeNull();
    expect(screen.queryByLabelText("Off day")).toBeNull();
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });

  it("off_day kaydını doğru sekmeyle açar", async () => {
    mockUseWorkoutDay.mockReturnValue({
      data: { ...DAY, type: "off_day", measurement_values: [] },
      isLoading: false,
    });
    await render(<WorkoutDayScreen />);

    expect(screen.getByLabelText("Off day")).toBeSelected();
    expect(screen.getByLabelText("Antrenman")).not.toBeSelected();
  });

  it("kaydı olmayan günde boş ve 'Antrenman' varsayılanıyla açılır", async () => {
    mockUseWorkoutDay.mockReturnValue({ data: null, isLoading: false });
    await render(<WorkoutDayScreen />);

    expect(measureValue("kg")).toBe("");
    expect(screen.getByLabelText("Antrenman")).toBeSelected();
    expect(screen.getByLabelText("Off day")).not.toBeSelected();
  });

  /**
   * `isPhotoDay` koruması gün sorgusuna DAYANIYOR — sorgu dönmeden o bilgi yok.
   * Form yüklenirken çizildiği için fotoğraflı bir günde bile boş form açılıp
   * Kaydet'e basılabiliyordu: günün notu ve ölçümleri siliniyor, tipi
   * 'workout'a çevrilip anı akışından düşüyordu. Kardeş ekran
   * entry/program.tsx bu korumayı zaten yapıyordu.
   */
  it("gün verisi YÜKLENİRKEN formu hiç çizmez", async () => {
    mockUseWorkoutDay.mockReturnValue({ data: undefined, isLoading: true });
    await render(<WorkoutDayScreen />);

    expect(screen.queryByPlaceholderText("— kg")).toBeNull();
    expect(screen.queryByLabelText("Off day")).toBeNull();
    expect(screen.queryByLabelText("Günü kaydet")).toBeNull();
  });

  it("ölçüm tipleri çekilemezse de formu açmaz", async () => {
    // allTypes olmadan form birimleri çeviremiyor ve hydration atlanıyor;
    // yine de çizilse boş formun Kaydet'i günün notunu silerdi.
    mockUseMeasurementTypes.mockReturnValue({
      data: undefined,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<WorkoutDayScreen />);

    expect(screen.queryByLabelText("Günü kaydet")).toBeNull();
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });

  it("o gün FOTOĞRAFLI kayıtsa formu göstermez, kayda yönlendirir", async () => {
    // Bu ekrandan upsert etmek entry'nin type'ını değiştirip fotoğrafı
    // akıştan düşürürdü — o yüzden form yerine yönlendirme gösteriliyor.
    mockUseWorkoutDay.mockReturnValue({ data: { ...DAY, type: "log" }, isLoading: false });
    await render(<WorkoutDayScreen />);

    expect(screen.getByText("Bu günün fotoğraflı kaydı var")).toBeTruthy();
    expect(screen.queryByPlaceholderText("— kg")).toBeNull();
  });
});
