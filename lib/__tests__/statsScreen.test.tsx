import { render, screen, fireEvent } from "@testing-library/react-native";
import type { MeasurementType } from "../measurementTypes";
import type { MeasurementSeriesPoint, WeekDayStatus, ShareablePhotoEntry } from "../stats";

/**
 * app/(tabs)/istatistikler.tsx — İstatistikler ekranı.
 *
 * Bu ekranda iki tane "sessiz kırılabilir" durum senkronizasyonu var:
 *   1. Ölçüm tipi değişince grafikte seçili nokta SIFIRLANMALI (render sırasında,
 *      effect'siz). Sıfırlanmazsa yeni serinin farklı bir gününün değeri, eski
 *      seçimin indeksinden okunup başlıkta YANLIŞ sayı gösterilir.
 *   2. Paylaşılacak fotoğraf seçimi artık state'i düzelten bir effect'le değil
 *      TÜRETMEYLE yapılıyor: state'teki id listede yoksa ilk fotoğrafa düşer.
 *
 * MeasurementChart bilerek taklit ediliyor: grafiğin kendi matematiği
 * chart.test.ts'te, çizimi ise ayrı bir bileşen olarak test ediliyor. Burada
 * ilgilendiğimiz şey EKRANIN durum yönetimi — taklit, nokta seçimini
 * tetikleyebileceğimiz sade bir düğme veriyor.
 */

const mockUseAuth = jest.fn();
const mockUseMeasurementTypes = jest.fn();
const mockUseUnitPreference = jest.fn();
const mockUseMeasurementSeries = jest.fn();
const mockUseWeek = jest.fn();
const mockUseShareablePhotos = jest.fn();
const mockUseNotificationSettings = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockPush = jest.fn();
const mockScheduleStreakRisk = jest.fn();

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../measurementTypes", () => ({
  useMeasurementTypes: () => mockUseMeasurementTypes(),
}));
jest.mock("../units", () => ({
  ...jest.requireActual("../units"),
  useUnitPreference: () => mockUseUnitPreference(),
}));
// computeWeekStreak / computeTrend GERÇEK kalıyor — ekranın onlarla doğru
// bütünleştiğini de doğrulamak istiyoruz.
jest.mock("../stats", () => ({
  ...jest.requireActual("../stats"),
  useMeasurementSeries: () => mockUseMeasurementSeries(),
  useWeek: (userId: string | undefined, weekOffset = 0) => mockUseWeek(userId, weekOffset),
  useShareablePhotoEntries: () => mockUseShareablePhotos(),
}));
jest.mock("../notificationSettings", () => ({
  useNotificationSettings: () => mockUseNotificationSettings(),
}));
jest.mock("../notifications", () => ({
  scheduleStreakRiskNotification: (...a: unknown[]) => mockScheduleStreakRisk(...a),
}));
jest.mock("expo-router", () => ({ router: { push: (p: string) => mockPush(p) } }));
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("../alerts", () => ({ alertError: jest.fn() }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (a: unknown) => mockInvalidateQueries(a) }),
}));

// Grafiğin yerine, seçimi tetikleyebileceğimiz sade bir taklit.
jest.mock("@/components/MeasurementChart", () => {
  const { Pressable, Text } = require("react-native");
  return {
    VISIBLE_POINTS: 7,
    MeasurementChart: ({
      values,
      selectedIndex,
      onSelect,
    }: {
      values: number[];
      selectedIndex: number | null;
      onSelect: (i: number | null) => void;
    }) => (
      <Pressable accessibilityLabel="grafik" onPress={() => onSelect(0)}>
        <Text>{`nokta:${values.length} secili:${String(selectedIndex)}`}</Text>
      </Pressable>
    ),
  };
});

import Istatistikler from "@/app/(tabs)/istatistikler";

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

const KILO_SERIES: MeasurementSeriesPoint[] = [
  { date: "2026-07-01", value: 85 },
  { date: "2026-07-15", value: 80 },
];
const BEL_SERIES: MeasurementSeriesPoint[] = [
  { date: "2026-07-01", value: 95 },
  { date: "2026-07-15", value: 92 },
];

