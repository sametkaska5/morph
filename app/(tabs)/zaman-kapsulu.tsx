import { theme } from "@/lib/theme";
import { memo, useState } from "react";
import {
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { router } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { photoCacheKey } from "@/lib/storage";
import { formatDateKey } from "@/lib/date";
import { useAuth } from "@/lib/useAuth";
import { useUnitPreference, displayUnit, toDisplayValue, type UnitPref } from "@/lib/units";
import { openCapturePicker } from "@/lib/capture";
import { useCapsuleEntries, usePrefetchEditableEntry, type CapsuleEntry } from "@/lib/entries";
import { usePrefetchMeasurementTypes } from "@/lib/measurementTypes";
import { hapticLight } from "@/lib/haptics";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";

// (tabs)/_layout.tsx'teki TAB_CONTENT_HEIGHT ile eşleşmeli — FlatList'in gerçek
// görünür alanı SCREEN_HEIGHT değil, tab bar'ın kapladığı kadar eksiği; sayfa
// yüksekliği (pageHeight) bunu hesaba katmazsa pagingEnabled snap noktaları
// gerçek viewport ile uyuşmayıp kaydırmada bir seferde 2-3 sayfa atlıyordu.
// Yalnızca YEDEK değer: asıl yükseklik sarmalayıcının gerçek ölçümünden geliyor
// (measuredHeight), o yüzden buradaki sapma ilk kareden sonra düzeliyor.
const TAB_BAR_HEIGHT = 68;

// memo: sayfalama yeni sayfa eklediğinde ya da layout ölçümü değiştiğinde
// liste yeniden render oluyor — memo sayesinde prop'ları değişmeyen monte
// sayfalar (tam boy fotoğraf + flip animasyonu) baştan çizilmiyor.
const CapsulePage = memo(function CapsulePage({
  entry,
  index,
  total,
  unitPref,
  pageHeight,
  userId,
}: {
  entry: CapsuleEntry;
  index: number;
  total: number;
  unitPref: UnitPref;
  pageHeight: number;
  userId: string | undefined;
}) {
  const screen = useScreenInsets();
  const [flipped, setFlipped] = useState(false);
  const flip = useSharedValue(0);
  const prefetchEdit = usePrefetchEditableEntry();
  const prefetchTypes = usePrefetchMeasurementTypes(userId);

  function toggleFlip() {
    const next = !flipped;
    // Düzenle düğmesi yalnızca arka yüzde. Kartı çevirmek, o düğmeye basılma
    // ihtimalinin başladığı an — düzenleme ekranının BEKLEDİĞİ İKİ SORGUYU da
    // şimdiden başlatıyoruz ki çevirme animasyonu (450 ms) ve kullanıcının
    // düğmeyi bulup dokunması sırasında tamamlansınlar, ekran açıldığında form
    // ilk karede dolu gelsin. İkisi ayrı sorgu, yani paralel gidiyorlar.
    if (next) {
      prefetchEdit(entry.id);
      prefetchTypes();
    }
    // Doğrudan manipülasyon jesti: kart parmağın altında dönüyor, hafif bir
    // fiziksel karşılık hareketi gerçek hissettiriyor. Her iki yönde de var,
    // çünkü geri çevirmek de aynı jest.
    hapticLight();
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

  const formattedDate = formatDateKey(entry.date, {
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
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backfaceVisibility: "hidden",
          },
          frontStyle,
        ]}
      >
        {entry.photoUrl ? (
          <Image
            // cacheKey'i değişmeyen storage yoluna sabitliyoruz: imzalı URL her
            // yeniden fetch'te farklı token'la üretildiğinden (staleTime dolunca ya
            // da kayıt ekleme/düzenleme/silme ["entries"]'i invalidate ettiğinde),
            // URL'ye göre anahtarlanan disk cache aynı fotoğrafı her seferinde
            // yeniden indiriyordu. cacheKey path'e bağlanınca token dönse de cache
            // isabet ediyor ve tekrar indirme olmuyor.
            source={{
              uri: entry.photoUrl,
              cacheKey: entry.photoPath ? photoCacheKey(entry.photoPath, "full") : undefined,
            }}
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
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backfaceVisibility: "hidden",
          },
          backStyle,
        ]}
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
              <Text className="text-textFaint text-sm font-semibold mb-1.5 tracking-wide">NOT</Text>
              <Text className="text-text text-base leading-6">{entry.note}</Text>
            </View>
          ) : null}

          {/* Antrenman programı özeti — yalnızca o güne program eklenmişse. Karta
              basınca full set-logger ekranı açılır (o tarih ön-dolu). stopPropagation:
              yoksa dokunuş kartı geri çevirirdi (sayfa Pressable'ı toggleFlip). */}
          {/* program alanı, bu özellikten ÖNCE persist edilmiş (AsyncStorage) cache
              kayıtlarında bulunmayabilir — undefined'a karşı savunmalı okuyoruz. */}
          {(entry.program ?? []).length > 0 ? (
            <PressableFade
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/entry/program?date=${entry.date}`);
              }}
              accessibilityRole="button"
              accessibilityLabel="Antrenman programını aç"
              dim={0.85}
              className="bg-surface border border-border rounded-card p-4 mt-4"
            >
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-textFaint text-sm font-semibold tracking-wide">
                  ANTRENMAN PROGRAMI
                </Text>
                <Feather name="chevron-right" size={16} color={theme.colors.textFaint} />
              </View>
              {(entry.program ?? []).slice(0, 4).map((p, i) => (
                <View key={p.name + i} className="flex-row items-center justify-between py-1">
                  <Text className="text-text text-base capitalize flex-1" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="text-textMuted text-sm ml-3">{p.setCount} set</Text>
                </View>
              ))}
              {(entry.program ?? []).length > 4 ? (
                <Text className="text-textFaint text-sm mt-1">
                  +{(entry.program ?? []).length - 4} hareket daha
                </Text>
              ) : null}
            </PressableFade>
          ) : null}
        </View>

        {/* Köşedeki buton: anıyı düzenle (fotoğraf/ölçüm/not). Antrenman programı
            artık yukarıda, arka yüzde inline gösteriliyor — bu buton anının kendi
            düzenlemesine ayrıldı.

            NOT: konum düz bir style objesiyle veriliyor, fonksiyon-biçimli
            style ile DEĞİL. Daha önce bu butonun tam olarak burada yanlış
            konumlandığı bir hata yaşandı; o yüzden bu hâli koruyoruz. */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            router.push(`/entry/edit/${entry.id}`);
          }}
          accessibilityRole="button"
          accessibilityLabel="Anıyı düzenle"
          style={{
            position: "absolute",
            bottom: 24,
            right: 20,
          }}
          className="w-14 h-14 rounded-full bg-surface border border-border items-center justify-center"
        >
          <Feather name="edit-2" size={24} color={theme.colors.accent} />
        </Pressable>
      </Animated.View>

      {/* Sayfa tam ekran, yani durum çubuğunun ARKASINA çiziyor (edge-to-edge):
          başlık şeridi güvenli alandan konumlanmalı, sabit 56px'ten değil. */}
      <View
        style={{ top: screen.top }}
        className="absolute left-0 right-0 flex-row justify-between items-center px-4"
      >
        <Text className="text-text text-xl font-semibold">Podyum</Text>
        <View className="bg-black/50 rounded-pill px-3 py-1">
          <Text className="text-text text-xs font-medium">
            {index + 1}/{total}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

export default function ZamanKapsulu() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Tab bar'ın gerçekte kapladığı alan platforma göre birkaç piksel oynayabiliyor;
  // sabit bir tahminle hesaplanan sayfa yüksekliği viewport'tan az da olsa
  // sapınca alttaki fotoğraf üsttekinin altından görünür oluyordu. Bunun yerine
  // FlatList'in sarmalayıcısının gerçek render yüksekliğini ölçüyoruz.
  const [measuredHeight, setMeasuredHeight] = useState(0);
  // Yedek yükseklik pencereden okunuyor (modül kapsamındaki Dimensions yerine):
  // o değer JS yüklenirken donuyor ve Android çoklu pencere kipinde yanlış
  // kalıyordu. Asıl yükseklik zaten ölçümden geliyor, bu yalnızca ilk kare.
  const { height: windowHeight } = useWindowDimensions();
  const pageHeight = measuredHeight || windowHeight - TAB_BAR_HEIGHT - insets.bottom;
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCapsuleEntries();
  const entries = data?.pages.flat();

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-bg"
        onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}
      />
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ErrorState error={error} onRetry={() => refetch()} />
      </View>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-8">
        <View className="w-16 h-16 rounded-full bg-accentSoft border border-accent items-center justify-center mb-4">
          <Feather name="calendar" size={26} color={theme.colors.accent} />
        </View>
        <Text className="text-text text-xl font-semibold mb-2 text-center">
          Henüz bir kaydın yok
        </Text>
        <Text className="text-textMuted text-base text-center leading-6 mb-5 max-w-[260px]">
          İlk anını ekledikçe burada zaman içinde kayıp gidebileceksin.
        </Text>
        <PressableFade
          onPress={openCapturePicker}
          accessibilityRole="button"
          dim={0.85}
          className="bg-accent rounded-button px-5 py-4 flex-row items-center gap-2"
        >
          <Feather name="plus" size={18} color={theme.colors.bg} />
          <Text className="text-bg text-base font-semibold">İlk anını ekle</Text>
        </PressableFade>
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
        // Aşağı çekip yenile: akış dikey sayfalayıcı olduğu için kullanıcı
        // zaten kaydırma jestinde — ilk sayfadayken yukarı çekmek her yerde
        // "yenile" anlamına geliyor ve burada karşılığı yoktu. Ana ekran ve
        // istatistiklerdeki aynı kontrol, aynı renkler.
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        renderItem={({ item, index }) => (
          <CapsulePage
            entry={item}
            index={index}
            total={entries.length}
            unitPref={unitPref}
            pageHeight={pageHeight}
            userId={user?.id}
          />
        )}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View
              style={{ height: pageHeight, alignItems: "center", justifyContent: "center" }}
              className="bg-bg"
            >
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
      />
    </View>
  );
}
