import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";

function toDateKey(date: Date) {
  // Yerel saate göre yyyy-mm-dd oluştur
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 10);
}

export default function OffDayScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Giriş yapılmamış.");

      const dateKey = toDateKey(date);

      // Aynı tarihte kayıt var mı?
      const { data: existingEntry, error: fetchError } = await supabase
        .from("entries")
        .select("id, type")
        .eq("user_id", user.id)
        .eq("date", dateKey)
        .maybeSingle();

      if (fetchError) throw fetchError;

      // Aynı gün zaten Off Day ise
      if (existingEntry?.type === "off_day") {
        throw new Error("Bu gün zaten Off Day olarak işaretlenmiş.");
      }

      // Aynı gün zaten bir kayıt varsa
      if (existingEntry) {
        throw new Error("Bu tarihte zaten bir kayıt bulunuyor.");
      }

      // Off Day oluştur
      const { error } = await supabase.from("entries").insert({
        user_id: user.id,
        date: dateKey,
        type: "off_day",
        note: null,
      });

      if (error) throw error;
    },

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["entries"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["profile"],
        }),
      ]);

      router.back();
    },
  });

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      {/* Header */}
      <View className="items-center mb-8">
        <View className="w-16 h-16 rounded-full bg-offDaySoft border border-offDay items-center justify-center mb-4">
          <Feather name="moon" size={26} color="#B8C0E0" />
        </View>

        <Text className="text-text text-lg font-semibold">
          Off Day İşaretle
        </Text>

        <Text className="text-textMuted text-xs text-center mt-2 max-w-[250px]">
          Bilinçli dinlenme günleri de gelişimin bir parçasıdır. Off Day
          işaretlediğinde serin korunur.
        </Text>
      </View>

      {/* Tarih Seçici */}
      <Pressable
        onPress={() => setShowPicker(true)}
        className="bg-surface border border-border rounded-card px-4 py-4 flex-row items-center justify-between mb-5"
      >
        <Text className="text-textMuted text-xs">Tarih</Text>

        <Text className="text-text font-semibold">
          {date.toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </Text>
      </Pressable>

      {showPicker && (
        <DateTimePicker
          value={date}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, selectedDate) => {
            if (Platform.OS === "android") {
              setShowPicker(false);
            }

            if (selectedDate) {
              setDate(selectedDate);
            }
          }}
        />
      )}

      {/* Hata */}
      {saveMutation.isError && (
        <Text className="text-danger text-xs text-center mb-4">
          {(saveMutation.error as Error).message}
        </Text>
      )}

      {/* Kaydet */}
      <Pressable
        onPress={() => saveMutation.mutate()}
        disabled={!user || saveMutation.isPending}
        className={`rounded-card py-4 items-center mb-3 ${
          saveMutation.isPending || !user
            ? "bg-offDay opacity-60"
            : "bg-offDay"
        }`}
      >
        {saveMutation.isPending ? (
          <ActivityIndicator color="#0B0D0A" />
        ) : (
          <Text className="text-bg text-sm font-semibold">
            Off Day Olarak İşaretle
          </Text>
        )}
      </Pressable>

      {/* Vazgeç */}
      <Pressable
        onPress={() => router.back()}
        disabled={saveMutation.isPending}
        className="items-center py-2"
      >
        <Text className="text-textMuted text-xs">Vazgeç</Text>
      </Pressable>
    </View>
  );
}