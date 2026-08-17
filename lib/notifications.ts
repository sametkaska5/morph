import type * as NotificationsType from "expo-notifications";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { supabase } from "./supabase";
import { captureError } from "./monitoring";
import { pickMemoryMilestones } from "./memoryMilestones";
import { parseReminderTime } from "./date";

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

/**
 * İzin SORAR ama İSTEMEZ — işletim sistemi diyaloğunu açmaz.
 *
 * Ayrım önemli: requestPermissionsAsync izin verilmemişse sistem diyaloğunu
 * AÇIYOR. Bakım/arka plan yollarından çağrıldığında bu, kullanıcıya hiç
 * beklemediği bir yerde izin sorusu çıkarıyor — seri uyarısı İstatistikler
 * ekranının bir effect'inden zamanlandığı için, sekmeye dokunmak izin diyaloğunu
 * tetikliyordu. İzin isteme yalnızca kullanıcının bir anahtarı açtığı yerde
 * (Bildirimler ayarları) olmalı; zamanlama tarafı sadece mevcut durumu okur.
 */
export async function hasNotificationPermission() {
  if (!Notifications) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

const MEMORY_ID_PREFIX = "memory-";
const DAILY_REMINDER_ID = "daily-reminder";
const STREAK_RISK_ID = "streak-risk";

/* ─────────────── BİLDİRİME DOKUNMA → KAYDIN DETAYI ─────────────── */

/** Dokunulan bildirimden çıkarılan yönlendirme bilgisi. */
export type NotificationTap = {
  /** Bildirimin kendi kimliği — aynı dokunmayı iki kez işlememek için. */
  notificationId: string;
  entryId: string;
};

/**
 * Bir bildirim yanıtından yönlendirilecek kaydı çıkarır.
 *
 * Yükü `unknown` üzerinden daraltıyoruz: `content.data` serbest biçimli bir
 * sözlük ve içeriğini işletim sistemi saklıyor — eski sürümde zamanlanmış,
 * `entryId` taşımayan bir bildirim (günlük hatırlatma, seri uyarısı) buradan
 * geçebilir. Doğrulamadan `entryId` okunursa `/entry/undefined` route'una
 * gidilir ve ekran "kayıt bulunamadı" ile açılır.
 *
 * Native modüle dokunmuyor (Expo Go'da `Notifications` null) — bu yüzden saf ve
 * doğrudan test edilebilir. Parametre yapısal olarak tiplenmiş, böylece
 * `Notifications.NotificationResponse` de olduğu gibi geçebiliyor.
 */
export function notificationTap(
  response:
    | { notification: { request: { identifier: string; content: { data?: unknown } } } }
    | null
    | undefined,
): NotificationTap | null {
  const request = response?.notification?.request;
  if (!request) return null;

  const data = request.content?.data;
  if (!data || typeof data !== "object") return null;

  const entryId = (data as Record<string, unknown>).entryId;
  if (typeof entryId !== "string" || !entryId) return null;

  return { notificationId: request.identifier, entryId };
}

/**
 * Uygulama bir bildirime dokunularak açıldıysa (soğuk açılış) o dokunmayı döner.
 *
 * Uygulama kapalıyken gelen dokunma için dinleyici geç kalıyor: süreç bildirim
 * yüzünden başlıyor ve olay biz abone olmadan önce yayınlanmış oluyor. İşletim
 * sisteminin sakladığı SON yanıtı bu yüzden ayrıca soruyoruz.
 */
export async function getInitialNotificationTap(): Promise<NotificationTap | null> {
  if (!Notifications) return null;
  try {
    return notificationTap(await Notifications.getLastNotificationResponseAsync());
  } catch (err) {
    // Yönlendirme bir KOLAYLIK — patlaması açılışı bozmamalı.
    captureError(err, { where: "notifications.initialTap" });
    return null;
  }
}

/**
 * Uygulama açıkken (ön veya arka planda) bildirime dokunulmasını dinler.
 * Abonelikten çıkma fonksiyonu döner; Expo Go'da no-op.
 */
export function addNotificationTapListener(handler: (tap: NotificationTap) => void): () => void {
  if (!Notifications) return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const tap = notificationTap(response);
    if (tap) handler(tap);
  });

  return () => subscription.remove();
}

/**
 * Android bildirim kanalı.
 *
 * Android 8'den beri her bildirim bir kanala ait olmak zorunda. Kanalı biz
 * tanımlamazsak sistem kendi varsayılanını kullanıyor ve o kanalın önceliği
 * cihaza göre değişiyor: düşükse bildirim ekranda BELİRMİYOR, sessizce bildirim
 * gölgesine düşüyor. Zamanlanmış bildirimlerde `channelId: null` görülmesinin
 * sebebi buydu — bir telefonda çalışıp diğerinde "hiç gelmedi" denmesi de.
 *
 * Tek kanal kullanıyoruz, bildirim türü başına ayrı ayrı değil: uygulamanın
 * kendi içinde zaten üç ayrı anahtar var ve kullanıcı neyi isteyip istemediğini
 * oradan seçiyor. Ayrı kanallar olsaydı, Android ayarlarından kapatılan bir
 * kanal uygulamadaki anahtarı yalancı çıkarırdı (anahtar açık görünür, bildirim
 * gelmez).
 */
