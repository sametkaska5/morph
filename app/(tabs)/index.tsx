import { theme } from "@/lib/theme";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { photoCacheKey } from "@/lib/storage";
import { formatDateKey } from "@/lib/date";
import { openCapturePicker } from "@/lib/capture";
import { useTimelineEntries, usePrefetchEntryDetail, type EntryRow } from "@/lib/entries";
import { useReduceMotion } from "@/lib/useReduceMotion";
import { PhotoStack } from "@/components/PhotoStack";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";

const GAP = 8;
const COLUMNS = 3;
const H_PADDING = 16;

/**
 * Kare ölçüsü PENCERE genişliğinden hesaplanıyor ve bu hesap render sırasında
 * yapılmak ZORUNDA.
 *
 * Eskiden modül kapsamında `Dimensions.get("window")` ile bir kez okunuyordu:
 * o değer JS paketi yüklenirken donuyor. Uygulama portrait'e kilitli
 * (app.json orientation) yani ekran döndürme sorun değil, ama Android'in çoklu
 * pencere/bölünmüş ekran kipinde pencere genişliği değişiyor ve ızgara eski
 * genişliğe göre çizilmeye devam ediyordu — kareler taşıyor ya da sağda boşluk
 * kalıyordu. useWindowDimensions değişimi izliyor.
 */
function useThumbSize() {
  const { width } = useWindowDimensions();
  const thumbW = (width - H_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  return { thumbW, thumbH: thumbW * 1.5 }; // poster oranı (2:3)
}

// memo: ekran her render olduğunda (örn. aşağı çekip yenilerken isRefetching
// değişince) 60 hücrenin hepsi yeniden çiziliyordu. React Query yenilemede
// değişmeyen kayıtların obje kimliğini korur (structural sharing) — memo
// sayesinde yalnızca gerçekten değişen hücreler render olur.
const PosterThumb = memo(function PosterThumb({
  entry,
  peekToken,
  staggerIndex,
  reduceMotion,
  onPeek,
  onPrefetch,
  thumbW,
  thumbH,
}: {
  entry: EntryRow;
  peekToken: number;
  staggerIndex: number;
  reduceMotion: boolean;
  onPeek: (entryId: string) => void;
  onPrefetch: (entryId: string) => void;
  thumbW: number;
  thumbH: number;
}) {
  // Pressable'ın basınca-değişen style FONKSİYONU burada marginBottom'u (satır
  // arası boşluk) uygulamıyordu — daha önce FAB ve Anı Akışı genişletme butonunda
  // gördüğümüz aynı sorun. Düz stil objesine geri dönüp basma efektini elle
  // (onPressIn/Out + local state) iç görünüme taşıyoruz.
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      // Henüz senkronize olmamış (offline) kaydın id'si "pending-<tarih>" —
      // gerçek bir uuid olmadığı için detay ekranı sorguda hata verip kırmızı
      // hata sayfası gösteriyordu. Senkronize olana kadar dokunmayı kapatıyoruz.
      onPress={entry.pending ? undefined : () => router.push(`/entry/${entry.id}`)}
      disabled={entry.pending}
      onPressIn={() => {
        setPressed(true);
        // Plak sandığı jesti: parmak değdiği anda arkadakiler açılıyor.
        onPeek(entry.id);
        // Aynı an, detay verisini de başlatıyoruz: parmağın kalkması ve geçiş
        // animasyonu kadar önden başlamış oluyor. Senkronize olmamış kaydın id'si
        // gerçek bir uuid olmadığı için onda atlıyoruz (dokunma da kapalı).
        if (!entry.pending) onPrefetch(entry.id);
      }}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={`${formatDateKey(entry.date, { day: "numeric", month: "long", year: "numeric" })} tarihli antrenman${
        entry.photo_count > 1 ? `, ${entry.photo_count} fotoğraf` : ""
      }${entry.pending ? ", senkronize edilmeyi bekliyor" : ""}`}
      style={{ width: thumbW, marginBottom: 16 }}
    >
      <PhotoStack
        photos={entry.back_photos}
        peekToken={peekToken}
        reduceMotion={reduceMotion}
        staggerIndex={staggerIndex}
      >
        <View
          style={{
            width: thumbW,
            height: thumbH,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }}
          className="rounded-[10px] overflow-hidden bg-surface border border-border"
        >
          {entry.cover_photo_url ? (
            <Image
              // cacheKey'i değişmeyen storage yoluna sabitliyoruz — imzalı URL'nin
              // token'ı her yeniden fetch'te değiştiğinden URL bazlı disk cache
              // aksi halde aynı fotoğrafı tekrar tekrar indiriyor (bkz. zaman-kapsulu).
              // Pending kayıtların henüz path'i yok; onlarda cacheKey vermiyoruz.
              source={{
                uri: entry.cover_photo_url,
                cacheKey:
                  entry.pending || !entry.cover_photo_path
                    ? undefined
                    : photoCacheKey(entry.cover_photo_path, "thumb"),
              }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy={entry.pending ? "none" : "memory-disk"}
              recyclingKey={entry.cover_photo_path ?? undefined}
              transition={150}
            />
          ) : null}
          {/* Tarih fotoğrafın ALTINDA ayrı bir metin olarak durunca, ızgarada bir
            üstteki/bir alttaki fotoğrafa mı ait olduğu karışıyordu — tarihi
            doğrudan fotoğrafın kendi köşesine (üzerine) bindirip bu belirsizliği
            yapısal olarak ortadan kaldırıyoruz. */}
          <View className="absolute bottom-1.5 left-1.5 bg-black/70 rounded-md px-2 py-1">
            <Text className="text-text text-xs font-semibold">
              {formatDateKey(entry.date, { day: "numeric", month: "short" })}
            </Text>
          </View>
          {entry.pending ? (
            <View className="absolute top-1.5 right-1.5 bg-black/60 rounded-full px-1.5 py-0.5 flex-row items-center gap-1">
              <Feather name="clock" size={11} color={theme.colors.text} />
              <Text className="text-text text-xs font-semibold">Bekliyor</Text>
            </View>
          ) : entry.photo_count > 1 ? (
            // Sayı rozeti, yaprak kenarlarının söylediğini kesinleştiriyor:
            // "birden fazla var" ile "kaç tane var" ayrı bilgiler.
            <View className="absolute top-1.5 right-1.5 bg-black/70 rounded-full px-1.5 py-0.5 flex-row items-center gap-1">
              <Feather name="layers" size={10} color={theme.colors.text} />
              <Text className="text-text text-xs font-semibold">{entry.photo_count}</Text>
            </View>
          ) : null}
        </View>
      </PhotoStack>
    </Pressable>
  );
});

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8" style={{ marginTop: -40 }}>
      <View className="w-16 h-16 rounded-full bg-accentSoft border border-accent items-center justify-center mb-4">
        <Feather name="camera" size={26} color={theme.colors.accent} />
      </View>
      <Text className="text-text text-xl font-semibold mb-2 text-center">Henüz bir antrenmanın yok</Text>
      <Text className="text-textMuted text-base text-center leading-6 mb-5 max-w-[260px]">
        İlk antrenmanını ekle ve gelişimini takip etmeye başla.
      </Text>
      <PressableFade
        onPress={openCapturePicker}
        accessibilityRole="button"
        dim={0.85}
        className="bg-accent rounded-button px-5 py-4 flex-row items-center gap-2"
      >
        <Feather name="plus" size={18} color={theme.colors.bg} />
        <Text className="text-bg text-base font-semibold">İlk antrenmanını ekle</Text>
      </PressableFade>
    </View>
  );
}