const day = (over: Partial<WeekDayStatus>): WeekDayStatus => ({
  date: "2026-07-13",
  label: "P",
  isFuture: false,
  isToday: false,
  id: null,
  type: null,
  ...over,
});

/** Pzt-Çar dolu, Perşembe bugün ve dolu, kalanı gelecek → seri 4. */
const WEEK: WeekDayStatus[] = [
  day({ date: "2026-07-13", type: "log", id: "e1" }),
  day({ date: "2026-07-14", type: "workout", id: "e2" }),
  day({ date: "2026-07-15", type: "off_day", id: "e3" }),
  day({ date: "2026-07-16", type: "log", id: "e4", isToday: true }),
  day({ date: "2026-07-17", isFuture: true }),
  day({ date: "2026-07-18", isFuture: true }),
  day({ date: "2026-07-19", isFuture: true }),
];

const PHOTOS: ShareablePhotoEntry[] = [
  { id: "p1", date: "2026-07-15", photoUrl: "https://x/1.jpg", photoPath: "a" },
  { id: "p2", date: "2026-07-10", photoUrl: "https://x/2.jpg", photoPath: "b" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseMeasurementTypes.mockReturnValue({ data: TYPES });
  mockUseUnitPreference.mockReturnValue({ data: "metric" });
  mockUseMeasurementSeries.mockReturnValue({ data: KILO_SERIES, isLoading: false });
  mockUseWeek.mockReturnValue({ data: WEEK, isLoading: false });
  mockUseShareablePhotos.mockReturnValue({ data: PHOTOS, isLoading: false });
  mockUseNotificationSettings.mockReturnValue({ data: { streak_enabled: false } });
});

describe("istatistikler — ölçüm serisi ve trend", () => {
  it("son değeri ve önceki güne göre farkı gösterir", async () => {
    await render(<Istatistikler />);

    // Değer ve birim iç içe Text; RNTL bunları tek metne birleştiriyor.
    expect(screen.getByText("80 kg")).toBeTruthy(); // son değer
    expect(screen.getByText("↓ 5 kg")).toBeTruthy(); // 85 → 80
  });

  it("veri yoksa açıklayıcı mesaj gösterir", async () => {
    mockUseMeasurementSeries.mockReturnValue({ data: [], isLoading: false });
    await render(<Istatistikler />);

    expect(screen.getByText("Bu ölçüm için henüz veri yok.")).toBeTruthy();
  });

  it("seri sorgusu hata verdiyse 'veri yok' DEMEZ, hata durumu gösterir", async () => {
    // İkisi çok farklı şeyler: "henüz girmedin" ile "getiremedik". Hatayı
    // boşlukmuş gibi göstermek, kullanıcıya ölçümlerini kaybettirmiş hissi verir.
    mockUseMeasurementSeries.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<Istatistikler />);

    expect(screen.queryByText("Bu ölçüm için henüz veri yok.")).toBeNull();
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });

  it("imperial tercihte değerleri çevirir", async () => {
    mockUseUnitPreference.mockReturnValue({ data: "imperial" });
    await render(<Istatistikler />);

    expect(screen.getByText("176.4 lb")).toBeTruthy(); // 80 kg
  });
});

describe("istatistikler — ölçüm tipi değişimi", () => {
  it("başka tipe geçince grafikteki SEÇİLİ NOKTA sıfırlanır", async () => {
    // Sıfırlanmazsa: kilo serisinde 0. nokta seçiliyken bel'e geçilince
    // başlık, bel serisinin 0. gününü "seçili" sanıp yanlış değeri gösterir.
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText("grafik"));
    expect(screen.getByText(/secili:0/)).toBeTruthy();
    expect(screen.getByText("85 kg")).toBeTruthy(); // seçilen ilk günün değeri

    mockUseMeasurementSeries.mockReturnValue({ data: BEL_SERIES, isLoading: false });
    await fireEvent.press(screen.getByText("bel"));

    expect(screen.getByText(/secili:null/)).toBeTruthy();
    expect(screen.getByText("92 cm")).toBeTruthy(); // yeniden SON değer
  });

  it("hangi ölçüm tipinin seçili olduğunu erişilebilirlik durumunda bildirir", async () => {
    await render(<Istatistikler />);

    expect(screen.getByRole("button", { name: "kilo" })).toBeSelected();
    expect(screen.getByRole("button", { name: "bel" })).not.toBeSelected();

    await fireEvent.press(screen.getByText("bel"));

    expect(screen.getByRole("button", { name: "bel" })).toBeSelected();
    expect(screen.getByRole("button", { name: "kilo" })).not.toBeSelected();
  });
});

