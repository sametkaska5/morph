import { View, Text, Image, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl } from "@/lib/storage";

function useEntryDetail(entryId: string) {
  return useQuery({
    queryKey: ["entry", entryId],
    queryFn: async () => {
      const { data: entry, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, photos!entry_id(storage_path), measurement_values(value, measurement_types(name, unit))"
        )
        .eq("id", entryId)
        .single();
      if (error) throw error;

      const photoPath = (entry as any).photos?.[0]?.storage_path;
      const photoUrl = photoPath ? await getPhotoUrl(photoPath) : null;

      return { ...entry, photoUrl };
    },
  });
}

export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = useEntryDetail(id);

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 18, paddingTop: 60 }}>
      <View className="flex-row justify-between items-center mb-4">
        <Pressable onPress={() => router.back()}>
          <Text className="text-text text-lg">←</Text>
        </Pressable>
        <Text className="text-text text-base font-semibold">
          {data ? new Date(data.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : ""}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {isLoading && <ActivityIndicator color="#8CE05A" />}
      {error ? <Text className="text-danger text-xs">{(error as Error).message}</Text> : null}

      {data?.photoUrl ? (
        <Image source={{ uri: data.photoUrl }} className="w-full h-80 rounded-card mb-4" resizeMode="cover" />
      ) : null}

      {(data as any)?.measurement_values?.length > 0 ? (
        <View className="bg-surface border border-border rounded-card p-3.5 mb-3">
          <Text className="text-textMuted text-[11px] font-semibold mb-2 tracking-wide">ÖLÇÜMLER</Text>
          {(data as any).measurement_values.map((mv: any, i: number) => (
            <View key={i} className="flex-row items-center justify-between py-2">
              <Text className="text-textMuted text-xs">{mv.measurement_types.name}</Text>
              <Text className="text-text text-base font-semibold">
                {mv.value} {mv.measurement_types.unit}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-textFaint text-xs mb-3">Bu kayıtta ölçüm yok.</Text>
      )}

      {data?.note ? (
        <View className="bg-surface border border-border rounded-card p-3.5">
          <Text className="text-textMuted text-[11px] font-semibold mb-2 tracking-wide">NOT</Text>
          <Text className="text-text text-sm leading-5">{data.note}</Text>
        </View>
      ) : (
        <Text className="text-textFaint text-xs">Bu kayıtta not yok.</Text>
      )}
    </ScrollView>
  );
}
