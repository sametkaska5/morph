import { View, Text, ScrollView, ImageBackground, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl } from "@/lib/storage";

type EntryRow = {
  id: string;
  date: string;
  note: string | null;
  cover_photo_url: string | null;
};

function useTimelineEntries() {
  return useQuery({
    queryKey: ["entries", "timeline"],
    queryFn: async (): Promise<EntryRow[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, note, photos!entry_id(storage_path)")
        .eq("type", "log")
        .order("date", { ascending: false })
        .limit(20);

      if (error) throw error;

      return Promise.all(
        (data ?? []).map(async (e: any) => {
          const path = e.photos?.[0]?.storage_path;
          return {
            id: e.id,
            date: e.date,
            note: e.note,
            cover_photo_url: path ? await getPhotoUrl(path) : null,
          };
        })
      );
    },
  });
}

function EntryRowCard({ entry }: { entry: EntryRow }) {
  return (
    <ImageBackground
      source={entry.cover_photo_url ? { uri: entry.cover_photo_url } : undefined}
      className="rounded-card overflow-hidden h-[120px] bg-surface mb-2.5"
      imageStyle={{ borderRadius: 16 }}
    >
      <View className="absolute inset-0 bg-black/35 rounded-card" />
      <View className="absolute bottom-2.5 left-3.5">
        <Text className="text-text text-sm font-semibold">
          {new Date(entry.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}
        </Text>
        {entry.note ? (
          <Text className="text-textMuted text-xs mt-0.5" numberOfLines={1}>
            {entry.note}
          </Text>
        ) : null}
      </View>
    </ImageBackground>
  );
}

export default function AnaEkran() {
  const { data: entries, isLoading, error, refetch } = useTimelineEntries();

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row justify-between items-center px-4 pt-14 pb-3">
        <Text className="text-text text-[15px] font-semibold tracking-wide">remory</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} onScrollEndDrag={() => refetch()}>
        <Text className="text-textFaint text-xs font-semibold px-4 mb-2 uppercase tracking-wide">
          Son Kayıtlar
        </Text>

        <View className="px-4">
          {isLoading && <Text className="text-textMuted text-xs">Yükleniyor...</Text>}
          {error && <Text className="text-danger text-xs mb-2">{(error as Error).message}</Text>}
          {entries?.length === 0 && (
            <Text className="text-textMuted text-xs">
              Henüz bir kaydın yok. Alttaki + butonuyla ilk anını ekle.
            </Text>
          )}
          {entries?.map((entry) => (
            <Pressable key={entry.id} onPress={() => router.push(`/entry/${entry.id}`)}>
              <EntryRowCard entry={entry} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
