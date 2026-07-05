import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey } from "@/lib/date";

export default function OffDayScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(Platform.OS === "ios");

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Giriş yapılmamış");
      const { error } = await supabase
        .from("entries")
        .upsert(
          { user_id: user.id, date: toLocalDateKey(date), type: "off_day", note: null },
          { onConflict: "user_id,date" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    },
  });

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <View className="items-center mb-8">
        <View className="w-16 h-16 rounded-full bg-offDaySoft border border-offDay items-center justify-center mb-4">
          <Feather name="moon" size={26} color="#B8C0E0" />
        </View>
        <Text className="text-text text-lg font-semibold">Off day işaretle</Text>
        <Text className="text-textMuted text-xs text-center mt-2 max-w-[240px]">
          Bilinçli dinlenme günleri de serinin bir parçası — streak'in bozulmaz.
        </Text>
      </View>

      <Pressable
        onPress={() => setShowPicker(true)}
        className="bg-surface border border-border rounded-card px-4 py-3.5 mb-4 flex-row items-center justify-between"
      >
        <Text className="text-textMuted text-xs">tarih</Text>
        <Text className="text-text text-sm font-semibold">
          {date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </Text>
      </Pressable>

      {showPicker && (
        <DateTimePicker
          value={date}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, selected) => {
            setShowPicker(Platform.OS === "ios");
            if (selected) setDate(selected);
          }}
        />
      )}

      {saveMutation.isError ? (
        <Text className="text-danger text-xs mb-3">{(saveMutation.error as Error).message}</Text>
      ) : null}

      <Pressable
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="bg-offDay rounded-card py-4 items-center mb-3"
      >
        {saveMutation.isPending ? (
          <ActivityIndicator color="#0B0D0A" />
        ) : (
          <Text className="text-bg text-sm font-semibold">Off day olarak işaretle</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.back()} className="items-center py-2">
        <Text className="text-textMuted text-xs">vazgeç</Text>
      </Pressable>
    </View>
  );
}
