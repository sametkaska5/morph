import { useState } from "react";
import { View, Pressable, ActivityIndicator, Platform } from "react-native";
import { Text } from "@/components/Typography";
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
        <Text className="text-text text-xl font-semibold">Off day işaretle</Text>
        <Text className="text-textMuted text-base text-center mt-2 max-w-[260px]">
          Bilinçli dinlenme günleri de serinin bir parçası — streak'in bozulmaz.
        </Text>
      </View>

      <Pressable
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        className="bg-surface border border-border rounded-button px-4 py-4 mb-4 flex-row items-center justify-between"
      >
        <Text className="text-textMuted text-sm">Tarih</Text>
        <Text className="text-text text-base font-semibold">
          {date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </Text>
      </Pressable>

      {showPicker && (
        <DateTimePicker
          value={date}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onValueChange={(_, selected) => {
            if (Platform.OS === "android") setShowPicker(false);
            setDate(selected);
          }}
          onDismiss={() => setShowPicker(false)}
        />
      )}

      {saveMutation.isError ? (
        <Text className="text-danger text-base mb-3">{(saveMutation.error as Error).message}</Text>
      ) : null}

      <Pressable
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : saveMutation.isPending ? 0.7 : 1 })}
        className="bg-offDay rounded-button py-4 items-center mb-3"
      >
        {saveMutation.isPending ? (
          <ActivityIndicator color="#0B0D0A" />
        ) : (
          <Text className="text-bg text-base font-semibold">Off day olarak işaretle</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        className="items-center py-2"
      >
        <Text className="text-textMuted text-sm">vazgeç</Text>
      </Pressable>
    </View>
  );
}
