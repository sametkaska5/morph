import { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey } from "@/lib/date";

const CHART_W = 300;
const CHART_H = 110;

function useMeasurementTypes() {
  return useQuery({
    queryKey: ["measurement_types", "defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_types")
        .select("id, name, unit, target_direction")
        .eq("is_default", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

function useMeasurementSeries(userId: string | undefined, typeId: string | undefined) {
  return useQuery({
    queryKey: ["measurement_series", typeId],
    enabled: !!userId && !!typeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_values")
        .select("value, entries!inner(date, type, user_id)")
        .eq("measurement_type_id", typeId)
        .eq("entries.user_id", userId)
        .eq("entries.type", "log")
        .order("date", { foreignTable: "entries", ascending: true });
      if (error) throw error;
      return (data ?? []).map((d: any) => ({ date: d.entries.date, value: d.value }));
    },
  });
}

function useLast7Days(userId: string | undefined) {
  return useQuery({
    queryKey: ["last7days", userId],
    enabled: !!userId,
    queryFn: async () => {
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(toLocalDateKey(d));
      }
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, type")
        .eq("user_id", userId)
        .gte("date", days[0])
        .lte("date", days[days.length - 1]);
      if (error) throw error;

      const byDate = new Map((data ?? []).map((e) => [e.date, { id: e.id, type: e.type }]));
      const todayKey = days[days.length - 1];
      return days.map((date) => ({
        date,
        id: byDate.get(date)?.id ?? null,
        type: byDate.get(date)?.type ?? null,
        isToday: date === todayKey,
      }));
    },
  });
}

function buildChartPath(values: number[]) {
  if (values.length === 0) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? CHART_W / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = CHART_H - ((v - min) / range) * (CHART_H - 20) - 10;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${CHART_H} L0,${CHART_H} Z`;

  return { line, area, lastPoint: points[points.length - 1] };
}

const DAY_LABELS = ["P", "S", "Ç", "P", "C", "C", "P"];

export default function Istatistikler() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: types } = useMeasurementTypes();
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);

  const toggleOffDayMutation = useMutation({
    mutationFn: async ({ date, currentType, entryId }: { date: string; currentType: string | null; entryId: string | null }) => {
      if (!user) throw new Error("Giriş yapılmamış");

      if (currentType === "off_day" && entryId) {
        const { error } = await supabase.from("entries").delete().eq("id", entryId);
        if (error) throw error;
      } else if (!currentType) {
        const { error } = await supabase
          .from("entries")
          .upsert({ user_id: user.id, date, type: "off_day", note: null }, { onConflict: "user_id,date" });
        if (error) throw error;
      }
    },
    onMutate: async ({ date, currentType }) => {
      await queryClient.cancelQueries({ queryKey: ["last7days", user?.id] });
      const previous = queryClient.getQueryData<any[]>(["last7days", user?.id]);

      queryClient.setQueryData<any[]>(["last7days", user?.id], (old) =>
        old?.map((d) =>
          d.date === date ? { ...d, type: currentType === "off_day" ? null : "off_day" } : d
        )
      );

      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["last7days", user?.id], context.previous);
      }
      Alert.alert("Off day işlemi başarısız", (err as Error).message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["last7days"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  function handleDayPress(day: { date: string; id: string | null; type: string | null }) {
    if (day.type === "log" && day.id) {
      router.push(`/entry/${day.id}`);
    } else {
      toggleOffDayMutation.mutate({ date: day.date, currentType: day.type, entryId: day.id });
    }
  }

  const currentTypeId = activeTypeId ?? types?.[0]?.id;
  const activeType = types?.find((t) => t.id === currentTypeId);

  const { data: series, isLoading: seriesLoading } = useMeasurementSeries(user?.id, currentTypeId);
  const { data: last7, isLoading: last7Loading } = useLast7Days(user?.id);

  const values = series?.map((s) => s.value) ?? [];
  const { line, area, lastPoint } = buildChartPath(values);
  const currentValue = values[values.length - 1];
  const previousValue = values[values.length - 2];
  const delta = currentValue != null && previousValue != null ? Number((currentValue - previousValue).toFixed(1)) : null;
  const isGoodDelta =
    delta != null && activeType
      ? activeType.target_direction === "decrease_is_good"
        ? delta <= 0
        : delta >= 0
      : true;

  const currentStreak = (() => {
    if (!last7) return 0;
    let streak = 0;
    for (let i = last7.length - 1; i >= 0; i--) {
      if (last7[i].type) streak++;
      else break;
    }
    return streak;
  })();

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 30 }}>
      <Text className="text-text text-lg font-semibold px-4 mb-4">İstatistikler</Text>

      <View className="flex-row gap-2 px-4 mb-3.5">
        {types?.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setActiveTypeId(t.id)}
            className={`px-3.5 py-1.5 rounded-pill ${t.id === currentTypeId ? "bg-accent" : "bg-surface"}`}
          >
            <Text className={`text-xs font-semibold ${t.id === currentTypeId ? "text-bg" : "text-textMuted"}`}>
              {t.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mx-4 mb-3.5 bg-surface border border-border rounded-card p-4">
        {seriesLoading ? (
          <ActivityIndicator color="#8CE05A" />
        ) : values.length === 0 ? (
          <Text className="text-textMuted text-xs">Bu ölçüm için henüz veri yok.</Text>
        ) : (
          <>
            <View className="flex-row items-baseline gap-2 mb-2.5">
              <Text className="text-text text-2xl font-bold">
                {currentValue} <Text className="text-sm font-medium text-textMuted">{activeType?.unit}</Text>
              </Text>
              {delta != null ? (
                <Text className={`text-xs font-semibold ${isGoodDelta ? "text-accent" : "text-danger"}`}>
                  {delta > 0 ? "↑" : delta < 0 ? "↓" : "•"} {Math.abs(delta)} {activeType?.unit}
                </Text>
              ) : null}
            </View>

            <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
              <Defs>
                <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#8CE05A" stopOpacity={0.35} />
                  <Stop offset="100%" stopColor="#8CE05A" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={area} fill="url(#areaGrad)" />
              <Path d={line} fill="none" stroke="#8CE05A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {lastPoint ? <Circle cx={lastPoint.x} cy={lastPoint.y} r={4.5} fill="#0B0D0A" stroke="#8CE05A" strokeWidth={2.5} /> : null}
            </Svg>
          </>
        )}
      </View>

      <View className="mx-4 bg-surface border border-border rounded-card p-4">
        <View className="flex-row items-center gap-2.5 mb-3">
          <View className="w-8 h-8 rounded-lg bg-stamp/15 items-center justify-center">
            <Feather name="zap" size={16} color="#FF7A3D" />
          </View>
          <View>
            <Text className="text-text text-sm font-semibold">{currentStreak} gün üst üste</Text>
            <Text className="text-textFaint text-[11px]">son 7 gün</Text>
          </View>
        </View>

        {last7Loading ? (
          <ActivityIndicator color="#8CE05A" />
        ) : (
          <View className="flex-row justify-between">
            {last7?.map((day, i) => (
              <Pressable
                key={day.date}
                onPress={() => handleDayPress(day)}
                disabled={toggleOffDayMutation.isPending}
                className="items-center gap-1"
              >
                <View
                  className={`w-6 h-6 rounded-md items-center justify-center ${
                    day.type === "log"
                      ? "bg-accent"
                      : day.type === "off_day"
                      ? "bg-offDaySoft border border-offDay"
                      : day.isToday
                      ? "bg-accentSoft border border-dashed border-accent"
                      : "bg-white/5 border border-dashed border-white/20"
                  }`}
                >
                  {day.type === "log" ? (
                    <Feather name="zap" size={11} color="#0B0D0A" />
                  ) : day.type === "off_day" ? (
                    <Feather name="moon" size={11} color="#B8C0E0" />
                  ) : null}
                </View>
                <Text className="text-textFaint text-[9px]">{DAY_LABELS[i]}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
