/**
 * Android bildirim kanalı.
 *
 * Kanal olmadan da bildirim "zamanlanmış" görünüyor — getAllScheduledNotifications
 * onu listeliyor, hata da alınmıyor. Ama Android varsayılan kanalın önceliğine
 * göre bildirimi ekranda hiç göstermeyebiliyor. Yani bu, testsiz bırakılırsa
 * SESSİZCE bozulacak bir davranış: kodda hiçbir belirti yok, sadece bazı
 * telefonlarda bildirim gelmiyor.
 *
 * Korunan üç şey: (1) kanal zamanlamadan ÖNCE oluşturuluyor, (2) zamanlanan her
 * bildirim kanal kimliğini taşıyor, (3) Android dışında kanal kurulmuyor.
 */

const mockSetChannel = jest.fn();
const mockSchedule = jest.fn();
const mockCancel = jest.fn();
const mockGetAll = jest.fn();
/** Çağrı sırasını tek bir listede toplamak için — kanal önce mi kuruluyor? */
const callOrder: string[] = [];

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "bare" },
  ExecutionEnvironment: { StoreClient: "storeClient", Bare: "bare", Standalone: "standalone" },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: (...args: unknown[]) => {
    callOrder.push("channel");
    return mockSetChannel(...args);
  },
  scheduleNotificationAsync: (...args: unknown[]) => {
    callOrder.push("schedule");
    return mockSchedule(...args);
  },
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancel(...args),
  getAllScheduledNotificationsAsync: () => mockGetAll(),
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
  AndroidImportance: { HIGH: 6, DEFAULT: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

jest.mock("../supabase", () => ({ supabase: {} }));

import { Platform } from "react-native";
import { scheduleDailyReminder, ensureNotificationChannel } from "../notifications";

beforeEach(() => {
  jest.clearAllMocks();
  callOrder.length = 0;
  mockSetChannel.mockResolvedValue(undefined);
  mockSchedule.mockResolvedValue("id");
  mockCancel.mockResolvedValue(undefined);
  mockGetAll.mockResolvedValue([]);
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});

describe("bildirim kanalı", () => {
  it("yüksek öncelikli bir kanal oluşturur", async () => {
    // Öncelik düşük olursa bildirim ekranda belirmez, sessizce gölgeye düşer.
    await ensureNotificationChannel();

    expect(mockSetChannel).toHaveBeenCalledWith(
      "reminders",
      expect.objectContaining({ importance: 6 }),
    );
  });

  it("Android dışında kanal kurmaz", async () => {
    // Kanal Android'e özgü bir kavram; iOS'ta çağırmak anlamsız.
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });

    await ensureNotificationChannel();

    expect(mockSetChannel).not.toHaveBeenCalled();
  });
});

describe("günlük hatırlatma — kanal bağlantısı", () => {
  it("kanalı bildirimi zamanlamadan ÖNCE oluşturur", async () => {
    // Var olmayan bir kanala gönderilen bildirimi Android düşürüyor; sıra şart.
    await scheduleDailyReminder("21:00:00");

    expect(callOrder.indexOf("channel")).toBeLessThan(callOrder.indexOf("schedule"));
  });

  it("zamanlanan bildirime kanal kimliğini yazar", async () => {
    await scheduleDailyReminder("21:00:00");

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          type: "daily",
          hour: 21,
          minute: 0,
          channelId: "reminders",
        }),
      }),
    );
  });

  it("saati doğru ayrıştırır (saniyeyi yok sayar)", async () => {
    await scheduleDailyReminder("07:05:00");

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ hour: 7, minute: 5 }),
      }),
    );
  });

  it("iOS'ta kanal kurmadan da zamanlamaya devam eder", async () => {
    // Kanal atlanınca zamanlama da atlanırsa iOS'ta bildirim hiç kurulmazdı.
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });

    await scheduleDailyReminder("21:00:00");

    expect(mockSetChannel).not.toHaveBeenCalled();
    expect(mockSchedule).toHaveBeenCalled();
  });
});
