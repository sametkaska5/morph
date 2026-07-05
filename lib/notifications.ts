import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
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
  await Notifications.cancelAllScheduledNotificationsAsync();

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
      if (targetDate < new Date()) continue; // geçmişteyse zamanlamaya gerek yok

      targetDate.setHours(hour, minute, 0, 0);

      const label = months < 12 ? `${months} ay önce bugün` : `${months / 12} yıl önce bugün`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${label} 📸`,
          body: entry.note ?? "O günkü haline bir bak.",
          data: { entryId: entry.id },
        },
        trigger: targetDate,
      });
    }
  }
}

/** Günlük "bugün kaydetmeyi unutma" hatırlatması */
export async function scheduleDailyReminder(reminderTime: string) {
  const [hour, minute] = reminderTime.split(":").map(Number);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Bugünkü fotoğrafını çekmeyi unutma!",
      body: "Her gün kaydettiğin anılar, gelecekteki senin en büyük hediyesi.",
    },
    trigger: { hour, minute, repeats: true },
  });
}
