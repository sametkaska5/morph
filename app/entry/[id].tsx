import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Modal,
} from "react-native";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl } from "@/lib/storage";

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

/* ---------------- DATA ---------------- */

function useEntryDetail(entryId: string) {
  return useQuery({
    queryKey: ["entry", entryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, photos!cover_photo_id(storage_path), measurement_values(value, measurement_types(name, unit))"
        )
        .eq("id", entryId)
        .single();

      if (error) throw error;

      const photoPath = (data as any)?.photos?.storage_path;
      const photoUrl = photoPath ? await getPhotoUrl(photoPath) : null;

      return { ...data, photoUrl, photoPath };
    },
  });
}

/* ---------------- DELETE ---------------- */

async function deleteEntry(entryId: string) {
  const { data: photos, error: photoError } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("entry_id", entryId);

  if (photoError) throw photoError;

  const paths = (photos ?? []).map((p: any) => p.storage_path);

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

/* ---------------- PAGE ---------------- */

export default function EntryDetail() {
  const params = useLocalSearchParams();

  const id = useMemo(() => {
    const raw = params.id;
    if (Array.isArray(raw)) return raw[0];
    return raw ?? "";
  }, [params.id]);

  const queryClient = useQueryClient();
  const { data, isLoading, error } = useEntryDetail(id);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg justify-center items-center">
        <ActivityIndicator color="#8CE05A" size="large" />
      </View>
    );
  }

  /* ---------------- ERROR ---------------- */

  if (error) {
    return (
      <View className="flex-1 bg-bg justify-center items-center px-6">
        <Text className="text-danger text-base text-center mb-4">{(error as Error).message}</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text className="text-text text-base font-semibold">Geri Dön</Text>
        </Pressable>
      </View>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <>
    <ScrollView className="flex-1 bg-bg" bounces={false}>
      <View className="relative w-full" style={{ height: IMAGE_HEIGHT }}>
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

        {data?.photoUrl ? (
          <Image
            source={{ uri: data.photoUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="disk"
            recyclingKey={(data as any).photoPath ?? undefined}
            transition={150}
          />
        ) : (
          <View className="w-full h-full bg-surface items-center justify-center">
            <Text className="text-textMuted text-sm">Fotoğraf yok</Text>
          </View>
        )}

        {deleteMutation.isPending && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center">
            <ActivityIndicator color="#fff" />
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
                <Text className="text-textMuted text-sm capitalize">{mv.measurement_types.name}</Text>
                <Text className="text-text text-base font-bold">
                  {mv.value} {mv.measurement_types.unit}
                </Text>
              </View>
            ))}
          </View>
        )}

        {data?.note && (
          <View className="bg-surface border border-border rounded-card p-4">
            <Text className="text-text text-base leading-6">{data.note}</Text>
          </View>
        )}
      </View>
    </ScrollView>

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
                router.push(`/entry/edit/${id}`);
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
                deleteMutation.mutate(id);
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
