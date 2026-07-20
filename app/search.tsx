import { useMemo, useState } from "react";
import { View, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Text, TextInput } from "@/components/Typography";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { getPhotoUrls, coverPhotoPath } from "@/lib/storage";

type SearchEntry = {
  id: string;
  date: string;
  note: string | null;
  photoUrl: string | null;
  photoPath: string | null;
};

function useSearchIndex(userId: string | undefined) {
  return useQuery({
    queryKey: ["entries", "search-index", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<SearchEntry[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, note, cover_photo_id, photos!entry_id(id, storage_path)")
        .eq("user_id", userId!)
        .eq("type", "log")
        .order("date", { ascending: false });

      if (error) throw error;

      const paths = (data ?? []).map(coverPhotoPath).filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? []).map((e: any) => {
        const path = coverPhotoPath(e);
        return { id: e.id, date: e.date, note: e.note, photoUrl: path ? urlMap.get(path) ?? null : null, photoPath: path ?? null };
      });
    },
  });
}

function ResultRow({ entry }: { entry: SearchEntry }) {
  const dateLabel = new Date(entry.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Pressable
      onPress={() => router.push(`/entry/${entry.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${dateLabel} tarihli anı${entry.note ? `, not: ${entry.note}` : ""}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      className="flex-row items-center gap-3 px-4 py-3 border-b border-border"
    >
      <View className="w-12 h-12 rounded-[8px] overflow-hidden bg-surface border border-border">
        {entry.photoUrl ? (
          <Image source={{ uri: entry.photoUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" recyclingKey={entry.photoPath ?? undefined} />
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
      <Feather name="chevron-right" size={15} color="#5C5A50" />
    </Pressable>
  );
}

export default function SearchScreen() {
  const { user } = useAuth();
  const { data: entries, isLoading } = useSearchIndex(user?.id);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q || !entries) return [];
    return entries.filter((e) => {
      const dateLabel = new Date(e.date)
        .toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
        .toLocaleLowerCase("tr-TR");
      const note = (e.note ?? "").toLocaleLowerCase("tr-TR");
      return dateLabel.includes(q) || note.includes(q);
    });
  }, [query, entries]);

  return (
    <View className="flex-1 bg-bg pt-14 px-4">
      <View className="flex-row items-center gap-3 mb-4">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">Anılarında ara</Text>
      </View>

      <View className="flex-row items-center gap-2 bg-surface border border-border rounded-button px-4 mb-4" style={{ height: 52 }}>
        <Feather name="search" size={17} color="#5C5A50" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Tarih veya not ara (ör. temmuz, tatil)"
          placeholderTextColor="#5C5A50"
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
            <Feather name="x" size={17} color="#5C5A50" />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-4" />
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
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}
