import { memo, useCallback, useState } from "react";
import { View, FlatList, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { photoCacheKey } from "@/lib/storage";
import { formatDateKey } from "@/lib/date";
import { fetchComparisonBetween } from "@/lib/comparison";
import { usePickableEntries, type PickableEntry } from "@/lib/entries";
import { queryKeys } from "@/lib/queryKeys";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";

/**
 * Kare ölçüsü render sırasında pencereden hesaplanıyor — modül kapsamında
 * `Dimensions.get("window")` ile okunan değer JS yüklenirken donuyor ve
 * Android çoklu pencere kipinde ızgara eski genişliğe göre çiziliyordu.
 * (Aynı düzeltme (tabs)/index.tsx ızgarasında da var.)
 * 20 = yatay dolgu, 8 = sütun aralığı, 3 sütun.
 */
function useThumbSize() {
  const { width } = useWindowDimensions();
  return (width - 20 * 2 - 8 * 2) / 3;
}

// memo: seçim her değiştiğinde ekran state'i yenileniyor ve memo olmadan
// ızgaradaki 60 hücrenin hepsi (expo-image dahil) yeniden çiziliyordu.
// isSelected/order ilkel prop'lar olduğu için yalnızca seçimi değişen
// hücreler render olur.
const PickThumb = memo(function PickThumb({
  item,
  isSelected,
  order,
  onToggle,
  thumbSize,
}: {
  item: PickableEntry;
  isSelected: boolean;
  /** Seçiliyse 0 ya da 1 (rozetteki "1."/"2."), değilse -1. */
  order: number;
  onToggle: (id: string) => void;
  thumbSize: number;
}) {
  const dateLabel = formatDateKey(item.date, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <Pressable
      onPress={() => onToggle(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`${dateLabel} tarihli anı${isSelected ? `, ${order + 1}. seçim olarak işaretli` : ""}`}
      accessibilityState={{ selected: isSelected }}
      style={{ width: thumbSize, height: thumbSize }}
    >
      <View className="flex-1 rounded-lg overflow-hidden bg-surface relative">
        {item.photoUrl ? (
          <Image
            // cacheKey stabil path'e bağlı: imzalı URL token dönse de
            // disk cache path'e göre isabet eder, yeniden indirmez.
            source={{
              uri: item.photoUrl,
              cacheKey: item.photoPath ? photoCacheKey(item.photoPath, "thumb") : undefined,
            }}
            style={{ flex: 1 }}
            contentFit="cover"
            cachePolicy="memory-disk"
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
          <Text className="text-text text-xs">
            {formatDateKey(item.date, { day: "numeric", month: "short" })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

export default function PickComparison() {
  const thumbSize = useThumbSize();
  const screen = useScreenInsets();
  const { user } = useAuth();
  const { data: entries, isLoading, error, refetch } = usePickableEntries(user?.id);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);

  // Sabit referans: memo'lu PickThumb'a prop olarak iniyor — her render'da yeni
  // fonksiyon üretilseydi memo hiç işe yaramazdı. Fonksiyonel setState sayesinde
  // bağımlılığı yok.
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // en eski seçimi at, yenisini ekle
      return [...prev, id];
    });
  }, []);

  function handleContinue() {
    if (selected.length === 2) {
      const [a, b] = selected;
      // Karşılaştırma verisini navigasyondan ÖNCE çekmeye başla — geçiş animasyonu
      // sürerken sorgular/imzalama arka planda dönüyor, compare ekranı aynı
      // queryKey'e bağlandığı için açıldığında veri çoğunlukla hazır oluyor.
      queryClient.prefetchQuery({
        queryKey: queryKeys.comparison(a, b),
        queryFn: () => fetchComparisonBetween(a, b),
        staleTime: 1000 * 60 * 30,
      });
      router.replace({ pathname: "/compare", params: { a, b } });
    }
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: screen.top }}>
      <View className="flex-row items-center justify-between px-4 mb-1">
        <PressableFade
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          dim={0.7}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </PressableFade>
        <Text className="text-text text-xl font-bold">İki Fotoğraf Seç</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text className="text-textFaint text-sm text-center mb-4">
        Karşılaştırmak istediğin iki anı seç ({selected.length}/2)
      </Text>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-10" />
      ) : error ? (
        // Hatasız boş ızgara, "karşılaştıracak fotoğrafım yok" gibi okunuyordu.
        <View className="mt-6">
          <ErrorState error={error} onRetry={() => refetch()} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <PickThumb
              item={item}
              isSelected={selected.includes(item.id)}
              order={selected.indexOf(item.id)}
              onToggle={toggle}
              thumbSize={thumbSize}
            />
          )}
        />
      )}

      <View className="px-4 pt-3" style={{ paddingBottom: screen.insets.bottom + 24 }}>
        {/* Düğme neden kapalı, görselde yalnızca soluk renkten anlaşılıyordu.
            İpucu kaç fotoğraf gerektiğini söylüyor. */}
        <Pressable
          onPress={handleContinue}
          disabled={selected.length !== 2}
          accessibilityRole="button"
          accessibilityState={{ disabled: selected.length !== 2 }}
          accessibilityHint={
            selected.length === 2 ? undefined : "Karşılaştırmak için iki fotoğraf seçmelisin"
          }
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
