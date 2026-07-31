import { memo, useCallback, useState } from "react";
import { View, Pressable, FlatList, Dimensions, RefreshControl, ActivityIndicator } from "react-native";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { photoCacheKey } from "@/lib/storage";
import { openCapturePicker } from "@/lib/capture";
import { useTimelineEntries, type EntryRow } from "@/lib/entries";

const { width } = Dimensions.get("window");
const GAP = 8;
const COLUMNS = 3;
const H_PADDING = 16;
const THUMB_W = (width - H_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const THUMB_H = THUMB_W * 1.5; // poster oranı (2:3)

// memo: ekran her render olduğunda (örn. aşağı çekip yenilerken isRefetching
// değişince) 60 hücrenin hepsi yeniden çiziliyordu. React Query yenilemede
// değişmeyen kayıtların obje kimliğini korur (structural sharing) — memo
// sayesinde yalnızca gerçekten değişen hücreler render olur.
const PosterThumb = memo(function PosterThumb({ entry }: { entry: EntryRow }) {
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
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={`${new Date(entry.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} tarihli anı${
        entry.pending ? ", senkronize edilmeyi bekliyor" : ""
      }`}
      style={{ width: THUMB_W, marginBottom: 16 }}
    >
      <View
        style={{
          width: THUMB_W,
          height: THUMB_H,
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
            {new Date(entry.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
          </Text>
        </View>
        {entry.pending ? (
          <View className="absolute top-1.5 right-1.5 bg-black/60 rounded-full px-1.5 py-0.5 flex-row items-center gap-1">
            <Feather name="clock" size={11} color="#F5F3EC" />
            <Text className="text-text text-xs font-semibold">Bekliyor</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8" style={{ marginTop: -40 }}>
      <View className="w-16 h-16 rounded-full bg-accentSoft border border-accent items-center justify-center mb-4">
        <Feather name="camera" size={26} color="#8CE05A" />
      </View>
      <Text className="text-text text-xl font-semibold mb-2 text-center">Henüz bir kaydın yok</Text>
      <Text className="text-textMuted text-base text-center leading-6 mb-5 max-w-[260px]">
        İlk anını ekle, gelecekteki kendin bugüne baktığında sana teşekkür edecek.
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

export default function AnaEkran() {
  const { data: entries, isLoading, isRefetching, error, refetch } = useTimelineEntries();
  const isEmpty = entries?.length === 0;

  // Sabit renderItem: her render'da yeni closure üretmek FlatList'in satır
  // karşılaştırmasını boşa düşürüyordu; memo'lu PosterThumb ancak sabit bir
  // renderItem ile birlikte işe yarar.
  const renderPoster = useCallback(({ item }: { item: EntryRow }) => <PosterThumb entry={item} />, []);

  const todayLabel = new Date().toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row justify-between items-center px-4 pt-14 pb-4">
        <View>
          <Text className="text-text text-3xl font-bold tracking-wide uppercase" accessibilityRole="header">
            remory
          </Text>
          <Text className="text-textMuted text-sm mt-1 capitalize">{todayLabel}</Text>
        </View>
        <View className="flex-row gap-2">
          {/* Antrenman programı kısayolu — arama/karşılaştır ile aynı yuvarlak
              boyut ama accent tonlu: antrenmanda hızlı erişilen asıl aksiyon,
              yer kaplamadan öne çıkıyor. */}
          <Pressable
            onPress={() => router.push("/entry/program")}
            accessibilityRole="button"
            accessibilityLabel="Bugünün antrenman programını aç"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="w-11 h-11 rounded-full bg-accentSoft border border-accent items-center justify-center"
          >
            <Feather name="clipboard" size={20} color="#8CE05A" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/search")}
            accessibilityRole="button"
            accessibilityLabel="Anılarında ara"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="w-11 h-11 rounded-full bg-surface border border-border items-center justify-center"
          >
            <Feather name="search" size={20} color="#8B8A82" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/compare/pick")}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf karşılaştır"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="w-11 h-11 rounded-full bg-surface border border-border items-center justify-center"
          >
            <Feather name="repeat" size={20} color="#8B8A82" />
          </Pressable>
        </View>
      </View>

      {/* isEmpty, veri gelmeden `undefined` olduğu için yükleme sırasında da
          "Son Kayıtlar" başlığı görünüyordu — açıkça false olmasını şart koşuyoruz. */}
      {isEmpty === false ? (
        <View className="flex-row items-center justify-between px-4 mb-3">
          <Text className="text-textMuted text-sm font-semibold uppercase tracking-wide">Son Kayıtlar</Text>
          {entries?.length ? <Text className="text-textMuted text-sm font-medium">{entries.length} kayıt</Text> : null}
        </View>
      ) : null}

      {isLoading ? (
        <View className="flex-1 items-center justify-center" style={{ marginTop: -40 }}>
          <ActivityIndicator color="#8CE05A" />
        </View>
      ) : error ? (
        <Text className="text-danger text-base px-4 mb-2">{(error as Error).message}</Text>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor="#8CE05A"
              colors={["#8CE05A"]}
            />
          }
          contentContainerStyle={{ paddingHorizontal: H_PADDING, paddingBottom: 24 }}
          columnWrapperStyle={{ gap: GAP }}
          renderItem={renderPoster}
        />
      )}
    </View>
  );
}
