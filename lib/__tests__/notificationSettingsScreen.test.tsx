import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import type { NotificationSettings } from "../notificationSettings";

/**
 * app/settings/notifications.tsx — bildirim tercihleri.
 *
 * Bu ekranın kritik yanı, her anahtarın İKİ İŞ birden yapması: tercihi DB'ye
 * yazmak ve cihazdaki zamanlanmış bildirimi kurmak/iptal etmek. İkisi ayrışırsa
 * kullanıcı sessizce yanlış duruma düşer — anahtar açık görünürken bildirim
 * gelmez, ya da kapalıyken gelmeye devam eder. Testler bu eşleşmeyi koruyor.
 *
 * İkinci incelik: izin akışı yalnızca AÇARKEN çalışır ve seri uyarısı bundan
 * bilerek muaf (cihaz izni gerektiren bir zamanlama kurmuyor, sadece iptal
 * edebiliyor). Bu asimetri kolayca "düzeltilerek" bozulabilecek türden.
 */

const mockUseAuth = jest.fn();
const mockUseSettings = jest.fn();
const mockMutate = jest.fn();
const mockRequestPermission = jest.fn();
const mockScheduleMemory = jest.fn();
const mockCancelMemory = jest.fn();
const mockScheduleDaily = jest.fn();
const mockCancelDaily = jest.fn();
const mockCancelStreak = jest.fn();
const mockShowAlert = jest.fn();
/** Expo Go'da native modül yok; testler bunu tek tek değiştirebilsin diye getter. */
let mockNotificationsAvailable = true;

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../notificationSettings", () => ({
  useNotificationSettings: (...args: unknown[]) => mockUseSettings(...args),
  useUpdateNotificationSettings: () => ({ mutate: mockMutate }),
}));
jest.mock("../notifications", () => ({
  get NOTIFICATIONS_AVAILABLE() {
    return mockNotificationsAvailable;
  },
  requestNotificationPermission: () => mockRequestPermission(),
  scheduleMemoryNotifications: (...args: unknown[]) => mockScheduleMemory(...args),
  cancelMemoryNotifications: () => mockCancelMemory(),
  scheduleDailyReminder: (...args: unknown[]) => mockScheduleDaily(...args),
  cancelDailyReminder: () => mockCancelDaily(),
  cancelStreakRiskNotification: () => mockCancelStreak(),
}));
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
// Uyarılar artık native Alert değil, uygulamanın temalı global kutusu.
jest.mock("../appAlert", () => ({ showAlert: (...a: unknown[]) => mockShowAlert(...a) }));

// Saat seçici: gerçek native bileşen yerine, seçimi tetikleyebileceğimiz sade
// bir düğme (statsScreen.test.tsx'teki grafik taklidiyle aynı desen).
jest.mock("@react-native-community/datetimepicker", () => {
  const { Pressable, Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ onValueChange }: { onValueChange: (e: unknown, d: Date) => void }) => (
      <Pressable
        accessibilityLabel="saat seç"
        onPress={() => onValueChange({}, new Date(2026, 0, 1, 21, 30))}
      >
        <Text>saat seçici</Text>
      </Pressable>
    ),
  };
});

import NotificationSettingsScreen from "@/app/settings/notifications";

const SETTINGS: NotificationSettings = {
  user_id: "u1",
  past_memory_enabled: true,
  streak_enabled: true,
  daily_reminder_enabled: false,
  reminder_time: "20:00:00",
};

const settingsWith = (over: Partial<NotificationSettings>) => ({ ...SETTINGS, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockNotificationsAvailable = true;
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseSettings.mockReturnValue({ data: SETTINGS, isLoading: false });
  mockRequestPermission.mockResolvedValue(true);
});

describe("bildirim ayarları — görüntüleme", () => {
  it("kayıtlı tercihleri ve hatırlatma saatini gösterir", async () => {
    await render(<NotificationSettingsScreen />);

    expect(screen.getByLabelText("Geçmiş anı hatırlatmaları").props.value).toBe(true);
    expect(screen.getByLabelText("Günlük hatırlatma").props.value).toBe(false);
    expect(screen.getByText("20:00")).toBeTruthy(); // saniye kırpılıyor
  });

  it("tercihler okunamadıysa anahtarları hepsi kapalı gibi göstermez", async () => {
    // Anahtarlar `settings` olmadan çizilseydi hepsi kapalı görünürdü;
    // kullanıcı açmaya çalışır, yazma da aynı ağ sorununa takılırdı.
    mockUseSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<NotificationSettingsScreen />);

    expect(screen.queryByLabelText("Geçmiş anı hatırlatmaları")).toBeNull();
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });

  it("ayarlar yüklenmeden anahtarları çizmez", async () => {
    mockUseSettings.mockReturnValue({ data: undefined, isLoading: true });
    await render(<NotificationSettingsScreen />);

    expect(screen.queryByLabelText("Geçmiş anı hatırlatmaları")).toBeNull();
  });
});

