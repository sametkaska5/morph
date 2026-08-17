import { View, ActivityIndicator } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text } from "@/components/Typography";
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { theme } from "@/lib/theme";
import { ErrorState } from "@/components/ErrorState";
import { formatDateKey } from "@/lib/date";
import { dayRoute, type DayRouteInput } from "@/lib/dayRoute";
import { hapticSelection } from "@/lib/haptics";

type WeekDay = {
  id: string | null;
  date: string;
  type: string | null;
  isFuture: boolean;
  isToday: boolean;
  label: string;
};

type Props = {
  currentStreak: number;
  weekRangeLabel: string;
  weekOffset: number;
  setWeekOffset: (val: number | ((prev: number) => number)) => void;
  weekLoading: boolean;
  weekError: Error | null;
  week: WeekDay[] | undefined;
  refetchWeek: () => void;
  onSharePress: () => void;
};

import { memo } from "react";

export const WeekTracker = memo(function WeekTracker({
  currentStreak,
  weekRangeLabel,
  weekOffset,
  setWeekOffset,
  weekLoading,
  weekError,
  week,
  refetchWeek,
  onSharePress,
}: Props) {
  function dayAccessibilityLabel(day: WeekDay) {
    const dateLabel = formatDateKey(day.date, { day: "numeric", month: "long", weekday: "long" });
    if (day.isFuture) return `${dateLabel}, henüz gelmedi`;
    const statusLabel =
      day.type === "log"
        ? "fotoğraflı kayıt var, açmak için dokun"
        : day.type === "off_day"
          ? "off day olarak işaretli, düzenlemek için dokun"
          : day.type === "workout"
            ? "antrenman günü, düzenlemek için dokun"
            : "boş, ölçüm veya program eklemek için dokun";
    return `${dateLabel}${day.isToday ? ", bugün" : ""}, ${statusLabel}`;
  }

  function handleDayPress(day: DayRouteInput) {
    const route = dayRoute(day);
    if (!route) return;
    hapticSelection();
    router.push(route);
  }

  return (
    <View className="mx-4 bg-surface border border-border rounded-card p-4">
      <View className="flex-row items-center justify-between mb-3 gap-2">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <View className="w-9 h-9 rounded-lg bg-stamp/15 items-center justify-center">
            <Feather name="zap" size={18} color={theme.colors.stamp} />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-text text-base font-semibold" numberOfLines={1}>
              {currentStreak} gün üst üste
            </Text>
            <Text className="text-textFaint text-xs capitalize">bu hafta</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-1 shrink-0">
          <PressableFade
            onPress={onSharePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Paylaşım kartı oluştur"
            className="w-9 h-9 items-center justify-center"
          >
            <Feather name="share-2" size={17} color={theme.colors.accent} />
          </PressableFade>
          <PressableFade
            onPress={() => router.push("/calendar-year")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Yıla göre gör"
            className="flex-row items-center gap-1 py-2 pl-1"
          >
            <Text className="text-accent text-sm font-medium capitalize">Yıla göre gör</Text>
            <Feather name="chevron-right" size={15} color={theme.colors.accent} />
          </PressableFade>
        </View>
      </View>

      <View className="flex-row items-center justify-between mb-3">
        <PressableFade
          onPress={() => setWeekOffset((o) => o - 1)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Önceki hafta"
          className="w-8 h-8 items-center justify-center"
        >
          <Feather name="chevron-left" size={18} color={theme.colors.textFaint} />
        </PressableFade>

        <PressableFade
          onPress={() => setWeekOffset(0)}
          disabled={weekOffset === 0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={
            weekOffset === 0 ? `${weekRangeLabel}, bu hafta` : `${weekRangeLabel}, bu haftaya dön`
          }
          className="flex-row items-center gap-1.5 px-2 py-1"
        >
          <Text
            className={`text-sm ${weekOffset === 0 ? "text-textFaint" : "text-text font-medium"}`}
          >
            {weekRangeLabel}
          </Text>
          {weekOffset !== 0 ? (
            <Feather name="rotate-ccw" size={13} color={theme.colors.accent} />
          ) : null}
        </PressableFade>

        <PressableFade
          onPress={() => setWeekOffset((o) => Math.min(0, o + 1))}
          disabled={weekOffset === 0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Sonraki hafta"
          accessibilityState={{ disabled: weekOffset === 0 }}
          className="w-8 h-8 items-center justify-center"
        >
          <Feather
            name="chevron-right"
            size={18}
            color={weekOffset === 0 ? "#3A3A34" : "#8B8A82"}
          />
        </PressableFade>
      </View>

      {weekLoading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : weekError ? (
        <ErrorState error={weekError} onRetry={() => refetchWeek()} />
      ) : (
        <View className="flex-row justify-between">
          {week?.map((day) => {
            return (
              <PressableFade
                key={day.date}
                onPress={() => handleDayPress(day)}
                disabled={day.isFuture}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={dayAccessibilityLabel(day)}
                accessibilityState={{ disabled: day.isFuture }}
                dim={day.isFuture ? 1 : 0.7}
                className="items-center gap-1"
              >
                <View
                  className={`w-8 h-8 rounded-md items-center justify-center ${
                    day.type === "log"
                      ? "bg-accent"
                      : day.type === "off_day"
                        ? "bg-offDaySoft border border-offDay"
                        : day.type === "workout"
                          ? "bg-accentSoft border border-accent"
                          : day.isFuture
                            ? "bg-transparent"
                            : day.isToday
                              ? "bg-accentSoft border border-dashed border-accent"
                              : "bg-white/5 border border-dashed border-white/20"
                  }`}
                >
                  {day.type === "log" ? (
                    <Feather name="zap" size={14} color={theme.colors.bg} />
                  ) : day.type === "off_day" ? (
                    <Feather name="moon" size={14} color="#B8C0E0" />
                  ) : day.type === "workout" ? (
                    <Feather name="check" size={14} color={theme.colors.accent} />
                  ) : null}
                </View>
                <Text
                  className={`text-xs ${day.isFuture ? "text-textFaint/40" : "text-textFaint"}`}
                >
                  {day.label}
                </Text>
              </PressableFade>
            );
          })}
        </View>
      )}
    </View>
  );
});