export default function AnaEkran() {
  const screen = useScreenInsets();
  const { thumbW, thumbH } = useThumbSize();
  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTimelineEntries();
  const prefetchDetail = usePrefetchEntryDetail();
  // Sayfaları tek listeye düzleştiriyoruz. useMemo şart: FlatList'e her render'da
  // yeni bir dizi vermek, memo'lu hücrelerin kazandığı her şeyi geri alırdı.
  const entries = useMemo(() => data?.pages.flat() ?? [], [data]);
  const isEmpty = !isLoading && entries.length === 0;

  // Sabit renderItem: her render'da yeni closure üretmek FlatList'in satır
  // karşılaştırmasını boşa düşürüyordu; memo'lu PosterThumb ancak sabit bir
  // renderItem ile birlikte işe yarar.
  const reduceMotion = useReduceMotion();

  /**
   * Kart başına "kaç kez açıldı" sayacı. Sayaç artınca PhotoStack bir kez
   * oynuyor. İki tetikleyici de aynı sayaçtan geçiyor (görünür olma + basma) —
   * ayrı bayraklar olsaydı ikisi çakıştığında animasyon kendi kendini keserdi.
   */
  const [peekTokens, setPeekTokens] = useState<Record<string, number>>({});
  // Bir kez görünüp açılmış kartlar: geri kaydırınca tekrar tekrar oynamasın.
  const seenRef = useRef<Set<string>>(new Set());

  const bumpPeek = useCallback((entryId: string) => {
    setPeekTokens((prev) => ({ ...prev, [entryId]: (prev[entryId] ?? 0) + 1 }));
  }, []);

  // Görünürlük eşiği: kartın yarısı ekranda olmadan açılma başlarsa kullanıcı
  // hareketin yarısını kaçırıyor.
  // useMemo/useCallback + boş bağımlılık: FlatList bu ikisinin referansının
  // değişmesine izin vermiyor ("Changing onViewableItemsChanged on the fly is
  // not supported") ve render sırasında ref okumak da yasak.
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item?: EntryRow; index: number | null }[] }) => {
      const firstTime = viewableItems.filter(
        (v) => v.item && v.item.back_photos.length > 0 && !seenRef.current.has(v.item.id),
      );
      if (firstTime.length === 0) return;

      setPeekTokens((prev) => {
        const next = { ...prev };
        firstTime.forEach((v) => {
          seenRef.current.add(v.item!.id);
          next[v.item!.id] = (next[v.item!.id] ?? 0) + 1;
        });
        return next;
      });
    },
    [],
  );

  const renderPoster = useCallback(
    ({ item, index }: { item: EntryRow; index: number }) => (
      <PosterThumb
        entry={item}
        peekToken={peekTokens[item.id] ?? 0}
        // Aynı anda görünen kartlar sırayla açılsın: hepsi aynı anda oynarsa
        // hem takılır hem "yaprak çevirme" hissi kaybolur.
        staggerIndex={index % COLUMNS}
        reduceMotion={reduceMotion}
        onPeek={bumpPeek}
        onPrefetch={prefetchDetail}
        thumbW={thumbW}
        thumbH={thumbH}
      />
    ),
    [peekTokens, reduceMotion, bumpPeek, prefetchDetail, thumbW, thumbH],
  );

  const todayLabel = new Date().toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <View className="flex-1 bg-bg">
      <View
        className="flex-row justify-between items-center px-4 pb-4"
        style={{ paddingTop: screen.top }}
      >
        <View>
          <Text
            className="text-text text-3xl font-bold tracking-wide uppercase"
            accessibilityRole="header"
          >
            remory
          </Text>
          <Text className="text-textMuted text-sm mt-1 capitalize">{todayLabel}</Text>
        </View>
        <View className="flex-row gap-2">
          {/* Antrenman programı kısayolu — arama/karşılaştır ile aynı yuvarlak
              boyut ama accent tonlu: antrenmanda hızlı erişilen asıl aksiyon,
              yer kaplamadan öne çıkıyor. */}
          <PressableFade
            onPress={() => router.push("/entry/program")}
            accessibilityRole="button"
            accessibilityLabel="Bugünün antrenman programını aç"
            dim={0.7}
            className="w-11 h-11 rounded-full bg-accentSoft border border-accent items-center justify-center"
          >
            <Feather name="clipboard" size={20} color={theme.colors.accent} />
          </PressableFade>
          <PressableFade
            onPress={() => router.push("/search")}
            accessibilityRole="button"
            accessibilityLabel="Antrenmanlarında ara"
            dim={0.7}
            className="w-11 h-11 rounded-full bg-surface border border-border items-center justify-center"
          >
            <Feather name="search" size={20} color={theme.colors.textFaint} />
          </PressableFade>
          <PressableFade
            onPress={() => router.push("/compare/pick")}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf karşılaştır"
            dim={0.7}
            className="w-11 h-11 rounded-full bg-surface border border-border items-center justify-center"
          >
            <Feather name="repeat" size={20} color={theme.colors.textFaint} />
          </PressableFade>
        </View>
      </View>

      {/* Başlık YALNIZCA gerçekten kayıt varken görünmeli.
          Buradaki eski kontrol `isEmpty === false` idi ve yükleme sırasında da
          başlığı gösteriyordu: veri gelmeden `entries` undefined, dolayısıyla
          `entries?.length === 0` ifadesi undefined DEĞİL `false` üretiyor
          (undefined === 0 → false) ve koşul tutuyordu. Doğrudan uzunluğa
          bakmak hem niyeti hem davranışı aynı yere getiriyor. */}
      {entries?.length ? (
        <View className="flex-row items-center justify-between px-4 mb-3">
          <Text className="text-textMuted text-sm font-semibold uppercase tracking-wide">
            Son Kayıtlar
          </Text>
          <Text className="text-textMuted text-sm font-medium">{entries.length} kayıt</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View className="flex-1 items-center justify-center" style={{ marginTop: -40 }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center" style={{ marginTop: -40 }}>
          <ErrorState error={error} onRetry={() => refetch()} />
        </View>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          showsVerticalScrollIndicator={false}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
          contentContainerStyle={{ paddingHorizontal: H_PADDING, paddingBottom: 24 }}
          columnWrapperStyle={{ gap: GAP }}
          renderItem={renderPoster}
          // Sonsuz kaydırma. Eşik 0.5 = kalan bir ekran boyu; anı akışıyla aynı
          // değer. hasNextPage kontrolü şart, yoksa liste sonuna her gelişte
          // boşuna sorgu atılırdı.
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              // Etiket görsel göstergenin karşılığı: ekran okuyucu kullanıcısı
              // dönenceyi göremiyor, listenin bittiğini sanırdı.
              <View
                className="py-6 items-center"
                accessibilityRole="progressbar"
                accessibilityLabel="Daha fazla antrenman yükleniyor"
              >
                <ActivityIndicator color={theme.colors.accent} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
