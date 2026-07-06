import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl } from "@/lib/storage";

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

      return { ...data, photoUrl };
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

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
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
      <View className="flex-1 bg-bg justify-center items-center px-4">
        <Text className="text-danger text-center">{(error as Error).message}</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-text">Geri Dön</Text>
        </Pressable>
      </View>
    );
  }

  /* ---------------- MENU ---------------- */

  const onPressMenu = () => {
    Alert.alert("İşlemler", "Ne yapmak istiyorsun?", [
      { text: "Düzenle", onPress: () => router.push(`/entry/edit/${id}`) },
      {
        text: "Sil",
        style: "destructive",
        onPress: () =>
          Alert.alert("Sil", "Bu işlem geri alınamaz", [
            { text: "Vazgeç", style: "cancel" },
            {
              text: "Sil",
              style: "destructive",
              onPress: () => deleteMutation.mutate(id),
            },
          ]),
      },
      { text: "İptal", style: "cancel" },
    ]);
  };

  /* ---------------- UI ---------------- */

  return (
    <ScrollView className="flex-1 bg-bg" bounces={false}>
      <View className="relative w-full" style={{ height: IMAGE_HEIGHT }}>
        <Pressable
          onPress={() => router.back()}
          className="absolute top-14 left-4 z-10 w-10 h-10 bg-black/40 rounded-full items-center justify-center"
        >
          <Text className="text-white">←</Text>
        </Pressable>

        <Pressable
          onPress={onPressMenu}
          className="absolute top-14 right-4 z-10 w-10 h-10 bg-black/40 rounded-full items-center justify-center"
        >
          <Text className="text-white text-lg">⋮</Text>
        </Pressable>

        {data?.photoUrl ? (
          <Image source={{ uri: data.photoUrl }} className="w-full h-full" resizeMode="cover" />
        ) : (
          <View className="w-full h-full bg-surface items-center justify-center">
            <Text className="text-textMuted">Fotoğraf yok</Text>
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
          <View className="bg-surface rounded-2xl p-4 mb-4">
            {(data as any).measurement_values.map((mv: any, i: number) => (
              <View key={i} className="flex-row justify-between py-2">
                <Text className="text-textMuted">{mv.measurement_types.name}</Text>
                <Text className="text-text font-bold">
                  {mv.value} {mv.measurement_types.unit}
                </Text>
              </View>
            ))}
          </View>
        )}

        {data?.note && (
          <View className="bg-surface rounded-2xl p-4">
            <Text className="text-text">{data.note}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
