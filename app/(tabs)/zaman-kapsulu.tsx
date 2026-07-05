import { View, Text, Image, FlatList, Dimensions, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl } from "@/lib/storage";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type CapsuleEntry = {
  id: string;
  date: string;
  note: string | null;
  photoUrl: string | null;
};

function useCapsuleEntries() {
  return useQuery({
    queryKey: ["entries", "capsule"],
    queryFn: async (): Promise<CapsuleEntry[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, note, photos!cover_photo_id(storage_path)")
        .eq("type", "log")
        .order("date", { ascending: false });

      if (error) throw error;

      return Promise.all(
        (data ?? []).map(async (e: any) => ({
          id: e.id,
          date: e.date,
          note: e.note,
          photoUrl: e.photos?.storage_path ? await getPhotoUrl(e.photos.storage_path) : null,
        }))
      );
    },
  });
}

function CapsulePage({ entry, index, total }: { entry: CapsuleEntry; index: number; total: number }) {
  return (
    <Pressable
      onPress={() => router.push(`/entry/${entry.id}`)}
      style={{ height: SCREEN_HEIGHT, width: "100%" }}
      className="bg-surface"
    >
      {entry.photoUrl ? (
        <Image source={{ uri: entry.photoUrl }} style={{ flex: 1 }} resizeMode="cover" />
      ) : (
        <View className="flex-1 bg-surface" />
      )}
      <View className="absolute inset-0 bg-black/10" pointerEvents="none" />

      <View className="absolute top-14 left-0 right-0 flex-row justify-between items-center px-4">
        <Text className="text-text text-base font-semibold">Zaman Kapsülü</Text>
        <View className="bg-black/50 rounded-pill px-2.5 py-1">
          <Text className="text-text text-xs font-medium">
            {index + 1}/{total}
          </Text>
        </View>
      </View>

      <View className="absolute bottom-24 left-4 right-4">
        <Text className="text-text text-base font-semibold">
          {new Date(entry.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </Text>
        {entry.note ? (
          <Text className="text-textMuted text-xs mt-1" numberOfLines={2}>
            {entry.note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ZamanKapsulu() {
  const { data: entries, isLoading, error } = useCapsuleEntries();

  if (isLoading) {
    return <View className="flex-1 bg-bg" />;
  }

  if (error) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-danger text-xs text-center">{(error as Error).message}</Text>
      </View>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-textMuted text-sm text-center">
          Henüz bir kaydın yok. İlk anını ekledikçe burada zaman içinde kayıp gidebileceksin.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        renderItem={({ item, index }) => (
          <CapsulePage entry={item} index={index} total={entries.length} />
        )}
      />
    </View>
  );
}
