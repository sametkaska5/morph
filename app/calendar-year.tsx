import { useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Text } from "@/components/Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey, MONTH_NAMES } from "@/lib/date";
import { useYearEntries } from "@/lib/entries";
import { dayRoute } from "@/lib/dayRoute";

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

/**
 * Gün kutusunun ekran okuyucuya söyleyeceği metin.
 *
 * Bu ızgara bilgiyi YALNIZCA renkle aktarıyor; etiket olmadan görme engelli bir
 * kullanıcı için takvim tamamen boş. Eskiden etiketi sadece ANLAMI olan günlere
 * verip boş kutuları odak dışında tutuyorduk (365 odak durağı istemiyorduk) —
 * ama kutular artık birer düğme: boş bir güne dokunmak o tarihe kayıt eklemenin
 * yolu. Odaklanamayan kutu, o kullanıcıdan özelliği tümden gizlerdi. Gelecek
 * günler hâlâ salt dekor, onlar odak dışında (`null` döner).
 */
function dayCellLabel(dateKey: string, status: string | undefined, isToday: boolean, isFuture: boolean) {
  if (isFuture) return null;

  const dayNumber = Number(dateKey.slice(8, 10));
  const monthName = MONTH_NAMES[Number(dateKey.slice(5, 7)) - 1];
  const statusLabel =
    status === "log"
      ? "fotoğraflı kayıt, açmak için dokun"
      : status === "off_day"
        ? "off day, düzenlemek için dokun"
        : status === "workout"
          ? "antrenman günü, düzenlemek için dokun"
          : "kayıt yok, ölçüm veya program eklemek için dokun";

  const parts = [`${dayNumber} ${monthName}`];
  if (isToday) parts.push("bugün");
  parts.push(statusLabel);
  return parts.join(", ");
}

function MonthCalendar({
  year,
  monthIndex,
  statusMap,
  onDayPress,
}: {
  year: number;
  monthIndex: number;
  statusMap: Record<string, { id: string; type: string }>;
  onDayPress: (dateKey: string, entry: { id: string; type: string } | undefined, isFuture: boolean) => void;
}) {
  const weeks = getMonthGrid(year, monthIndex);
  const todayKey = toLocalDateKey(new Date());

  return (
    <View className="mb-5">
      <Text className="text-text text-base font-semibold mb-2">{MONTH_NAMES[monthIndex]}</Text>
      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row mb-1">
          {week.map((dateKey, di) => {
            if (!dateKey) return <View key={di} style={{ flex: 1, aspectRatio: 1, marginHorizontal: 2 }} />;
            const entry = statusMap[dateKey];
            const status = entry?.type;
            const isFuture = dateKey > todayKey;
            const isToday = dateKey === todayKey;
            const label = dayCellLabel(dateKey, status, isToday, isFuture);
            return (
              <Pressable
                key={di}
                onPress={() => onDayPress(dateKey, entry, isFuture)}
                disabled={isFuture}
                accessible={label !== null}
                accessibilityRole={label !== null ? "button" : undefined}
                accessibilityLabel={label ?? undefined}
                // style DÜZ NESNE, fonksiyon değil: kutunun yerleşimi (flex/
                // aspectRatio) buradan, rengi className'den geliyor ve
                // NativeWind bu ikisini yalnızca nesne biçiminde güvenilir
                // birleştiriyor. Fonksiyon stiline geçirildiğinde ızgara
                // dağılıyordu — dokunma geri bildirimi bu yüzden yok.
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

  // Takvim artık salt görsel değil: hafta şeridiyle AYNI kuralla (bkz.
  // lib/dayRoute.ts) o güne gidiyor. Aylar öncesine dönük bir off day
  // işaretlemenin en kısa yolu — şeritte aynı yere ulaşmak onlarca hafta
  // geriye tıklamak demekti.
  function handleDayPress(
    dateKey: string,
    entry: { id: string; type: string } | undefined,
    isFuture: boolean
  ) {
    const route = dayRoute({
      date: dateKey,
      id: entry?.id ?? null,
      type: entry?.type ?? null,
      isFuture,
    });
    if (route) router.push(route);
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 32, paddingHorizontal: 20 }}>
      <View className="flex-row items-center justify-between mb-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => setYear((y) => y - 1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Önceki yıl"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="chevron-left" size={18} color="#8B8A82" />
          </Pressable>
          <Text className="text-text text-xl font-bold" accessibilityRole="header">
            {year}
          </Text>
          <Pressable
            onPress={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Sonraki yıl"
            accessibilityState={{ disabled: year >= new Date().getFullYear() }}
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
              <MonthCalendar
                year={year}
                monthIndex={i}
                statusMap={statusMap ?? {}}
                onDayPress={handleDayPress}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
