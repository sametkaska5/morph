import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Modal,
  FlatList,
} from "react-native";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl, photoCacheKey } from "@/lib/storage";

function ActionMenuOption({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      className={`flex-row items-center gap-3 px-4 py-4 rounded-button border ${
        danger ? "bg-danger/10 border-danger/30" : "bg-surface border-border"
      }`}
    >
      <View className={`w-9 h-9 rounded-full items-center justify-center ${danger ? "bg-danger/15" : "bg-accentSoft"}`}>
        <Feather name={icon} size={17} color={danger ? "#D9705A" : "#8CE05A"} />
      </View>
      <Text className={`text-base font-semibold ${danger ? "text-danger" : "text-text"}`}>{label}</Text>
    </Pressable>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_HEIGHT = SCREEN_WIDTH * 1.25;

/** Bir seti "60 kg × 8" biçiminde yazar; boş alanları atlar. */
function workoutSetLabel(s: { reps: number | null; weight: number | null }): string {
  const weight = s.weight != null ? `${s.weight} kg` : "";
  const reps = s.reps != null ? `${s.reps} tekrar` : "";
  if (weight && reps) return `${s.weight} kg × ${s.reps}`;
  return weight || reps || "—";
}

/* ---------------- DATA ---------------- */

function useEntryDetail(entryId: string) {
  return useQuery({
    queryKey: ["entry", entryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, photos!cover_photo_id(storage_path), measurement_values(value, measurement_types(name, unit)), workout_items(name, order_index, workout_sets(reps, weight, order_index))"
        )
        .eq("id", entryId)
        .single();

      if (error) throw error;

      const photoPath = (data as any)?.photos?.storage_path;
      const photoUrl = photoPath ? await getPhotoUrl(photoPath, "full") : null;

      return { ...data, photoUrl, photoPath };
    },
  });
}

/**
 * Yan yana kaydırılabilecek kayıtların SIRASI.
 *
 * Ana ekran ızgarasıyla aynı sıralama ve aynı limit kullanılıyor (type=log,
 * tarihe göre yeniden eskiye, 60) — böylece ızgarada gördüğün sıra ile
 * kaydırdığında geldiğin sıra birebir aynı oluyor. user_id filtresi yok;
 * ızgara sorgusunda olduğu gibi RLS hallediyor.
 */
function useEntryOrder() {
  return useQuery({
    queryKey: ["entries", "order"],
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id")
        .eq("type", "log")
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []).map((e: any) => e.id as string);
    },
  });
}

/* ---------------- DELETE ---------------- */

async function deleteEntry(entryId: string) {
  const { data: photos, error: photoError } = await supabase
    .from("photos")
    .select("storage_path, thumb_path")
    .eq("entry_id", entryId);

  if (photoError) throw photoError;

  // Tam boy kopyanın yanında küçük kopyayı da siliyoruz, yoksa storage'da
  // yetim thumbnail dosyaları birikir.
  const paths = (photos ?? []).flatMap(
    (p: any) => [p.storage_path, p.thumb_path].filter(Boolean) as string[]
  );

  if (paths.length > 0) {
    // cover_photo_id, entries'i referans aldığı için önce onu temizlemek gerekiyor,
    // yoksa foreign key kısıtı silmeyi engelleyebilir
    await supabase.from("entries").update({ cover_photo_id: null }).eq("id", entryId);

    const { error: storageError } = await supabase.storage.from("photos").remove(paths);
    if (storageError) throw storageError;
  }

  const { error } = await supabase.from("entries").delete().eq("id", entryId);
  if (error) throw error;

  return true;
}

/* ---------------- TEK KAYIT SAYFASI ---------------- */

/**
 * Yatay sayfalayıcının tek bir sayfası. Üstteki geri/işlem butonları burada
 * DEĞİL — onlar ekran seviyesinde sabit duruyor, yoksa her sayfada bir kopyası
 * olur ve kaydırırken beraber kayarlardı.
 */