const CHANNEL_ID = "reminders";

/**
 * Kanalı oluşturur (varsa günceller). Bildirim zamanlamadan önce çağrılmalı —
 * var olmayan bir kanala gönderilen bildirim Android tarafından düşürülür.
 * Android dışında no-op.
 */
export async function ensureNotificationChannel() {
  if (!Notifications || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Hatırlatmalar",
    description: "Günlük hatırlatma, geçmiş anılar ve seri uyarıları",
    // HIGH: bildirim ekranın üstünde banner olarak belirsin ve ses çıkarsın.
    // Kullanıcı bunu Android ayarlarından kısabilir — son söz onda.
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// Aynı öneke sahip (prefix) bildirimleri tek tek bulup iptal eder — expo-notifications'ın
// "cancelAll" fonksiyonu HER bildirimi (diğer türler dahil) siliyor, bu üç bildirim türü
// (anı/günlük/seri) birbirini ezmesin diye kendi kimlikleriyle scope'lanmış şekilde iptal ediyoruz.
async function cancelByPrefix(prefix: string) {
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * "X ay önce bugün" bildirimleri.
 * Sunucudan push gerektirmez: cihaz kendi geçmiş kayıtlarını bilir,
 * bu yüzden zamanlama tamamen yerelde yapılır.
 *
 * Hepsi DEĞİL, yalnızca en yakın MAX_MEMORY_NOTIFICATIONS tanesi kuruluyor —
 * gerekçesi lib/memoryMilestones.ts'te (işletim sisteminin bekleyen bildirim
 * sınırı). Uzaktakiler her uygulama açılışında tazelenen listeyle sıraları
 * gelince kuruluyor (bkz. refreshMemoryNotifications).
 */
export async function scheduleMemoryNotifications(userId: string, reminderTime: string) {
  if (!Notifications) return;
  await ensureNotificationChannel();
  await cancelByPrefix(MEMORY_ID_PREFIX);

  const { data: entries } = await supabase
    .from("entries")
    .select("id, date, note")
    .eq("user_id", userId)
    .eq("type", "log");

  if (!entries) return;

  const milestones = pickMemoryMilestones(entries, reminderTime, new Date());

  for (const milestone of milestones) {
    const label =
      milestone.months < 12
        ? `${milestone.months} ay önce bugün`
        : `${milestone.months / 12} yıl önce bugün`;

    await Notifications.scheduleNotificationAsync({
      identifier: `${MEMORY_ID_PREFIX}${milestone.entryId}-${milestone.months}`,
      content: {
        title: `${label} 📸`,
        body: milestone.note ?? "O günkü haline bir bak.",
        data: { entryId: milestone.entryId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: milestone.date,
        channelId: CHANNEL_ID,
      },
    });
  }
}

/**
 * Uygulama açılışında "geçmiş anı" bildirimlerini yeniden kurar.
 *
 * Sınır yüzünden yalnızca en yakın N tanesini zamanlıyoruz; tetiklenenlerin
 * yerine sıradakiler ancak yeniden hesaplanınca giriyor. Bu olmadan, ilk N
 * bildirim tükendikten sonra kullanıcı bir daha hiç anı bildirimi almazdı —
 * üstelik hiçbir hata belirtisi olmadan.
 *
 * Bakım işi: kullanıcı akışını bloklamamalı, hatası kullanıcıya gösterilmemeli.
 */
export async function refreshMemoryNotifications(userId: string, reminderTime: string) {
  try {
    await scheduleMemoryNotifications(userId, reminderTime);
  } catch (err) {
    captureError(err, { where: "notifications.refreshMemory" });
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
export async function scheduleStreakRiskNotification(
  currentStreak: number,
  hasLoggedToday: boolean,
) {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_ID).catch(() => {});

  if (hasLoggedToday || currentStreak <= 0) return;

  // SORAR, istemez (bkz. hasNotificationPermission): burası bir effect'ten
  // çağrılıyor, kullanıcının dokunuşuyla değil.
  const granted = await hasNotificationPermission();
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
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelStreakRiskNotification() {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_ID).catch(() => {});
}

/** Günlük "bugün kaydetmeyi unutma" hatırlatması */
export async function scheduleDailyReminder(reminderTime: string) {
  if (!Notifications) return;

  const parsed = parseReminderTime(reminderTime);
  if (!parsed) {
    captureError(new Error(`Geçersiz hatırlatma saati: ${JSON.stringify(reminderTime)}`), {
      where: "notifications.scheduleDailyReminder",
    });
    return;
  }
  const { hour, minute } = parsed;

  await ensureNotificationChannel();

  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: "Bugünkü fotoğrafını çekmeyi unutma!",
      body: "Her gün kaydettiğin anılar, gelecekteki senin en büyük hediyesi.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelDailyReminder() {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
}
