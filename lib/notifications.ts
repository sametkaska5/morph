import type * as NotificationsType from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { supabase } from "./supabase";

// Expo Go, Android'de SDK 53'ten beri expo-notifications'ın native modülünü içermiyor;
// paket import edilir edilmez (top-level side effect) senkron throw ediyor. Statik
// import Babel tarafından her koşulda çalıştırıldığı için, modülü sadece Expo Go
// DIŞINDAYKEN require ile yüklüyoruz — bu şekilde Expo Go'da hiç evaluate edilmiyor.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
 
const Notifications: typeof NotificationsType | null = isExpoGo
  ? null
  : require("expo-notifications"); // eslint-disable-line @typescript-eslint/no-require-imports -- Expo Go'da native modül eksik; statik import her koşulda evaluate edilirdi

// Ekranların (örn. Bildirimler ayarları) modül yokken sessizce başarısız olmak yerine
// kullanıcıya "development build gerekiyor" gibi açıklayıcı bir mesaj gösterebilmesi için.
export const NOTIFICATIONS_AVAILABLE = !!Notifications;

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermission() {
  if (!Notifications) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

const MEMORY_ID_PREFIX = "memory-";
const DAILY_REMINDER_ID = "daily-reminder";
const STREAK_RISK_ID = "streak-risk";

// Aynı öneke sahip (prefix) bildirimleri tek tek bulup iptal eder — expo-notifications'ın
// "cancelAll" fonksiyonu HER bildirimi (diğer türler dahil) siliyor, bu üç bildirim türü
// (anı/günlük/seri) birbirini ezmesin diye kendi kimlikleriyle scope'lanmış şekilde iptal ediyoruz.
async function cancelByPrefix(prefix: string) {
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier))
  );
}

/**
 * "X ay önce bugün" bildirimleri.
 * Sunucudan push gerektirmez: cihaz kendi geçmiş kayıtlarını bilir,
 * bu yüzden zamanlama tamamen yerelde yapılır.
 *
 * Strateji: 1 ay, 3 ay, 6 ay, 1 yıl, ve her yıl dönümü için,
 * o tarihte bir entry varsa yerel bildirim kur.
 */
export async function scheduleMemoryNotifications(userId: string, reminderTime: string) {
  if (!Notifications) return;
  await cancelByPrefix(MEMORY_ID_PREFIX);

  const { data: entries } = await supabase
    .from("entries")
    .select("id, date, note")
    .eq("user_id", userId)
    .eq("type", "log");

  if (!entries) return;

  const [hour, minute] = reminderTime.split(":").map(Number);
  const milestones = [1, 3, 6, 12]; // ay cinsinden

  for (const entry of entries) {
    const entryDate = new Date(entry.date);

    for (const months of milestones) {
      const targetDate = new Date(entryDate);
      targetDate.setMonth(targetDate.getMonth() + months);
      // Saati geçmiş kontrolünden ÖNCE uygula: aksi halde yıldönümü bugüne denk
      // gelip hatırlatma saati çoktan geçmişse, kontrol (gece yarısı ile) geçiyor
      // ama sonradan set edilen saat geçmişte kalıyor ve bildirim ya anında
      // tetikleniyor ya da hiç kurulmuyordu.
      targetDate.setHours(hour, minute, 0, 0);
      if (targetDate <= new Date()) continue; // geçmişteyse zamanlamaya gerek yok

      const label = months < 12 ? `${months} ay önce bugün` : `${months / 12} yıl önce bugün`;

      await Notifications.scheduleNotificationAsync({
        identifier: `${MEMORY_ID_PREFIX}${entry.id}-${months}`,
        content: {
          title: `${label} 📸`,
          body: entry.note ?? "O günkü haline bir bak.",
          data: { entryId: entry.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: targetDate },
      });
    }
  }
}

export async function cancelMemoryNotifications() {
  await cancelByPrefix(MEMORY_ID_PREFIX);
}

/**
 * Bugün henüz kayıt yapılmadıysa ve devam eden bir seri varsa, akşam saatinde
 * "serin bozulacak" uyarısı kurar. Her çağrıda önceki uyarıyı iptal edip yeniden
 * değerlendirir, böylece bugün kayıt yapılırsa bildirim otomatik düşer.
 */
export async function scheduleStreakRiskNotification(currentStreak: number, hasLoggedToday: boolean) {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_ID).catch(() => {});

  if (hasLoggedToday || currentStreak <= 0) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  const triggerDate = new Date();
  triggerDate.setHours(21, 0, 0, 0);
  if (triggerDate <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_RISK_ID,
    content: {
      title: "Serin risk altında! 🔥",
      body: `${currentStreak} günlük serin bugün bozulmak üzere. Hemen bir fotoğraf ekle.`,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });
}

export async function cancelStreakRiskNotification() {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_ID).catch(() => {});
}

/** Günlük "bugün kaydetmeyi unutma" hatırlatması */
export async function scheduleDailyReminder(reminderTime: string) {
  if (!Notifications) return;
  const [hour, minute] = reminderTime.split(":").map(Number);

  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: "Bugünkü fotoğrafını çekmeyi unutma!",
      body: "Her gün kaydettiğin anılar, gelecekteki senin en büyük hediyesi.",
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

export async function cancelDailyReminder() {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
}
