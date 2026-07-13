import { useState } from "react";
import { View, Text, Pressable, Switch, ActivityIndicator, Platform, Alert } from "react-native";
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
    <View className="flex-row items-center justify-between px-3.5 py-3 border-b border-border last:border-b-0">
      <View className="flex-1 pr-3">
        <Text className="text-text text-sm font-semibold">{label}</Text>
        <Text className="text-textFaint text-[11px] mt-0.5">{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: "#3A3830", true: ACCENT }}
        thumbColor="#F5F3EC"
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const { data: settings, isLoading } = useNotificationSettings(user?.id);
  const updateMutation = useUpdateNotificationSettings(user?.id);
  const [showPicker, setShowPicker] = useState(false);

  async function ensurePermission() {
    if (!NOTIFICATIONS_AVAILABLE) {
      Alert.alert(
        "Bu özellik Expo Go'da desteklenmiyor",
        "Yerel bildirimler için development build gerekiyor. Tercihini yine de kaydediyoruz, development build'e geçince otomatik devreye girecek."
      );
      return true; // tercihi kaydetmeye devam et — zamanlama fonksiyonları modül yokken zaten no-op
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
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

  async function handleTimeChange(selected: Date | undefined) {
    setShowPicker(Platform.OS === "ios");
    if (!selected || !settings || !user) return;

    const newTime = formatTimeFromDate(selected);
    updateMutation.mutate({ reminder_time: newTime });

    if (settings.past_memory_enabled) await scheduleMemoryNotifications(user.id, newTime);
    if (settings.daily_reminder_enabled) await scheduleDailyReminder(newTime);
  }

  return (
    <View className="flex-1 bg-bg pt-16 px-4">
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-lg font-bold">Bildirimler</Text>
      </View>

      {!NOTIFICATIONS_AVAILABLE ? (
        <View className="bg-surface border border-border rounded-card px-3.5 py-3 mb-4 flex-row items-start gap-2.5">
          <Feather name="info" size={15} color="#8B8A82" style={{ marginTop: 1 }} />
          <Text className="text-textMuted text-[11px] flex-1 leading-4">
            Expo Go'da yerel bildirimler desteklenmiyor. Tercihlerini kaydedebilirsin, ancak bildirimlerin
            fiilen gelmesi için development build gerekiyor.
          </Text>
        </View>
      ) : null}

      {isLoading || !settings ? (
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
            className="bg-surface border border-border rounded-card px-4 py-3.5 flex-row items-center justify-between"
          >
            <Text className="text-textMuted text-xs">Hatırlatma saati</Text>
            <Text className="text-text text-sm font-semibold">
              {settings.reminder_time.slice(0, 5)}
            </Text>
          </Pressable>

          {showPicker && (
            <DateTimePicker
              value={parseTimeToDate(settings.reminder_time)}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, selected) => handleTimeChange(selected)}
            />
          )}
        </>
      )}
    </View>
  );
}
