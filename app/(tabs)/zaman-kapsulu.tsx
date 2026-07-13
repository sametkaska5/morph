import { useState } from "react";
import { View, Text, FlatList, Dimensions, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { getPhotoUrls } from "@/lib/storage";
import { useAuth } from "@/lib/useAuth";
import { useUnitPreference, displayUnit, toDisplayValue, type UnitPref } from "@/lib/units";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const PAGE_SIZE = 20;

type MeasurementEntry = { name: string; unit: string; value: number };

type CapsuleEntry = {
  id: string;
  date: string;
  note: string | null;
  photoUrl: string | null;
  photoPath: string | null; // sabit cache anahtarı
  measurements: MeasurementEntry[];
};

function useCapsuleEntries() {
  return useInfiniteQuery({
    queryKey: ["entries", "capsule"],
    staleTime: 1000 * 60 * 30,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CapsuleEntry[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, photos!cover_photo_id(storage_path), measurement_values(value, measurement_types(name, unit))"
        )
        .eq("type", "log")
        .order("date", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (error) throw error;

      const paths = (data ?? []).map((e: any) => e.photos?.storage_path).filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? []).map((e: any) => ({
        id: e.id,
        date: e.date,
        note: e.note,
        photoUrl: e.photos?.storage_path ? urlMap.get(e.photos.storage_path) ?? null : null,
        photoPath: e.photos?.storage_path ?? null,
        measurements: (e.measurement_values ?? [])
          .filter((mv: any) => mv.measurement_types)
          .map((mv: any) => ({
            name: mv.measurement_types.name,
            unit: mv.measurement_types.unit,
            value: mv.value,
          })),
      }));
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
  });
}

function CapsulePage({
  entry,
  index,
  total,
  unitPref,
}: {
  entry: CapsuleEntry;
  index: number;
  total: number;
  unitPref: UnitPref;
}) {
  const [flipped, setFlipped] = useState(false);
  const flip = useSharedValue(0);

  function toggleFlip() {
    const next = !flipped;
    setFlipped(next);
    flip.value = withTiming(next ? 1 : 0, { duration: 450 });
  }

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180}deg` }],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180 - 180}deg` }],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));

  const formattedDate = new Date(entry.date).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Pressable
      onPress={toggleFlip}
      style={{ height: SCREEN_HEIGHT, width: "100%" }}
      className="bg-surface"
    >
      {/* ÖN YÜZ — fotoğraf */}
      <Animated.View
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: "hidden" }, frontStyle]}
      >
        {entry.photoUrl ? (
          <Image
            source={{ uri: entry.photoUrl }}
            style={{ flex: 1 }}
            contentFit="cover"
            cachePolicy="disk"
            recyclingKey={entry.photoPath ?? undefined}
            transition={150}
          />
        ) : (
          <View className="flex-1 bg-surface" />
        )}
        <View className="absolute inset-0 bg-black/10" pointerEvents="none" />

        <View className="absolute bottom-24 left-4 right-4">
          <Text className="text-text text-base font-semibold">{formattedDate}</Text>
          <Text className="text-textFaint text-[11px] mt-1">Değerleri görmek için dokun</Text>
        </View>
      </Animated.View>

      {/* ARKA YÜZ — o güne ait ölçümler + not */}
      <Animated.View
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: "hidden" }, backStyle]}
        className="bg-bg px-5"
      >
        <View className="flex-1 justify-center">
          <Text className="text-text text-lg font-bold mb-4">{formattedDate}</Text>

          {(entry.measurements ?? []).length > 0 ? (
            <View className="bg-surface border border-border rounded-card p-4 mb-4">
              {entry.measurements.map((m, i) => (
                <View
                  key={m.name + i}
                  className={`flex-row items-center justify-between py-2 ${
                    i < entry.measurements.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <Text className="text-textMuted text-sm">{m.name}</Text>
                  <Text className="text-text text-sm font-semibold">
                    {toDisplayValue(m.value, m.unit, unitPref)} {displayUnit(m.unit, unitPref)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-textMuted text-xs mb-4">Bu gün için ölçüm girilmemiş.</Text>
          )}

          {entry.note ? (
            <View className="bg-surface border border-border rounded-card p-4">
              <Text className="text-textFaint text-[11px] font-semibold mb-1.5 tracking-wide">NOT</Text>
              <Text className="text-text text-sm leading-5">{entry.note}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            router.push(`/entry/${entry.id}`);
          }}
          className="absolute bottom-10 right-5 w-11 h-11 rounded-full bg-surface border border-border items-center justify-center"
        >
          <Feather name="maximize-2" size={16} color="#8CE05A" />
        </Pressable>
      </Animated.View>

      <View className="absolute top-14 left-0 right-0 flex-row justify-between items-center px-4">
        <Text className="text-text text-base font-semibold">Zaman Kapsülü</Text>
        <View className="bg-black/50 rounded-pill px-2.5 py-1">
          <Text className="text-text text-xs font-medium">
            {index + 1}/{total}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ZamanKapsulu() {
  const { user } = useAuth();
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useCapsuleEntries();
  const entries = data?.pages.flat();

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
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index })}
        renderItem={({ item, index }) => (
          <CapsulePage entry={item} index={index} total={entries.length} unitPref={unitPref} />
        )}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ height: SCREEN_HEIGHT, alignItems: "center", justifyContent: "center" }} className="bg-bg">
              <ActivityIndicator color="#8CE05A" />
            </View>
          ) : null
        }
      />
    </View>
  );
}
