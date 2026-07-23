import { useState } from "react";
import { View, FlatList, Dimensions, Pressable, ActivityIndicator } from "react-native";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { getPhotoUrls } from "@/lib/storage";
import { useAuth } from "@/lib/useAuth";
import { useUnitPreference, displayUnit, toDisplayValue, type UnitPref } from "@/lib/units";
import { openCapturePicker } from "@/lib/capture";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const PAGE_SIZE = 20;
// (tabs)/_layout.tsx'teki tabBarStyle.height ile eşleşmeli — FlatList'in gerçek
// görünür alanı SCREEN_HEIGHT değil, tab bar'ın kapladığı kadar eksiği; sayfa
// yüksekliği (pageHeight) bunu hesaba katmazsa pagingEnabled snap noktaları
// gerçek viewport ile uyuşmayıp kaydırmada bir seferde 2-3 sayfa atlıyordu.
const TAB_BAR_HEIGHT = 84;

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
  pageHeight,
}: {
  entry: CapsuleEntry;
  index: number;
  total: number;
  unitPref: UnitPref;
  pageHeight: number;
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
      accessibilityRole="button"
      accessibilityLabel={`${formattedDate} tarihli anı, ${flipped ? "fotoğrafı göstermek için dokun" : "değerleri görmek için dokun"}`}
      style={{ height: pageHeight, width: "100%" }}
      className="bg-surface"
    >
      {/* ÖN YÜZ — fotoğraf */}
      <Animated.View
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: "hidden" }, frontStyle]}
      >
        {entry.photoUrl ? (
          <Image
            // cacheKey'i değişmeyen storage yoluna sabitliyoruz: imzalı URL her
            // yeniden fetch'te farklı token'la üretildiğinden (staleTime dolunca ya
            // da kayıt ekleme/düzenleme/silme ["entries"]'i invalidate ettiğinde),
            // URL'ye göre anahtarlanan disk cache aynı fotoğrafı her seferinde
            // yeniden indiriyordu. cacheKey path'e bağlanınca token dönse de cache
            // isabet ediyor ve tekrar indirme olmuyor.
            source={{ uri: entry.photoUrl, cacheKey: entry.photoPath ?? undefined }}
            style={{ flex: 1 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={entry.photoPath ?? undefined}
            transition={150}
          />
        ) : (
          <View className="flex-1 bg-surface" />
        )}
        <View className="absolute inset-0 bg-black/10" pointerEvents="none" />
        {/* Alt yazı bloğunun arkasına ayrı bir koyu gölge: textFaint rengi koyu arkaplan
            için tasarlandığından, fotoğrafın kendisi açık renkliyse metin neredeyse
            görünmez oluyordu. */}
        <View className="absolute bottom-0 left-0 right-0 h-40 bg-black/45" pointerEvents="none" />

        <View className="absolute bottom-24 left-4 right-4">
          <Text className="text-text text-base font-semibold">{formattedDate}</Text>
          <Text className="text-text/70 text-xs mt-1">Değerleri görmek için dokun</Text>
        </View>
      </Animated.View>

      {/* ARKA YÜZ — o güne ait ölçümler + not */}
      <Animated.View
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: "hidden" }, backStyle]}
        className="bg-bg px-5"
      >
        <View className="flex-1 justify-center">
          <Text className="text-text text-xl font-bold mb-4">{formattedDate}</Text>

          {(entry.measurements ?? []).length > 0 ? (
            <View className="bg-surface border border-border rounded-card p-4 mb-4">
              {entry.measurements.map((m, i) => (
                <View
                  key={m.name + i}
                  className={`flex-row items-center py-2 ${
                    i < entry.measurements.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <Text className="text-textMuted text-sm capitalize flex-1">{m.name}</Text>
                  <Text className="text-text text-sm font-semibold w-24 text-center">
                    {toDisplayValue(m.value, m.unit, unitPref)} {displayUnit(m.unit, unitPref)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-textMuted text-sm mb-4">Bu gün için ölçüm girilmemiş.</Text>
          )}

          {entry.note ? (
            <View className="bg-surface border border-border rounded-card p-4">
              <Text className="text-textFaint text-xs font-semibold mb-1.5 tracking-wide">NOT</Text>
              <Text className="text-text text-base leading-6">{entry.note}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            router.push(`/entry/${entry.id}`);
          }}
          accessibilityRole="button"
          accessibilityLabel="Anı detayını aç"
          style={{
            position: "absolute",
            bottom: 24,
            right: 20,
          }}
          className="w-14 h-14 rounded-full bg-surface border border-border items-center justify-center"
        >
          <Feather name="maximize-2" size={24} color="#8CE05A" />
        </Pressable>
      </Animated.View>

      <View className="absolute top-14 left-0 right-0 flex-row justify-between items-center px-4">
        <Text className="text-text text-xl font-semibold">Anı Akışı</Text>
        <View className="bg-black/50 rounded-pill px-3 py-1">
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
  const insets = useSafeAreaInsets();
  // Tab bar'ın gerçekte kapladığı alan platforma göre birkaç piksel oynayabiliyor;
  // sabit bir tahminle hesaplanan sayfa yüksekliği viewport'tan az da olsa
  // sapınca alttaki fotoğraf üsttekinin altından görünür oluyordu. Bunun yerine
  // FlatList'in sarmalayıcısının gerçek render yüksekliğini ölçüyoruz.
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const pageHeight = measuredHeight || SCREEN_HEIGHT - TAB_BAR_HEIGHT - insets.bottom;
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useCapsuleEntries();
  const entries = data?.pages.flat();

  if (isLoading) {
    return <View className="flex-1 bg-bg" onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)} />;
  }

  if (error) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-danger text-base text-center">{(error as Error).message}</Text>
      </View>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-8">
        <View className="w-16 h-16 rounded-full bg-accentSoft border border-accent items-center justify-center mb-4">
          <Feather name="calendar" size={26} color="#8CE05A" />
        </View>
        <Text className="text-text text-xl font-semibold mb-2 text-center">Henüz bir kaydın yok</Text>
        <Text className="text-textMuted text-base text-center leading-6 mb-5 max-w-[260px]">
          İlk anını ekledikçe burada zaman içinde kayıp gidebileceksin.
        </Text>
        <Pressable
          onPress={openCapturePicker}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          className="bg-accent rounded-button px-5 py-4 flex-row items-center gap-2"
        >
          <Feather name="plus" size={18} color="#0B0D0A" />
          <Text className="text-bg text-base font-semibold">İlk anını ekle</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg" onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        renderItem={({ item, index }) => (
          <CapsulePage entry={item} index={index} total={entries.length} unitPref={unitPref} pageHeight={pageHeight} />
        )}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ height: pageHeight, alignItems: "center", justifyContent: "center" }} className="bg-bg">
              <ActivityIndicator color="#8CE05A" />
            </View>
          ) : null
        }
      />
    </View>
  );
}
