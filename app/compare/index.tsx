import { View, Text, Image, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Feather from "@expo/vector-icons/Feather";
import { fetchComparisonBetween } from "@/lib/comparison";

function useComparison(a: string | undefined, b: string | undefined) {
  return useQuery({
    queryKey: ["comparison", a, b],
    enabled: !!a && !!b,
    queryFn: () => fetchComparisonBetween(a!, b!),
  });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function Compare() {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { data, isLoading, error } = useComparison(a, b);

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 30 }}>
      <View className="flex-row items-center justify-between px-4 mb-1">
        <Pressable onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <View className="items-center">
          <Text className="text-text text-base font-bold">Karşılaştırma</Text>
          <Text className="text-textFaint text-[11px]">Değişimini gör</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-10" />
      ) : error ? (
        <Text className="text-danger text-xs text-center mt-6 px-6">{(error as Error).message}</Text>
      ) : !data ? (
        <Text className="text-textMuted text-sm text-center mt-10 px-8">
          Karşılaştırma yüklenemedi.
        </Text>
      ) : (
        <ComparisonBody data={data} />
      )}

      <View className="px-4 mt-2">
        <Pressable
          onPress={() => router.replace("/compare/pick")}
          className="border border-accent rounded-card py-3.5 items-center"
        >
          <Text className="text-accent text-sm font-semibold">Başka Fotoğraf Seç</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ComparisonBody({ data }: { data: NonNullable<Awaited<ReturnType<typeof fetchComparisonBetween>>> }) {
  const { start, end, daysBetween, types } = data;

  const rows = types
    .map((t) => {
      const startVal = start.measurements[t.id];
      const endVal = end.measurements[t.id];
      if (startVal == null && endVal == null) return null;
      const delta = startVal != null && endVal != null ? Number((endVal - startVal).toFixed(1)) : null;
      const isGood =
        delta == null ? true : t.targetDirection === "decrease_is_good" ? delta <= 0 : delta >= 0;
      return { ...t, startVal, endVal, delta, isGood };
    })
    .filter(Boolean) as any[];

  return (
    <View className="mt-3">
      <View className="mx-4 rounded-card overflow-hidden flex-row h-72 mb-3.5">
        <View className="flex-1 bg-surface relative">
          {start.photoUrl ? (
            <Image source={{ uri: start.photoUrl }} style={{ flex: 1 }} resizeMode="cover" />
          ) : null}
          <View className="absolute top-2.5 left-2.5 bg-black/55 rounded-md px-2 py-1">
            <Text className="text-text text-[10px] font-semibold">{fmtDate(start.date)}</Text>
          </View>
        </View>
        <View style={{ width: 1 }} className="bg-white/15" />
        <View className="flex-1 bg-surface relative">
          {end.photoUrl ? (
            <Image source={{ uri: end.photoUrl }} style={{ flex: 1 }} resizeMode="cover" />
          ) : null}
          <View className="absolute top-2.5 right-2.5 bg-accentSoft border border-accent rounded-md px-2 py-1">
            <Text className="text-text text-[10px] font-semibold">{fmtDate(end.date)}</Text>
          </View>
        </View>
      </View>

      {rows.length > 0 ? (
        <View className="mx-4 mb-3.5 bg-surface border border-border rounded-card p-4">
          <View className="flex-row items-center gap-2 mb-3">
            <Feather name="trending-up" size={15} color="#8CE05A" />
            <Text className="text-text text-sm font-semibold">Değişim Özeti</Text>
          </View>
          {rows.map((r, i) => (
            <View
              key={r.id}
              className={`flex-row items-center justify-between py-2 ${
                i < rows.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <Text className="text-textMuted text-xs">{r.name}</Text>
              <View className="flex-row items-center gap-2.5">
                <Text className="text-textMuted text-xs">{r.startVal ?? "—"}</Text>
                <Text className="text-text text-xs font-semibold">{r.endVal ?? "—"}</Text>
                {r.delta != null ? (
                  <Text
                    className={`text-[11px] font-semibold w-16 text-right ${
                      r.isGood ? "text-accent" : "text-danger"
                    }`}
                  >
                    {r.delta > 0 ? "↑" : r.delta < 0 ? "↓" : "•"} {Math.abs(r.delta)} {r.unit}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mx-4 bg-surface border border-border rounded-card p-4">
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-2">
            <Feather name="calendar" size={15} color="#8CE05A" />
            <Text className="text-text text-sm font-semibold">Zaman Aralığı</Text>
          </View>
          <Text className="text-accent text-sm font-bold">{daysBetween} gün</Text>
        </View>
        <View className="h-1 bg-white/10 rounded-full mb-2 mx-0.5">
          <View className="h-1 bg-accent rounded-full" style={{ width: "100%" }} />
        </View>
        <View className="flex-row justify-between">
          <Text className="text-textFaint text-[10px]">{fmtDate(start.date)}</Text>
          <Text className="text-textFaint text-[10px]">{fmtDate(end.date)}</Text>
        </View>
      </View>
    </View>
  );
}
