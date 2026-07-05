import { View, Text, Image, ScrollView, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getPhotoUrl } from "@/lib/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_HEIGHT = SCREEN_WIDTH * 1.25; 

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

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg justify-center items-center">
        <ActivityIndicator color="#8CE05A" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-bg justify-center items-center px-4">
        <Text className="text-danger text-center">{(error as Error).message}</Text>
        <Pressable onPress={() => router.back()} className="mt-4 p-2">
          <Text className="text-text">Geri Dön</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg" bounces={false} showsVerticalScrollIndicator={false}>
      
      {/* 1. TERTEMİZ GÖRSEL ALANI (Yazı ve karartma yok) */}
      <View className="relative w-full" style={{ height: IMAGE_HEIGHT }}>
        
        {/* Yüzen Geri Butonu */}
        <Pressable 
          onPress={() => router.back()}
          className="absolute top-14 left-4 z-10 w-10 h-10 bg-black/40 rounded-full items-center justify-center backdrop-blur-md"
        >
          <Text className="text-white text-xl font-bold leading-none -mt-1">←</Text>
        </Pressable>

        {data?.photoUrl ? (
          <Image 
            source={{ uri: data.photoUrl }} 
            className="w-full h-full" 
            resizeMode="cover" 
          />
        ) : (
          <View className="w-full h-full bg-surface items-center justify-center">
            <Text className="text-textMuted">Fotoğraf bulunamadı</Text>
          </View>
        )}
      </View>

      {/* 2. İÇERİK ALANI */}
      <View className="px-5 pt-6 pb-12">
        
        {/* Zarif Tarih Başlığı */}
        {data && (
          <View className="mb-8">
            <Text className="text-textMuted text-[10px] font-bold tracking-widest uppercase mb-1">
              Kayıt Tarihi
            </Text>
            <Text className="text-text text-3xl font-bold tracking-tight">
              {new Date(data.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
            </Text>
          </View>
        )}
        
        {/* Ölçümler */}
        {(data as any)?.measurement_values?.length > 0 && (
          <View className="bg-surface rounded-2xl p-4 mb-4">
            <Text className="text-textFaint text-[10px] font-bold mb-3 tracking-widest uppercase">
              Fiziksel Veriler
            </Text>
            {(data as any).measurement_values.map((mv: any, i: number) => (
              <View key={i} className="flex-row items-center justify-between py-2 border-b border-border/50 last:border-0">
                <Text className="text-textMuted text-sm">{mv.measurement_types.name}</Text>
                <Text className="text-text text-base font-bold">
                  {mv.value} <Text className="text-textMuted text-xs font-normal">{mv.measurement_types.unit}</Text>
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Not */}
        {data?.note && (
          <View className="bg-surface rounded-2xl p-4">
            <Text className="text-textFaint text-[10px] font-bold mb-2 tracking-widest uppercase">
              Günlük Notu
            </Text>
            <Text className="text-text text-base leading-6">
              {data.note}
            </Text>
          </View>
        )}
        
      </View>
    </ScrollView>
  );
}