describe("istatistikler — haftalık seri", () => {
  it("bu haftanın serisini doğru sayar", async () => {
    await render(<Istatistikler />);

    expect(screen.getByText("4 gün üst üste")).toBeTruthy();
  });

  it("hafta sorgusu hata verdiyse şeridi boş kutularla çizmez", async () => {
    mockUseWeek.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<Istatistikler />);

    expect(screen.queryByLabelText(/13 Temmuz/)).toBeNull();
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });

  it("bugün boşsa seri sıfırdır", async () => {
    mockUseWeek.mockReturnValue({
      data: WEEK.map((d) => (d.isToday ? { ...d, type: null, id: null } : d)),
      isLoading: false,
    });
    await render(<Istatistikler />);

    expect(screen.getByText("0 gün üst üste")).toBeTruthy();
  });

  it("fotoğraflı güne dokununca kaydın detayına gider", async () => {
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText(/13 Temmuz.*fotoğraflı kayıt var/));

    expect(mockPush).toHaveBeenCalledWith("/entry/e1");
  });

  it("boş güne dokununca fotoğrafsız gün ekranını o tarihle açar", async () => {
    mockUseWeek.mockReturnValue({
      data: WEEK.map((d) => (d.date === "2026-07-13" ? { ...d, type: null, id: null } : d)),
      isLoading: false,
    });
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText(/13 Temmuz.*boş, ölçüm veya program/));

    expect(mockPush).toHaveBeenCalledWith("/entry/workout?date=2026-07-13");
  });

  it("gelecek güne dokunmak hiçbir şey yapmaz", async () => {
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText(/17 Temmuz.*henüz gelmedi/));

    expect(mockPush).not.toHaveBeenCalled();
  });
});

/**
 * Şerit yalnızca içinde bulunulan haftayı gösterdiği sürece geçmiş bir günü
 * (off day dahil) işaretlemenin hiçbir yolu yoktu — yıllık takvim salt görsel.
 * Gezinme bu kapıyı açıyor, dolayısıyla asıl güvence "geçmiş haftadaki güne
 * dokununca o TARİHLE fotoğrafsız gün ekranı açılıyor mu" testi.
 */
