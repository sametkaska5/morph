import { View, Text, Image, Pressable, FlatList, Dimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { getPhotoUrls } from "@/lib/storage";

const { width } = Dimensions.get("window");
const GAP = 4;
const COLUMNS = 3;
const H_PADDING = 16;
const THUMB_W = (width - H_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const THUMB_H = THUMB_W * 1.5; // poster oranı (2:3)

type EntryRow = {
  id: string;
  date: string;
  note: string | null;
  cover_photo_url: string | null;
};

function useTimelineEntries() {
  return useQuery({
    queryKey: ["entries", "timeline"],
    staleTime: 1000 * 60 * 30, // imzalı linkler 6 saat geçerli, yarım saat cache yeterli
    queryFn: async (): Promise<EntryRow[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, note, photos!entry_id(storage_path)")
        .eq("type", "log")
        .order("date", { ascending: false })
        .limit(60);

      if (error) throw error;

      const paths = (data ?? [])
        .map((e: any) => e.photos?.[0]?.storage_path)
        .filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? []).map((e: any) => {
        const path = e.photos?.[0]?.storage_path;
        return {
          id: e.id,
          date: e.date,
          note: e.note,
          cover_photo_url: path ? urlMap.get(path) ?? null : null,
        };
      });
    },
  });
}

function PosterThumb({ entry }: { entry: EntryRow }) {
  return (
    <Pressable onPress={() => router.push(`/entry/${entry.id}`)} style={{ width: THUMB_W, marginBottom: 12 }}>
      <View style={{ width: THUMB_W, height: THUMB_H }} className="rounded-[4px] overflow-hidden bg-surface">
        {entry.cover_photo_url ? (
          <Image source={{ uri: entry.cover_photo_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : null}
      </View>
      <Text className="text-textFaint text-[9px] mt-1" numberOfLines={1}>
        {new Date(entry.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
      </Text>
    </Pressable>
  );
}

export default function AnaEkran() {
  const { data: entries, isLoading, error, refetch } = useTimelineEntries();

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row justify-between items-center px-4 pt-14 pb-3">
        <Text className="text-text text-[15px] font-semibold tracking-wide">remory</Text>
        <Pressable onPress={() => router.push("/compare/pick")}>
          <Feather name="repeat" size={19} color="#8B8A82" />
        </Pressable>
      </View>

      <Text className="text-textFaint text-xs font-semibold px-4 mb-2 uppercase tracking-wide">
        Son Kayıtlar
      </Text>

      {isLoading && <Text className="text-textMuted text-xs px-4">Yükleniyor...</Text>}
      {error && <Text className="text-danger text-xs px-4 mb-2">{(error as Error).message}</Text>}
      {entries?.length === 0 && (
        <Text className="text-textMuted text-xs px-4">
          Henüz bir kaydın yok. Alttaki + butonuyla ilk anını ekle.
        </Text>
      )}

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        showsVerticalScrollIndicator={false}
        onScrollEndDrag={() => refetch()}
        contentContainerStyle={{ paddingHorizontal: H_PADDING, paddingBottom: 24 }}
        columnWrapperStyle={{ gap: GAP }}
        renderItem={({ item }) => <PosterThumb entry={item} />}
      />
    </View>
  );
}
