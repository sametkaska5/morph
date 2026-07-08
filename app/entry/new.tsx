import { useState, useRef } from "react";
import { View, Text, TextInput, Image, Pressable, ActivityIndicator, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { uploadPhoto } from "@/lib/storage";
import { useCaptureStore } from "@/lib/captureStore";
import { toLocalDateKey } from "@/lib/date";

function useDefaultMeasurementTypes() {
  return useQuery({
    queryKey: ["measurement_types", "defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_types")
        .select("id, name, unit")
        .eq("is_default", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export default function NewEntry() {
  const photo = useCaptureStore((s) => s.photo);
  const clearPhoto = useCaptureStore((s) => s.clear);
  const { user } = useAuth();
  const { data: types } = useDefaultMeasurementTypes();
  const queryClient = useQueryClient();

  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const noteRef = useRef<TextInput | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Giriş yapılmamış");
      if (!photo) throw new Error("Fotoğraf bulunamadı");

      const today = toLocalDateKey(date);

      const { data: entry, error: entryError } = await supabase
        .from("entries")
        .upsert(
          { user_id: user.id, date: today, type: "log", note: note || null },
          { onConflict: "user_id,date" }
        )
        .select()
        .single();
      if (entryError) throw entryError;

      const storagePath = await uploadPhoto(user.id, entry.id, photo.base64);

      const { data: photoRow, error: photoError } = await supabase
        .from("photos")
        .insert({ entry_id: entry.id, storage_path: storagePath, order_index: 0 })
        .select()
        .single();
      if (photoError) throw photoError;

      await supabase.from("entries").update({ cover_photo_id: photoRow.id }).eq("id", entry.id);

      const measurementRows = Object.entries(values)
        .filter(([, v]) => v.trim() !== "")
        .map(([typeId, v]) => ({
          entry_id: entry.id,
          measurement_type_id: typeId,
          value: parseFloat(v.replace(",", ".")),
        }));

      if (measurementRows.length > 0) {
        const { error: valuesError } = await supabase
          .from("measurement_values")
          .upsert(measurementRows, { onConflict: "entry_id,measurement_type_id" });
        if (valuesError) throw valuesError;
      }

      return entry;
    },
    onSuccess: () => {
      clearPhoto();
      queryClient.invalidateQueries({ queryKey: ["entries", "timeline"] });
      router.replace("/(tabs)");
    },
  });

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 18, paddingTop: 60 }}
      enableOnAndroid
      extraScrollHeight={30}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row justify-between items-center mb-4">
        <Pressable onPress={() => router.back()}>
          <Text className="text-text text-lg">←</Text>
        </Pressable>
        <Text className="text-text text-base font-semibold">Yeni Kayıt</Text>
        <Pressable onPress={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <ActivityIndicator color="#8CE05A" size="small" />
          ) : (
            <Text className="text-accent text-sm font-semibold">kaydet</Text>
          )}
        </Pressable>
      </View>

      {photo?.uri ? (
        <Image source={{ uri: photo.uri }} className="w-full h-72 rounded-card mb-4" resizeMode="cover" />
      ) : null}

      <Pressable
        onPress={() => setShowPicker(true)}
        className="bg-surface border border-border rounded-card px-4 py-3 mb-3 flex-row items-center justify-between"
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

      <View className="bg-surface border border-border rounded-card p-3.5 mb-3">
        <Text className="text-textMuted text-[11px] font-semibold mb-2 tracking-wide">ÖLÇÜMLER</Text>
        {types?.map((t, i) => (
          <View key={t.id} className="flex-row items-center justify-between py-2">
            <Text className="text-textMuted text-xs">{t.name}</Text>
            <View className="flex-row items-center gap-1.5">
              <TextInput
                ref={(el) => { inputRefs.current[i] = el; }}
                value={values[t.id] ?? ""}
                onChangeText={(v) => setValues((prev) => ({ ...prev, [t.id]: v }))}
                keyboardType="decimal-pad"
                placeholder={`— ${t.unit}`}
                placeholderTextColor="#5C5A50"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  const next = inputRefs.current[i + 1];
                  if (next) next.focus();
                  else noteRef.current?.focus();
                }}
                className="text-text text-base font-semibold text-right w-20"
              />
              <Pressable
                hitSlop={8}
                onPress={() => {
                  const next = inputRefs.current[i + 1];
                  if (next) next.focus();
                  else noteRef.current?.focus();
                }}
              >
                <Feather name="chevron-right" size={16} color="#5C5A50" />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View className="bg-surface border border-border rounded-card p-3.5">
        <Text className="text-textMuted text-[11px] font-semibold mb-2 tracking-wide">NOT</Text>
        <TextInput
          ref={noteRef}
          value={note}
          onChangeText={setNote}
          placeholder="birkaç kelime yaz..."
          placeholderTextColor="#5C5A50"
          multiline
          className="text-text text-sm min-h-[60px]"
          maxLength={300}
        />
      </View>

      {saveMutation.isError ? (
        <Text className="text-danger text-xs mt-3">{(saveMutation.error as Error).message}</Text>
      ) : null}
    </KeyboardAwareScrollView>
  );
}