describe("bildirim ayarları — anahtarlar tercih ve zamanlamayı birlikte yürütür", () => {
  it("geçmiş anı hatırlatmasını açınca tercihi kaydeder VE bildirimleri kurar", async () => {
    mockUseSettings.mockReturnValue({ data: settingsWith({ past_memory_enabled: false }), isLoading: false });
    await render(<NotificationSettingsScreen />);

    await fireEvent(screen.getByLabelText("Geçmiş anı hatırlatmaları"), "valueChange", true);

    await waitFor(() => expect(mockScheduleMemory).toHaveBeenCalledWith("u1", "20:00:00"));
    expect(mockMutate).toHaveBeenCalledWith({ past_memory_enabled: true });
  });

  it("kapatınca zamanlanmış bildirimleri iptal eder ve izin sormaz", async () => {
    await render(<NotificationSettingsScreen />);

    await fireEvent(screen.getByLabelText("Geçmiş anı hatırlatmaları"), "valueChange", false);

    await waitFor(() => expect(mockCancelMemory).toHaveBeenCalled());
    expect(mockMutate).toHaveBeenCalledWith({ past_memory_enabled: false });
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockScheduleMemory).not.toHaveBeenCalled();
  });

  it("günlük hatırlatmayı açınca o saatle zamanlar", async () => {
    await render(<NotificationSettingsScreen />);

    await fireEvent(screen.getByLabelText("Günlük hatırlatma"), "valueChange", true);

    await waitFor(() => expect(mockScheduleDaily).toHaveBeenCalledWith("20:00:00"));
    expect(mockMutate).toHaveBeenCalledWith({ daily_reminder_enabled: true });
  });
});

describe("bildirim ayarları — izin akışı", () => {
  it("izin verilmezse NE tercih kaydedilir NE bildirim kurulur", async () => {
    // Aksi halde anahtar açık görünür ama hiçbir bildirim gelmez — kullanıcının
    // fark edemeyeceği bir sessiz uyumsuzluk.
    mockRequestPermission.mockResolvedValue(false);
    mockUseSettings.mockReturnValue({ data: settingsWith({ past_memory_enabled: false }), isLoading: false });
    await render(<NotificationSettingsScreen />);

    await fireEvent(screen.getByLabelText("Geçmiş anı hatırlatmaları"), "valueChange", true);

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockScheduleMemory).not.toHaveBeenCalled();
  });

  it("seri uyarısı cihaz izni istemez — açmak yalnızca tercihi kaydeder", async () => {
    // Bu anahtar zamanlama kurmuyor; bildirimi istatistik ekranı, seri riske
    // girdiğinde kuruyor. Buraya izin akışı eklemek gereksiz bir engel olurdu.
    mockUseSettings.mockReturnValue({ data: settingsWith({ streak_enabled: false }), isLoading: false });
    await render(<NotificationSettingsScreen />);

    await fireEvent(screen.getByLabelText("Seri risk uyarısı"), "valueChange", true);

    expect(mockMutate).toHaveBeenCalledWith({ streak_enabled: true });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("seri uyarısı kapatılınca zamanlanmış uyarı iptal edilir", async () => {
    await render(<NotificationSettingsScreen />);

    await fireEvent(screen.getByLabelText("Seri risk uyarısı"), "valueChange", false);

    expect(mockMutate).toHaveBeenCalledWith({ streak_enabled: false });
    expect(mockCancelStreak).toHaveBeenCalled();
  });
});

describe("bildirim ayarları — hatırlatma saati", () => {
  it("saat değişince yalnızca AÇIK olan bildirimleri yeni saatle yeniden kurar", async () => {
    // past_memory açık, daily kapalı: kapalı olanı yeniden kurmak, kullanıcının
    // kapattığı bildirimi geri getirirdi.
    await render(<NotificationSettingsScreen />);

    await fireEvent.press(screen.getByText("20:00"));
    await fireEvent.press(screen.getByLabelText("saat seç"));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({ reminder_time: "21:30:00" }));
    expect(mockScheduleMemory).toHaveBeenCalledWith("u1", "21:30:00");
    expect(mockScheduleDaily).not.toHaveBeenCalled();
  });
});

describe("bildirim ayarları — Expo Go", () => {
  it("native modül yokken uyarır ama tercihi yine de kaydeder", async () => {
    // Tercih kaydedilmezse kullanıcı development build'e geçtiğinde ayarları
    // baştan girmek zorunda kalırdı.
    mockNotificationsAvailable = false;
    mockUseSettings.mockReturnValue({ data: settingsWith({ past_memory_enabled: false }), isLoading: false });
    await render(<NotificationSettingsScreen />);

    expect(screen.getByText(/Expo Go'da yerel bildirimler desteklenmiyor/)).toBeTruthy();

    await fireEvent(screen.getByLabelText("Geçmiş anı hatırlatmaları"), "valueChange", true);

    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({ past_memory_enabled: true }));
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
