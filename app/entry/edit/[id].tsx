import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { uploadPhoto, getPhotoUrl } from "@/lib/storage";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useUnitPreference, displayUnit, toDisplayValue, toMetricValue } from "@/lib/units";

/* ---------------- FETCH ---------------- */

function useEntry(entryId: string) {
  return useQuery({
    queryKey: ["entry", "edit", entryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, note, cover_photo_id, photos!entry_id(id, storage_path), measurement_values(id, value, measurement_type_id, measurement_types(name, unit))"
        )
        .eq("id", entryId)
        .single();

      if (error) throw error;
      return data;
    },
  });
}

/* ---------------- PAGE ---------------- */

export default function EditEntry() {
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : String(params.id);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useEntry(id);
  const { data: allTypes } = useMeasurementTypes(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  const [note, setNote] = useState("");
  // storage'daki gerçek yol (DB'ye yazılacak olan)
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  // ekranda gösterilecek geçici imzalı link ya da yeni seçilen fotoğrafın yerel uri'si
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  // measurement_type_id -> girilen değer (string, boş olabilir)
  const [values, setValues] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const noteRef = useRef<TextInput | null>(null);

  /* INIT */
  useEffect(() => {
    if (data?.note) setNote(data.note);

    const existingPath = (data as any)?.photos?.[0]?.storage_path;
    if (existingPath) {
      setPhotoPath(existingPath);
      getPhotoUrl(existingPath).then(setDisplayUri).catch(() => {});
    }

    if (data?.measurement_values) {
      const initial: Record<string, string> = {};
      for (const mv of data.measurement_values as any[]) {
        const baseUnit = mv.measurement_types?.unit ?? "";
        initial[mv.measurement_type_id] = String(toDisplayValue(mv.value, baseUnit, unitPref));
      }
      setValues(initial);
    }
  }, [data, unitPref]);

  /* ---------------- PICK IMAGE (kırp / kırpmadan seç) ---------------- */

  async function pickImage() {
    if (!user) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.base64) return;

    setUploading(true);
    try {
      const path = await uploadPhoto(user.id, id, asset.base64);
      setPhotoPath(path);
      setDisplayUri(asset.uri);
    } finally {
      setUploading(false);
    }
  }

  /* ---------------- SAVE ---------------- */

  const updateMutation = useMutation({
    mutationFn: async () => {
      const existingPhotoRow = (data as any)?.photos?.[0];
      const photoChanged = photoPath && photoPath !== existingPhotoRow?.storage_path;

      let coverPhotoId = (data as any)?.cover_photo_id ?? existingPhotoRow?.id ?? null;

      if (photoChanged) {
        const { data: newPhoto, error: photoError } = await supabase
          .from("photos")
          .insert({ entry_id: id, storage_path: photoPath, order_index: 0 })
          .select()
          .single();
        if (photoError) throw photoError;

        coverPhotoId = newPhoto.id;

        if (existingPhotoRow) {
          await supabase.storage.from("photos").remove([existingPhotoRow.storage_path]);
          await supabase.from("photos").delete().eq("id", existingPhotoRow.id);
        }
      }

      const { error: entryError } = await supabase
        .from("entries")
        .update({ note: note || null, cover_photo_id: coverPhotoId })
        .eq("id", id);
      if (entryError) throw entryError;

      const measurementRows = Object.entries(values)
        .filter(([, v]) => v.trim() !== "")
        .map(([typeId, v]) => {
          const baseUnit = allTypes?.find((t) => t.id === typeId)?.unit ?? "";
          const num = parseFloat(v.replace(",", "."));
          return {
            entry_id: id,
            measurement_type_id: typeId,
            value: toMetricValue(num, baseUnit, unitPref),
          };
        });

      if (measurementRows.length > 0) {
        const { error: valuesError } = await supabase
          .from("measurement_values")
          .upsert(measurementRows, { onConflict: "entry_id,measurement_type_id" });
        if (valuesError) throw valuesError;
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["entry", id] });
      queryClient.invalidateQueries({ queryKey: ["entry", "edit", id] });
      router.back();
    },
  });

  /* ---------------- UI ---------------- */

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#8CE05A" />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-bg px-5 pt-16"
      enableOnAndroid
      extraScrollHeight={30}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-text text-xl font-bold mb-6">Düzenle</Text>

      <Pressable onPress={pickImage} className="mb-6 relative">
        {displayUri ? (
          <Image source={{ uri: displayUri }} className="w-full h-64 rounded-xl" resizeMode="cover" />
        ) : (
          <View className="w-full h-64 bg-surface rounded-xl items-center justify-center">
            <Text className="text-textMuted">Fotoğraf seç</Text>
          </View>
        )}

        {uploading && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center rounded-xl">
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </Pressable>

      <View className="bg-surface p-4 rounded-xl mb-6">
        <Text className="text-text font-bold mb-3">Ölçümler</Text>
        {allTypes?.map((t, i) => (
          <View key={t.id} className="flex-row justify-between items-center mb-3">
            <Text className="text-textMuted">{t.name}</Text>
            <View className="flex-row items-center gap-1.5">
              <TextInput
                ref={(el) => { inputRefs.current[i] = el; }}
                value={values[t.id] ?? ""}
                onChangeText={(val) => setValues((prev) => ({ ...prev, [t.id]: val }))}
                keyboardType="decimal-pad"
                placeholder={`— ${displayUnit(t.unit, unitPref)}`}
                placeholderTextColor="#5C5A50"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  const next = inputRefs.current[i + 1];
                  if (next) next.focus();
                  else noteRef.current?.focus();
                }}
                className="text-text bg-bg px-3 py-1 rounded w-20 text-right"
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

      <TextInput
        ref={noteRef}
        value={note}
        onChangeText={setNote}
        placeholder="Not..."
        placeholderTextColor="#888"
        className="bg-surface text-text p-4 rounded-xl h-28 mb-6"
        multiline
      />

      {updateMutation.isError ? (
        <Text className="text-danger text-xs mb-3">{(updateMutation.error as Error).message}</Text>
      ) : null}

      <Pressable
        onPress={() => updateMutation.mutate()}
        disabled={updateMutation.isPending || uploading}
        className="bg-accent p-4 rounded-xl items-center"
      >
        {updateMutation.isPending ? (
          <ActivityIndicator color="#0B0D0A" />
        ) : (
          <Text className="text-bg font-bold">Kaydet</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.back()} className="mt-4 items-center mb-8">
        <Text className="text-textMuted">İptal</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}