function EntryPage({ entryId }: { entryId: string }) {
  const { data, isLoading, error } = useEntryDetail(entryId);

  // DİKKAT: Bu kaplarda `flex-1` KULLANILMAZ.
  // Yatay listede iç kap satır yönünde dizilir; orada `flex-1` (flexBasis: 0)
  // ana ekseni, yani GENİŞLİĞİ kontrol eder ve aşağıdaki sabit width'i ezer.
  // Sayfalar tek ekran genişliğine sıkışınca kaydırılacak içerik kalmaz ve
  // sayfalayıcı hiç çalışmaz. Yükseklik zaten yatay listenin varsayılan
  // `alignItems: stretch` davranışıyla geliyor, ayrıca vermeye gerek yok.

  if (isLoading) {
    return (
      <View style={{ width: SCREEN_WIDTH }} className="bg-bg justify-center items-center">
        <ActivityIndicator color="#8CE05A" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ width: SCREEN_WIDTH }} className="bg-bg justify-center items-center px-6">
        <Text className="text-danger text-base text-center">{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ width: SCREEN_WIDTH }} className="bg-bg" bounces={false}>
      <View className="relative w-full" style={{ height: IMAGE_HEIGHT }}>
        {data?.photoUrl ? (
          <Image
            // cacheKey stabil storage yoluna bağlı — imzalı URL token'ı değişse de
            // (feed/ana ekranla aynı fotoğraf) cache isabet eder, yeniden indirmez.
            source={{
              uri: data.photoUrl,
              cacheKey: (data as any).photoPath
                ? photoCacheKey((data as any).photoPath, "full")
                : undefined,
            }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={(data as any).photoPath ?? undefined}
            transition={150}
          />
        ) : (
          <View className="w-full h-full bg-surface items-center justify-center">
            <Text className="text-textMuted text-base">Fotoğraf yok</Text>
          </View>
        )}
      </View>

      <View className="px-5 pt-6 pb-12">
        <Text className="text-text text-3xl font-bold mb-6">
          {data?.date ? new Date(data.date).toLocaleDateString("tr-TR") : ""}
        </Text>

        {(data as any)?.measurement_values?.length > 0 && (
          <View className="bg-surface border border-border rounded-card p-4 mb-4">
            {(data as any).measurement_values.map((mv: any, i: number) => (
              <View key={i} className="flex-row justify-between py-2">
                <Text className="text-textMuted text-base capitalize">{mv.measurement_types.name}</Text>
                <Text className="text-text text-base font-bold">
                  {mv.value} {mv.measurement_types.unit}
                </Text>
              </View>
            ))}
          </View>
        )}

        {(data as any)?.workout_items?.length > 0 && (
          <View className="bg-surface border border-border rounded-card p-4 mb-4">
            <Text className="text-textFaint text-sm font-semibold mb-3 tracking-wide">ANTRENMAN PROGRAMI</Text>
            {[...(data as any).workout_items]
              .sort((a: any, b: any) => a.order_index - b.order_index)
              .map((wi: any, i: number) => {
                const sets = [...(wi.workout_sets ?? [])].sort(
                  (a: any, b: any) => a.order_index - b.order_index
                );
                return (
                  <View key={i} className={i > 0 ? "mt-3 pt-3 border-t border-border" : ""}>
                    <Text className="text-text text-base font-semibold capitalize mb-1">{wi.name}</Text>
                    {sets.length > 0 ? (
                      sets.map((s: any, j: number) => (
                        <View key={j} className="flex-row justify-between py-0.5">
                          <Text className="text-textFaint text-sm">{j + 1}. set</Text>
                          <Text className="text-textMuted text-base">{workoutSetLabel(s)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text className="text-textFaint text-sm">Set girilmemiş</Text>
                    )}
                  </View>
                );
              })}
          </View>
        )}

        {data?.note && (
          <View className="bg-surface border border-border rounded-card p-4">
            <Text className="text-text text-base leading-6">{data.note}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/* ---------------- PAGE ---------------- */

export default function EntryDetail() {
  const params = useLocalSearchParams();

  const id = useMemo(() => {
    const raw = params.id;
    if (Array.isArray(raw)) return raw[0];
    return raw ?? "";
  }, [params.id]);

  const queryClient = useQueryClient();
  const { data: orderIds, isLoading: orderLoading } = useEntryOrder();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Arama ya da yıllık takvimden açılan ESKİ bir kayıt son 60'ın dışında
  // kalabilir. O durumda tek sayfalık listeye düşüyoruz: yana kaydırma olmaz
  // ama ekran normal şekilde çalışmaya devam eder.
  const ids = useMemo(() => {
    if (!orderIds || !orderIds.includes(id)) return [id];
    return orderIds;
  }, [orderIds, id]);

  const initialIndex = Math.max(0, ids.indexOf(id));

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  // Düzenle/sil her zaman EKRANDA GÖRÜNEN kayda uygulanmalı — kaydırdıktan
  // sonra hâlâ URL'deki ilk id'ye işlem yapmak sessizce yanlış kaydı silerdi.
  const activeId = ids[activeIndex] ?? id;

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      // Silinen kayıt "Toplam Anı"/seri sayaçlarını da değiştiriyor — profil
      // istatistikleri invalidate edilmeyince eski sayılar ekranda kalıyordu.
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["currentWeek"] });
      router.back();
    },
  });

  /* ---------------- LOADING ---------------- */

  // Sırayı bekliyoruz: initialScrollIndex yalnızca ilk render'da uygulandığı
  // için liste hazır olmadan çizersek açılışta yanlış kayıtta başlardık.
  if (orderLoading) {
    return (
      <View className="flex-1 bg-bg justify-center items-center">
        <ActivityIndicator color="#8CE05A" size="large" />
      </View>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <>
    <View className="flex-1 bg-bg">
      <FlatList
        data={ids}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        // windowSize=3 → aynı anda en fazla 3 sayfa bağlı, bellek sınırlı kalıyor.
        // removeClippedSubviews BİLEREK kapalı: her sayfa kendi içinde bir
        // ScrollView ve bu kombinasyon Android'de sayfaları boş gösterebiliyor.
        windowSize={3}
        onMomentumScrollEnd={(e) =>
          setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
        }
        renderItem={({ item }) => <EntryPage entryId={item} />}
      />

      {/* Üst kontroller sayfalayıcının DIŞINDA: kaydırırken yerinde kalıyorlar. */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Geri dön"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        className="absolute top-14 left-4 z-10 w-11 h-11 bg-black/40 rounded-full items-center justify-center"
      >
        <Feather name="chevron-left" size={22} color="#fff" />
      </Pressable>

      <Pressable
        onPress={() => setShowActionMenu(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Anı için işlemler"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        className="absolute top-14 right-4 z-10 w-11 h-11 bg-black/40 rounded-full items-center justify-center"
      >
        <Feather name="more-vertical" size={20} color="#fff" />
      </Pressable>

      {/* Sayaç, yanlarda başka kayıt olduğunu belli ediyor — Anı Akışı'ndaki
          ile aynı desen. h-11 sayesinde üstteki butonlarla aynı hizada. */}
      {ids.length > 1 ? (
        <View
          pointerEvents="none"
          className="absolute top-14 left-0 right-0 h-11 items-center justify-center z-10"
        >
          <View className="bg-black/50 rounded-pill px-3 py-1">
            <Text className="text-text text-xs font-medium">
              {activeIndex + 1}/{ids.length}
            </Text>
          </View>
        </View>
      ) : null}

      {deleteMutation.isPending && (
        <View className="absolute inset-0 bg-black/50 items-center justify-center z-20">
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>

    <Modal
      visible={showActionMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowActionMenu(false)}
    >
      <Pressable
        onPress={() => setShowActionMenu(false)}
        className="flex-1 bg-black/60 items-center justify-center px-8"
      >
        <Pressable onPress={() => {}} className="w-full bg-bg border border-border rounded-card p-5">
          <Text className="text-text text-xl font-bold mb-1 text-center">İşlemler</Text>
          <Text className="text-textMuted text-sm mb-5 text-center">Bu anı için ne yapmak istiyorsun?</Text>
          <View className="gap-3">
            <ActionMenuOption
              icon="edit-2"
              label="Düzenle"
              onPress={() => {
                setShowActionMenu(false);
                router.push(`/entry/edit/${activeId}`);
              }}
            />
            <ActionMenuOption
              icon="trash-2"
              label="Sil"
              danger
              onPress={() => {
                setShowActionMenu(false);
                setShowDeleteConfirm(true);
              }}
            />
          </View>
          <Pressable
            onPress={() => setShowActionMenu(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="items-center mt-4 py-2"
          >
            <Text className="text-textMuted text-sm">Vazgeç</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>

    <Modal
      visible={showDeleteConfirm}
      transparent
      animationType="fade"
      onRequestClose={() => setShowDeleteConfirm(false)}
    >
      <Pressable
        onPress={() => setShowDeleteConfirm(false)}
        className="flex-1 bg-black/60 items-center justify-center px-8"
      >
        <Pressable onPress={() => {}} className="w-full bg-bg border border-border rounded-card p-5 items-center">
          <View className="w-14 h-14 rounded-full bg-danger/15 items-center justify-center mb-4">
            <Feather name="trash-2" size={24} color="#D9705A" />
          </View>
          <Text className="text-text text-xl font-bold mb-2 text-center">Bu anıyı sil?</Text>
          <Text className="text-textMuted text-sm text-center mb-6">
            Bu işlem geri alınamaz, fotoğraf ve ölçümler kalıcı olarak silinir.
          </Text>
          <View className="flex-row gap-3 w-full">
            <Pressable
              onPress={() => setShowDeleteConfirm(false)}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              className="flex-1 py-4 rounded-button items-center bg-surface border border-border"
            >
              <Text className="text-text text-base font-semibold">Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowDeleteConfirm(false);
                deleteMutation.mutate(activeId);
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              className="flex-1 py-4 rounded-button items-center bg-danger"
            >
              <Text className="text-bg text-base font-semibold">Sil</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}
