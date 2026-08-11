import { memo, useMemo, useState } from "react";
import { View, Pressable, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text, TextInput } from "@/components/Typography";
import { Image } from "expo-image";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { photoCacheKey } from "@/lib/storage";
import { formatDateKey } from "@/lib/date";
import { useSearchIndex, type SearchEntry } from "@/lib/entries";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";

// memo: her tuş vuruşu sonuç listesini yeniden filtreliyor ama satır objeleri
// aynı kalıyor — memo olmadan görünür tüm satırlar (expo-image dahil) her
// harfte yeniden çiziliyordu.
const ResultRow = memo(function ResultRow({ entry }: { entry: SearchEntry }) {
  const dateLabel = formatDateKey(entry.date, { day: "numeric", month: "long", year: "numeric" });

  return (
    <PressableFade
      onPress={() => router.push(`/entry/${entry.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${dateLabel} tarihli anı${entry.note ? `, not: ${entry.note}` : ""}`}
      dim={0.7}
      className="flex-row items-center gap-3 px-4 py-3 border-b border-border"
    >
      <View className="w-12 h-12 rounded-[8px] overflow-hidden bg-surface border border-border">
        {entry.photoUrl ? (
          <Image source={{ uri: entry.photoUrl, cacheKey: entry.photoPath ? photoCacheKey(entry.photoPath, "thumb") : undefined }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={entry.photoPath ?? undefined} />
        ) : null}
      </View>
      <View className="flex-1">
        <Text className="text-text text-base font-semibold">{dateLabel}</Text>
        {entry.note ? (
          <Text className="text-textMuted text-sm mt-0.5" numberOfLines={1}>
            {entry.note}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={15} color="#8B8A82" />
    </PressableFade>
  );
});

export default function SearchScreen() {
  const screen = useScreenInsets();
  const { user } = useAuth();
  const { data: entries, isLoading, isRefetching, error, refetch } = useSearchIndex(user?.id);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q || !entries) return [];
    return entries.filter((e) => {
      const dateLabel = formatDateKey(e.date, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).toLocaleLowerCase("tr-TR");
      const note = (e.note ?? "").toLocaleLowerCase("tr-TR");
      return dateLabel.includes(q) || note.includes(q);
    });
  }, [query, entries]);

  return (
    <View className="flex-1 bg-bg px-4" style={{ paddingTop: screen.top }}>
      <View className="flex-row items-center gap-3 mb-4">
        <PressableFade
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          dim={0.7}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </PressableFade>
        <Text className="text-text text-xl font-bold">Anılarında ara</Text>
      </View>

      <View className="flex-row items-center gap-2 bg-surface border border-border rounded-button px-4 mb-4" style={{ height: 52 }}>
        <Feather name="search" size={17} color="#8B8A82" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Tarih veya not ara (ör. temmuz, tatil)"
          placeholderTextColor="#8B8A82"
          autoFocus
          accessibilityLabel="Arama kutusu"
          className="flex-1 text-text text-base"
          style={{ textAlignVertical: "center" }}
        />
        {query ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Aramayı temizle"
          >
            <Feather name="x" size={17} color="#8B8A82" />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-4" />
      ) : error ? (
        // Arama dizini çekilemediyse her sorgu "sonuç yok" derdi — kullanıcı
        // aradığı anının silindiğini sanırdı.
        <View className="mt-6">
          <ErrorState error={error} onRetry={() => refetch()} />
        </View>
      ) : !query.trim() ? (
        <Text className="text-textMuted text-base text-center mt-10 px-6">
          Bir tarih (ör. "mart 2026") ya da notlarında geçen bir kelime yazarak anılarında arama yapabilirsin.
        </Text>
      ) : results.length === 0 ? (
        <Text className="text-textMuted text-base text-center mt-10 px-6">Eşleşen bir anı bulunamadı.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ResultRow entry={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: screen.bottom }}
          // Arama dizini 30 dakika taze sayılıyor: az önce eklenen bir anıyı
          // aramada bulamayan kullanıcının elinde onu tazeleyecek bir yol yoktu.
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor="#8CE05A"
              colors={["#8CE05A"]}
            />
          }
        />
      )}
    </View>
  );
}