describe("istatistikler — hafta gezinmesi", () => {
  /** Bir önceki hafta: 6-12 Temmuz, Pazartesi off day, kalanı boş. */
  const PREV_WEEK: WeekDayStatus[] = [
    day({ date: "2026-07-06", type: "off_day", id: "p1" }),
    day({ date: "2026-07-07" }),
    day({ date: "2026-07-08" }),
    day({ date: "2026-07-09" }),
    day({ date: "2026-07-10" }),
    day({ date: "2026-07-11" }),
    day({ date: "2026-07-12" }),
  ];

  /** weekOffset'e göre veri döner — ekran şerit ve seri için ayrı ayrı çağırıyor. */
  function mockWeeks() {
    mockUseWeek.mockImplementation((_userId: unknown, weekOffset: number) => ({
      data: weekOffset === 0 ? WEEK : PREV_WEEK,
      isLoading: false,
    }));
  }

  it("bu haftadayken hafta aralığını gösterir ve ileri gidilemez", async () => {
    await render(<Istatistikler />);

    expect(screen.getByText("13 – 19 Temmuz")).toBeTruthy();
    expect(screen.getByLabelText("Sonraki hafta")).toBeDisabled();
  });

  it("geriye gidince önceki haftanın günlerini ve aralığını gösterir", async () => {
    mockWeeks();
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText("Önceki hafta"));

    expect(screen.getByText("6 – 12 Temmuz")).toBeTruthy();
    expect(screen.getByLabelText(/6 Temmuz.*off day olarak işaretli/)).toBeTruthy();
  });

  it("geçmiş haftadaki boş güne dokununca fotoğrafsız gün ekranını O TARİHLE açar", async () => {
    mockWeeks();
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText("Önceki hafta"));
    await fireEvent.press(screen.getByLabelText(/8 Temmuz.*boş, ölçüm veya program/));

    expect(mockPush).toHaveBeenCalledWith("/entry/workout?date=2026-07-08");
  });

  it("geçmiş haftaya gidilse de seri BU haftadan hesaplanır", async () => {
    // Şeridin gösterdiği haftayı seriye de bağlasaydık, kullanıcı geriye
    // gidince karttaki sayı sessizce eski haftanın serisine dönerdi.
    mockWeeks();
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText("Önceki hafta"));

    expect(screen.getByText("4 gün üst üste")).toBeTruthy();
  });

  it("aralık etiketine dokununca bu haftaya döner", async () => {
    mockWeeks();
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText("Önceki hafta"));
    await fireEvent.press(screen.getByLabelText(/6 – 12 Temmuz, bu haftaya dön/));

    expect(screen.getByText("13 – 19 Temmuz")).toBeTruthy();
  });
});

describe("istatistikler — paylaşım kartı", () => {
  it("liste değişip seçili fotoğraf kaybolursa ilk fotoğrafa düşer", async () => {
    // Bu davranış eskiden state'i düzelten bir useEffect'ti; artık türetme.
    // Kayıt silindiğinde kart boş kalmamalı.
    await render(<Istatistikler />);
    await fireEvent.press(screen.getByLabelText("Paylaşım kartı oluştur"));

    // p2'yi seç, sonra listeden p2'yi kaldır.
    await fireEvent.press(screen.getByText("10 Tem"));

    mockUseShareablePhotos.mockReturnValue({ data: [PHOTOS[0]], isLoading: false });
    await fireEvent.press(screen.getByText("15 Tem")); // yeniden render tetikle

    // Çökme yok ve kart hâlâ bir fotoğrafla dolu.
    expect(screen.getByText("15 Tem")).toBeTruthy();
  });

  it("paylaşılacak fotoğraf yoksa bunu söyler", async () => {
    mockUseShareablePhotos.mockReturnValue({ data: [], isLoading: false });
    await render(<Istatistikler />);

    await fireEvent.press(screen.getByLabelText("Paylaşım kartı oluştur"));

    expect(screen.getByText(/Henüz paylaşılacak fotoğraf yok/)).toBeTruthy();
  });

  it("serisi olmayan kullanıcı için kartta seri rozeti GÖSTERMEZ", async () => {
    // Rozet eskiden Math.max(1, ...) ile tabanlanmıştı: serisi olmayan
    // kullanıcı bile dışarıya "1 gün üst üste" diye paylaşıyordu.
    mockUseWeek.mockReturnValue({
      data: WEEK.map((d) => ({ ...d, type: null, id: null })),
      isLoading: false,
    });
    await render(<Istatistikler />);
    await fireEvent.press(screen.getByLabelText("Paylaşım kartı oluştur"));

    expect(screen.queryByText("1 gün üst üste")).toBeNull();
  });
});

// NOT: aşağı çekip yenileme davranışı burada DEĞİL stats.test.ts'te test
// ediliyor. RefreshControl'ün sorgulanabilir bir tutamağı yok (RNTL v14 tip
// bazlı aramayı kaldırdı, testID de native tarafa geçmiyor); bu yüzden
// invalidation listesi `invalidateStatsQueries` olarak lib'e çıkarıldı ve
// doğrudan orada doğrulanıyor.
