import { useState } from "react";
import { View, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/components/Typography";
import { photoCacheKey } from "@/lib/storage";
import type { EntryPhoto } from "@/lib/entries";
import { nextCoverAfterDelete } from "@/lib/photos";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const THUMB = 56;

/**
 * Bir günün fotoğrafları arasında geçiş şeridi + fotoğraf işlemleri.
 *
 * Neden şerit, neden yatay sayfalayıcı DEĞİL: detay ekranının kendisi zaten
 * kayıtlar arasında gezen yatay bir sayfalayıcı. İçine ikinci bir yatay
 * kaydırma koymak iki jestin birbirini yemesi demekti — dokunmayla seçim hem
 * çakışmıyor hem hangi fotoğrafta olduğunu sürekli görünür kılıyor.
 *
 * Tek fotoğraflı günlerde şerit HİÇ çizilmiyor; o akış bugünkü gibi kalıyor.
 */
export function EntryPhotoStrip({
  photos,
  activeId,
  onSelect,
  onAdd,
  onSetCover,
  onDelete,
  busy,
}: {
  photos: EntryPhoto[];
  activeId: string | null;
  onSelect: (photoId: string) => void;
  onAdd: () => void;
  onSetCover: (photoId: string) => void;
  onDelete: (photoId: string, nextCoverId: string | null) => void;
  busy?: boolean;
}) {
  const active = photos.find((p) => p.id === activeId) ?? photos[0] ?? null;
  const isLastPhoto = photos.length <= 1;

  // Son fotoğrafı silmek kaydı fotoğrafsız bırakırdı: ızgarada boş bir kutu,
  // akışta kapaksız bir satır. Kaydın tamamını silmek ayrı ve bilinçli bir
  // işlem, kullanıcıyı oraya yönlendiriyoruz.
  const [dialog, setDialog] = useState<"confirm" | "lastPhoto" | null>(null);

  function handleDeletePress() {
    if (!active) return;
    setDialog(isLastPhoto ? "lastPhoto" : "confirm");
  }

  function confirmDelete() {
    setDialog(null);
    if (!active) return;
    onDelete(active.id, active.isCover ? nextCoverAfterDelete(photos, active.id) : null);
  }

  const dialogs = (
    <>
      <ConfirmDialog
        visible={dialog === "confirm"}
        icon="trash-2"
        danger
        title="Fotoğrafı sil?"
        message={
          active?.isCover
            ? "Bu günün kapağı. Silinince sıradaki fotoğraf kapak olur ve bu işlem geri alınamaz."
            : "Bu fotoğraf kalıcı olarak silinecek, bu işlem geri alınamaz."
        }
        confirmLabel="Sil"
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === "lastPhoto"}
        icon="image"
        title="Tek fotoğraf silinemez"
        message='Bu günün tek fotoğrafı. Kaydı tümüyle silmek istersen üstteki menüden "Kaydı sil" seçeneğini kullan.'
        onClose={() => setDialog(null)}
      />
    </>
  );

  if (photos.length <= 1) {
    return (
      <View className="px-5 pt-4">
        {dialogs}
        <Pressable
          onPress={onAdd}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Bu güne fotoğraf ekle"
          style={{ opacity: busy ? 0.6 : 1 }}
          className="flex-row items-center justify-center gap-2 rounded-button border border-border bg-surface py-3"
        >
          {busy ? (
            <ActivityIndicator color="#8CE05A" />
          ) : (
            <>
              <Feather name="plus" size={16} color="#8CE05A" />
              <Text className="text-base font-semibold text-accent">Bu güne fotoğraf ekle</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View className="px-5 pt-4">
      {dialogs}
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-textFaint text-sm font-semibold tracking-wide">
          {photos.length} FOTOĞRAF
        </Text>
        <View className="flex-row items-center gap-4">
          {active && !active.isCover ? (
            <Pressable
              onPress={() => onSetCover(active.id)}
              disabled={busy}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Bu fotoğrafı kapak yap"
              style={{ opacity: busy ? 0.6 : 1 }}
              className="flex-row items-center gap-1.5"
            >
              <Feather name="star" size={14} color="#8CE05A" />
              <Text className="text-accent text-sm font-medium">Kapak yap</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleDeletePress}
            disabled={busy}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Seçili fotoğrafı sil"
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            <Feather name="trash-2" size={15} color="#D9705A" />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {photos.map((photo, index) => {
          const isActive = photo.id === active?.id;
          return (
            <Pressable
              key={photo.id}
              onPress={() => onSelect(photo.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${index + 1}. fotoğraf${photo.isCover ? ", kapak" : ""}`}
              // style DÜZ NESNE: fonksiyon-form style bu projede className'den
              // gelen stilleri güvenilir birleştirmiyor (bkz. ErrorState.tsx).
              style={{ width: THUMB, height: THUMB }}
              className={`overflow-hidden rounded-[8px] border-2 ${
                isActive ? "border-accent" : "border-border"
              }`}
            >
              {photo.url ? (
                <Image
                  source={{ uri: photo.url, cacheKey: photoCacheKey(photo.path, "full") }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={photo.path}
                />
              ) : (
                <View className="h-full w-full bg-surface" />
              )}
              {photo.isCover ? (
                <View className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-1">
                  <Feather name="star" size={9} color="#8CE05A" />
                </View>
              ) : null}
            </Pressable>
          );
        })}

        <Pressable
          onPress={onAdd}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Bu güne fotoğraf ekle"
          style={{ width: THUMB, height: THUMB, opacity: busy ? 0.6 : 1 }}
          className="items-center justify-center rounded-[8px] border-2 border-dashed border-border bg-surface"
        >
          {busy ? <ActivityIndicator color="#8CE05A" /> : <Feather name="plus" size={18} color="#8CE05A" />}
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Şeridin seçili fotoğrafını tutan küçük state — liste değişince güvenle düşer. */
export function useActivePhoto(photos: EntryPhoto[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Türetme: state'teki id listede yoksa (fotoğraf silindi / henüz yüklenmedi)
  // kapağa düşüyoruz. Effect'le state düzeltmeye gerek yok.
  const active = photos.find((p) => p.id === activeId) ?? photos[0] ?? null;
  return { activeId: active?.id ?? null, active, setActiveId };
}
