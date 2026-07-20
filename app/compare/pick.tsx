import { useState } from "react";
import { View, FlatList, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { getPhotoUrls } from "@/lib/storage";

const { width } = Dimensions.get("window");
const THUMB_SIZE = (width - 20 * 2 - 8 * 2) / 3;

function usePickableEntries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["entries", "pickable", user?.id],
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, photos!cover_photo_id(storage_path)")
        .eq("user_id", user!.id)
        .eq("type", "log")
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;

      const paths = (data ?? []).map((e: any) => e.photos?.storage_path).filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? []).map((e: any) => ({
        id: e.id,
        date: e.date,
        photoUrl: e.photos?.storage_path ? urlMap.get(e.photos.storage_path) ?? null : null,
        photoPath: e.photos?.storage_path ?? null,
      }));
    },
  });
}

export default function PickComparison() {
  const { data: entries, isLoading } = usePickableEntries();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // en eski seçimi at, yenisini ekle
      return [...prev, id];
    });
  }

  function handleContinue() {
    if (selected.length === 2) {
      router.replace({ pathname: "/compare", params: { a: selected[0], b: selected[1] } });
    }
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: 56 }}>
      <View className="flex-row items-center justify-between px-4 mb-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">İki Fotoğraf Seç</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text className="text-textFaint text-sm text-center mb-4">
        Karşılaştırmak istediğin iki anı seç ({selected.length}/2)
      </Text>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-10" />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.id);
            const order = selected.indexOf(item.id);
            const dateLabel = new Date(item.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${dateLabel} tarihli anı${isSelected ? `, ${order + 1}. seçim olarak işaretli` : ""}`}
                accessibilityState={{ selected: isSelected }}
                style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
              >
                <View className="flex-1 rounded-lg overflow-hidden bg-surface relative">
                  {item.photoUrl ? (
                    <Image
                      source={{ uri: item.photoUrl }}
                      style={{ flex: 1 }}
                      contentFit="cover"
                      cachePolicy="disk"
                      recyclingKey={item.photoPath ?? undefined}
                    />
                  ) : null}
                  {isSelected ? (
                    <View className="absolute inset-0 bg-black/30 border-2 border-accent rounded-lg items-center justify-center">
                      <View className="w-6 h-6 rounded-full bg-accent items-center justify-center">
                        <Text className="text-bg text-xs font-bold">{order + 1}</Text>
                      </View>
                    </View>
                  ) : null}
                  <View className="absolute bottom-1 left-1 bg-black/75 rounded px-1.5 py-0.5">
                    <Text className="text-text text-[10px]">
                      {new Date(item.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View className="px-4 pb-6 pt-3">
        <Pressable
          onPress={handleContinue}
          disabled={selected.length !== 2}
          style={({ pressed }) => ({ opacity: pressed && selected.length === 2 ? 0.85 : 1 })}
          className={`rounded-button py-4 items-center ${selected.length === 2 ? "bg-accent" : "bg-surface"}`}
        >
          <Text className={`text-base font-semibold ${selected.length === 2 ? "text-bg" : "text-textFaint"}`}>
            Karşılaştır
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
