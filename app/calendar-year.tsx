import { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey } from "@/lib/date";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function getMonthGrid(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Pazartesi=0 olacak şekilde kaydır
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toLocalDateKey(new Date(year, monthIndex, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function useYearEntries(userId: string | undefined, year: number) {
  return useQuery({
    queryKey: ["yearEntries", userId, year],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("date, type")
        .eq("user_id", userId)
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`);
      if (error) throw error;

      // Map yerine düz obje: sorgu sonucu AsyncStorage'a JSON olarak kalıcı
      // hale getiriliyor (bkz. app/_layout.tsx PersistQueryClientProvider) — Map
      // JSON'a çevrilemediği için geri yüklendiğinde düz {} objesine dönüşüyor
      // ve .get() çağrısı "undefined is not a function" ile patlıyordu.
      const map: Record<string, string> = {};
      (data ?? []).forEach((e) => {
        map[e.date] = e.type;
      });
      return map;
    },
  });
}

function MonthCalendar({ year, monthIndex, statusMap }: { year: number; monthIndex: number; statusMap: Record<string, string> }) {
  const weeks = getMonthGrid(year, monthIndex);
  const todayKey = toLocalDateKey(new Date());

  return (
    <View className="mb-5">
      <Text className="text-text text-base font-semibold mb-2">{MONTH_NAMES[monthIndex]}</Text>
      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row mb-1">
          {week.map((dateKey, di) => {
            if (!dateKey) return <View key={di} style={{ flex: 1, aspectRatio: 1, marginHorizontal: 2 }} />;
            const status = statusMap[dateKey];
            const isFuture = dateKey > todayKey;
            const isToday = dateKey === todayKey;
            return (
              <View
                key={di}
                style={{ flex: 1, aspectRatio: 1, marginHorizontal: 2 }}
                className={`rounded-[4px] items-center justify-center ${
                  status === "log"
                    ? "bg-accent"
                    : status === "off_day"
                    ? "bg-offDaySoft border border-offDay"
                    : status === "workout"
                    ? "bg-accentSoft border border-accent"
                    : isToday
                    ? "border border-dashed border-accent"
                    : isFuture
                    ? "bg-transparent"
                    : "bg-white/5"
                }`}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function CalendarYear() {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: statusMap, isLoading } = useYearEntries(user?.id, year);

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 32, paddingHorizontal: 20 }}>
      <View className="flex-row items-center justify-between mb-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => setYear((y) => y - 1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="chevron-left" size={18} color="#8B8A82" />
          </Pressable>
          <Text className="text-text text-xl font-bold">{year}</Text>
          <Pressable
            onPress={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="chevron-right" size={18} color={year >= new Date().getFullYear() ? "#3A3A34" : "#8B8A82"} />
          </Pressable>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <View className="flex-row gap-4 mt-5 mb-4">
        <View className="flex-row items-center gap-2">
          <View className="w-5 h-5 rounded-[5px] bg-accent" />
          <Text className="text-textFaint text-sm capitalize">kayıt</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="w-5 h-5 rounded-[5px] bg-accentSoft border border-accent" />
          <Text className="text-textFaint text-sm capitalize">antrenman</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="w-5 h-5 rounded-[5px] bg-offDaySoft border border-offDay" />
          <Text className="text-textFaint text-sm capitalize">off day</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-10" />
      ) : (
        <View className="flex-row flex-wrap justify-between">
          {Array.from({ length: 12 }).map((_, i) => (
            <View key={i} style={{ width: "48%" }}>
              <MonthCalendar year={year} monthIndex={i} statusMap={statusMap ?? {}} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
