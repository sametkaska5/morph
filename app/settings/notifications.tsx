import { useState } from "react";
import { View, Pressable, Switch, ActivityIndicator, Platform } from "react-native";
import { showAlert } from "@/lib/appAlert";
import { Text } from "@/components/Typography";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { useNotificationSettings, useUpdateNotificationSettings } from "@/lib/notificationSettings";
import {
  NOTIFICATIONS_AVAILABLE,
  requestNotificationPermission,
  scheduleMemoryNotifications,
  cancelMemoryNotifications,
  scheduleDailyReminder,
  cancelDailyReminder,
  cancelStreakRiskNotification,
} from "@/lib/notifications";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";

const ACCENT = "#8CE05A";

function parseTimeToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatTimeFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

function SettingSwitch({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
      <View className="flex-1 pr-3">
        <Text className="text-text text-base font-semibold">{label}</Text>
        <Text className="text-textFaint text-sm mt-0.5">{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        // Etiket olmadan ekran okuyucu üç anahtarı da isimsiz okuyordu: yandaki
        // başlık ayrı bir Text, anahtarla ilişkilendirilmiş değil.
        accessibilityLabel={label}
        trackColor={{ false: "#3A3830", true: ACCENT }}
        thumbColor="#F5F3EC"
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const screen = useScreenInsets();
  const { user } = useAuth();
  const { data: settings, isLoading, error, refetch } = useNotificationSettings(user?.id);
  const updateMutation = useUpdateNotificationSettings(user?.id);
  const [showPicker, setShowPicker] = useState(false);

  async function ensurePermission() {
    if (!NOTIFICATIONS_AVAILABLE) {
      showAlert(
        "Bu özellik Expo Go'da desteklenmiyor",
        "Yerel bildirimler için development build gerekiyor. Tercihini yine de kaydediyoruz, development build'e geçince otomatik devreye girecek."
      );
      return true; // tercihi kaydetmeye devam et — zamanlama fonksiyonları modül yokken zaten no-op
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      showAlert(
        "Bildirim izni verilmedi",
        "Bu özelliği kullanabilmek için cihaz ayarlarından Remory'e bildirim izni vermen gerekiyor."
      );
    }
    return granted;
  }

  async function togglePastMemory(next: boolean) {
    if (!settings) return;
    if (next && !(await ensurePermission())) return;
    updateMutation.mutate({ past_memory_enabled: next });
    if (next && user) {
      await scheduleMemoryNotifications(user.id, settings.reminder_time);
    } else {
      await cancelMemoryNotifications();
    }
  }

  async function toggleDailyReminder(next: boolean) {
    if (!settings) return;
    if (next && !(await ensurePermission())) return;
    updateMutation.mutate({ daily_reminder_enabled: next });
    if (next) {
      await scheduleDailyReminder(settings.reminder_time);
    } else {
      await cancelDailyReminder();
    }
  }

  function toggleStreak(next: boolean) {
    updateMutation.mutate({ streak_enabled: next });
    if (!next) cancelStreakRiskNotification();
  }

  async function handleTimeChange(selected: Date) {
    if (Platform.OS === "android") setShowPicker(false);
    if (!settings || !user) return;

    const newTime = formatTimeFromDate(selected);
    updateMutation.mutate({ reminder_time: newTime });

    if (settings.past_memory_enabled) await scheduleMemoryNotifications(user.id, newTime);
    if (settings.daily_reminder_enabled) await scheduleDailyReminder(newTime);
  }

  return (
    <View
      className="flex-1 bg-bg px-4"
      style={{ paddingTop: screen.top, paddingBottom: screen.insets.bottom }}
    >
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">Bildirimler</Text>
      </View>

      {!NOTIFICATIONS_AVAILABLE ? (
        <View className="bg-surface border border-border rounded-button px-4 py-3 mb-4 flex-row items-start gap-3">
          <Feather name="info" size={15} color="#8B8A82" style={{ marginTop: 1 }} />
          <Text className="text-textMuted text-sm flex-1 leading-5">
            Expo Go'da yerel bildirimler desteklenmiyor. Tercihlerini kaydedebilirsin, ancak bildirimlerin
            fiilen gelmesi için development build gerekiyor.
          </Text>
        </View>
      ) : null}

      {error ? (
        // Tercihler okunamadan anahtarları göstermek yanıltıcı olurdu: hepsi
        // kapalı görünür, kullanıcı açmaya çalışır, yazma da aynı ağ sorununa
        // takılırdı.
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !settings ? (
        <ActivityIndicator color={ACCENT} className="mt-10" />
      ) : (
        <>
          <View className="bg-surface border border-border rounded-card overflow-hidden mb-4">
            <SettingSwitch
              label="Geçmiş anı hatırlatmaları"
              description="1 ay, 3 ay, 6 ay, 1 yıl önce çektiğin fotoğrafları hatırlatır"
              value={settings.past_memory_enabled}
              onChange={togglePastMemory}
            />
            <SettingSwitch
              label="Seri risk uyarısı"
              description="Bugün henüz kayıt yapmadıysan ve serin varsa akşam uyarır"
              value={settings.streak_enabled}
              onChange={toggleStreak}
            />
            <SettingSwitch
              label="Günlük hatırlatma"
              description="Her gün belirlediğin saatte fotoğraf çekmeni hatırlatır"
              value={settings.daily_reminder_enabled}
              onChange={toggleDailyReminder}
            />
          </View>

          <Pressable
            onPress={() => setShowPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Hatırlatma saati: ${settings.reminder_time.slice(0, 5)}`}
            accessibilityHint="Saat seçiciyi açar"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="bg-surface border border-border rounded-button px-4 py-4 flex-row items-center justify-between"
          >
            <Text className="text-textMuted text-sm">Hatırlatma saati</Text>
            <Text className="text-text text-base font-semibold">
              {settings.reminder_time.slice(0, 5)}
            </Text>
          </Pressable>

          {showPicker && (
            <DateTimePicker
              value={parseTimeToDate(settings.reminder_time)}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onValueChange={(_, selected) => handleTimeChange(selected)}
              onDismiss={() => setShowPicker(false)}
            />
          )}
        </>
      )}
    </View>
  );
}
