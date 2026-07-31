import {
  View,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
// expo-image (RN'in kendi Image'ı DEĞİL): anı akışı ve detay ekranı zaten
// expo-image kullanıyor ve aynı fotoğrafı cacheKey ile diskte tutuyor. RN Image
// AYRI bir cache kullandığı için buradaki fotoğraf her seferinde sıfırdan
// iniyordu — oysa aynı dosya zaten indirilmiş durumdaydı.
import { Image } from "expo-image";
import { Text, TextInput } from "@/components/Typography";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { uploadPhoto, uploadThumb, coverPhotoRow, photoCacheKey } from "@/lib/storage";
import { resizeAndCompress } from "@/lib/capture";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useUnitPreference, displayUnit, toDisplayValue, toMetricValue } from "@/lib/units";
import { validateMeasurementInput, measurementErrorText } from "@/lib/measurementInput";
import { useEditableEntry } from "@/lib/entries";
import { queryKeys } from "@/lib/queryKeys";

/* ---------------- PAGE ---------------- */

export default function EditEntry() {
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : String(params.id);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useEditableEntry(id);
  const { data: allTypes } = useMeasurementTypes(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  const [note, setNote] = useState("");
  // Yeni seçilen fotoğrafın SIKIŞTIRILMIŞ base64'ü — henüz storage'a YÜKLENMEDEN
  // burada bekliyor. Yükleme, Kaydet'e basılınca mutation'ın içinde yapılıyor.
  // Eskiden fotoğraf seçilir seçilmez yükleniyordu: kullanıcı kaydetmeden çıkarsa
  // (ya da üst üste birkaç foto seçerse) storage'da hiçbir kaydın işaret etmediği
  // yetim dosyalar kalıyordu. Yüklemeyi kayda ertelemek bu kaynağı tümüyle kapatır.
  const [pendingImage, setPendingImage] = useState<{ base64: string; thumbBase64: string } | null>(null);
  // SADECE yeni seçilen fotoğrafın yerel uri'si (önizleme için). Kayıtlı fotoğrafın
  // linki artık sorgudan geliyor (bkz. useEntry) — state'te ayrıca tutup efektle
  // doldurmak gereksiz bir bekleme turu yaratıyordu.
  const [localUri, setLocalUri] = useState<string | null>(null);
  // measurement_type_id -> girilen değer (string, boş olabilir)
  const [values, setValues] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const noteRef = useRef<TextInput | null>(null);
  const { scrollRef, onScroll, revealField, keyboardPadding } = useKeyboardFocus();

  // Yeni fotoğraf seçildiyse onu, yoksa kayıtlı olanı göster.
  const displayUri = localUri ?? (data as any)?.photoUrl ?? null;
  // Kayıtlı fotoğrafı gösterirken cacheKey veriyoruz; akış/detay ekranlarıyla
  // aynı anahtar olduğu için disk cache'ten anında geliyor. Yeni seçilen yerel
  // dosyada cacheKey olmaz (henüz storage'da bir karşılığı yok).
  const displayCacheKey =
    !localUri && (data as any)?.photoPath
      ? photoCacheKey((data as any).photoPath, "full")
      : undefined;

  // Tam boy diskte yoksa gösterilecek anlık düşük çözünürlüklü kopya. Yeni
  // seçilen yerel fotoğrafta placeholder'a gerek yok (dosya zaten cihazda).
  const placeholderSource =
    !localUri && (data as any)?.thumbUrl
      ? {
          uri: (data as any).thumbUrl,
          cacheKey: (data as any).thumbPath
            ? photoCacheKey((data as any).thumbPath, "thumb")
            : undefined,
        }
      : undefined;

  /* INIT — form alanlarını sorgu verisiyle doldur.
     Effect'te setState yapmak veri geldikten sonra fazladan bir tam render
     turu (boş form → dolu form) demekti; render sırasında "önceki değerle
     karşılaştır" kalıbı aynı senkronizasyonu commit öncesinde yapıyor
     (react.dev: you-might-not-need-an-effect). Davranış birebir aynı:
     placeholder → gerçek veri geçişinde de yeniden doldurulur. */
  const [prevInit, setPrevInit] = useState<{ data: unknown; unitPref: unknown }>({
    data: undefined,
    unitPref: undefined,
  });
  if (prevInit.data !== data || prevInit.unitPref !== unitPref) {
    setPrevInit({ data, unitPref });
    if (data?.note) setNote(data.note);
    if (data?.measurement_values) {
      const initial: Record<string, string> = {};
      for (const mv of data.measurement_values as any[]) {
        const baseUnit = mv.measurement_types?.unit ?? "";
        initial[mv.measurement_type_id] = String(toDisplayValue(mv.value, baseUnit, unitPref));
      }
      setValues(initial);
    }
  }

  /* ---------------- PICK IMAGE (kırp / kırpmadan seç) ---------------- */

  async function pickImage() {
    if (!user) return;

    // base64'ü picker'dan istemiyoruz: resizeAndCompress zaten uri'den çalışıp
    // küçültülmüş base64'ü üretiyor, ham dosyayı ayrıca belleğe almak gereksiz.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      // Fotoğrafı çekim akışıyla aynı şekilde küçültüp sıkıştırıyoruz ama HENÜZ
      // yüklemiyoruz — base64'ü state'te tutup asıl yüklemeyi Kaydet'e (mutation'a)
      // bırakıyoruz. Önizlemeyi yerel uri'den gösteriyoruz; kaydetmeden çıkılırsa
      // storage'a hiç dosya yazılmamış olur (yetim dosya oluşmaz).
      const { base64, thumbBase64 } = await resizeAndCompress(asset.uri);
      setPendingImage({ base64, thumbBase64 });
      setLocalUri(asset.uri);
    } finally {
      setUploading(false);
    }
  }

  /* ---------------- SAVE ---------------- */

  const updateMutation = useMutation({
    mutationFn: async () => {
      const existingPhotoRow = coverPhotoRow<{
        id: string;
        storage_path: string;
        thumb_path?: string | null;
      }>(data);

      let coverPhotoId = (data as any)?.cover_photo_id ?? existingPhotoRow?.id ?? null;

      // Yeni fotoğraf yalnızca kullanıcı gerçekten seçtiyse (pendingImage dolu)
      // yüklenir — ve yükleme tam da BURADA, kayıt anında yapılır.
      if (pendingImage) {
        if (!user) throw new Error("Giriş yapılmamış");

        const storagePath = await uploadPhoto(user.id, id, pendingImage.base64);

        // Thumbnail opsiyonel — üretilemezse kayıt yine de tam boyla çalışır.
        let newThumbPath: string | null = null;
        try {
          newThumbPath = await uploadThumb(user.id, id, pendingImage.thumbBase64);
        } catch (err) {
          console.warn("thumbnail yüklenemedi, tam boy kullanılacak:", err);
        }

        const { data: newPhoto, error: photoError } = await supabase
          .from("photos")
          .insert({ entry_id: id, storage_path: storagePath, thumb_path: newThumbPath, order_index: 0 })
          .select()
          .single();
        if (photoError) throw photoError;

        coverPhotoId = newPhoto.id;

        if (existingPhotoRow) {
          // Eski kaydın thumbnail'ini de siliyoruz, yoksa storage'da yetim kalır.
          await supabase.storage
            .from("photos")
            .remove(
              [existingPhotoRow.storage_path, existingPhotoRow.thumb_path].filter(Boolean) as string[]
            );
          await supabase.from("photos").delete().eq("id", existingPhotoRow.id);
        }
      }

      const { error: entryError } = await supabase
        .from("entries")
        .update({ note: note || null, cover_photo_id: coverPhotoId })
        .eq("id", id);
      if (entryError) throw entryError;

      const measurementRows = Object.entries(values)
        .map(([typeId, v]) => {
          // Yalnızca geçerli (ok) değerler yazılır. Geçersiz/negatif/çok yüksek
          // girdiler zaten kaydetmeden önce handleUpdate'te engelleniyor; bu
          // filtre son bir güvenlik ağı.
          const baseUnit = allTypes?.find((t) => t.id === typeId)?.unit ?? "";
          const validation = validateMeasurementInput(v, displayUnit(baseUnit, unitPref));
          if (validation.status !== "ok") return null;
          return {
            entry_id: id,
            measurement_type_id: typeId,
            value: toMetricValue(validation.value, baseUnit, unitPref),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (measurementRows.length > 0) {
        const { error: valuesError } = await supabase
          .from("measurement_values")
          .upsert(measurementRows, { onConflict: "entry_id,measurement_type_id" });
        if (valuesError) throw valuesError;
      }

      // Kullanıcı bir ölçüm alanını boşaltarak sildiğinde, sadece dolu satırları
      // upsert etmek yetmiyordu: eski değer DB'de kalıp ekran yenilenince geri
      // geliyordu. Bu entry'de artık değeri olmayan tipleri açıkça siliyoruz.
      const clearedTypeIds = Object.entries(values)
        .filter(([, v]) => v.trim() === "")
        .map(([typeId]) => typeId);

      if (clearedTypeIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("measurement_values")
          .delete()
          .eq("entry_id", id)
          .in("measurement_type_id", clearedTypeIds);
        if (deleteError) throw deleteError;
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.entry.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.entry.edit(id) });
      // Ölçüm değeri değişmiş olabilir — istatistik grafiği (measurement_series)
      // cache'ten eski değeri göstermesin diye onu da tazeliyoruz. Eskiden bu
      // invalidate edilmediği için grafik ancak elle yenileyince güncelleniyordu.
      queryClient.invalidateQueries({ queryKey: queryKeys.measurementSeries.all });
      router.back();
    },
  });

  // Kaydetmeden önce geçersiz/negatif/çok yüksek ölçüm var mı bak — varsa
  // engelle. Kullanıcı hangi alanın sorunlu olduğunu satır altındaki kırmızı
  // uyarıdan görüyor.
  function handleUpdate() {
    const hasInvalid = (allTypes ?? []).some((t) => {
      const s = validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref)).status;
      return s === "invalid" || s === "negative" || s === "too_high";
    });
    if (hasInvalid) {
      Alert.alert("Geçersiz ölçüm", "Bazı ölçüm değerleri geçerli değil. Kırmızı uyarıları düzeltip tekrar dene.");
      return;
    }
    updateMutation.mutate();
  }

  /* ---------------- UI ---------------- */

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#8CE05A" />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      className="flex-1 bg-bg px-5 pt-14"
      contentContainerStyle={{ paddingBottom: keyboardPadding }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-text text-xl font-bold mb-6">Düzenle</Text>

      <Pressable
        onPress={pickImage}
        accessibilityRole="button"
        accessibilityLabel="Fotoğrafı değiştir"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        className="mb-6 relative"
      >
        {displayUri ? (
          <Image
            source={{ uri: displayUri, cacheKey: displayCacheKey }}
            // Tam boy diskte yoksa küçük kopya anında görünsün; boş kare
            // beklemesi yerine kullanıcı düşük çözünürlüklü hâli hemen görüyor,
            // tam boy hazır olunca üstüne geçiyor.
            placeholder={placeholderSource}
            placeholderContentFit="cover"
            // Boyut className ile DEĞİL style ile veriliyor: NativeWind bu
            // projede expo-image'a className uygulamıyor (uygulamadaki diğer
            // tüm expo-image kullanımları da style kullanıyor). className
            // verilince görsel boyutsuz kalıp hiç görünmüyordu.
            // w-full/h-64/rounded-card karşılıkları: %100 / 256 / 20.
            style={{ width: "100%", height: 256, borderRadius: 20 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={(data as any)?.photoPath ?? undefined}
            transition={150}
          />
        ) : (
          <View className="w-full h-64 bg-surface rounded-card items-center justify-center">
            <Text className="text-textMuted text-base">Fotoğraf seç</Text>
          </View>
        )}

        {uploading && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center rounded-card">
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </Pressable>

      <View className="bg-surface border border-border p-4 rounded-card mb-6">
        <Text className="text-textFaint text-sm font-semibold uppercase tracking-wide mb-3">Ölçümler</Text>
        {allTypes?.map((t, i) => {
          const errorText = measurementErrorText(
            validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref))
          );
          return (
            <View key={t.id} className="mb-3">
              <View className="flex-row justify-between items-center">
                {/* Ölçüm adı ikincil bir etiket değil, girilen değerin ne olduğunu
                    söyleyen asıl metin — 14pt gri yerine 16pt gövde boyutu. */}
                <Text className="text-textMuted text-base capitalize">{t.name}</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    ref={(el) => { inputRefs.current[i] = el; }}
                    value={values[t.id] ?? ""}
                    onChangeText={(val) => setValues((prev) => ({ ...prev, [t.id]: val }))}
                    keyboardType="decimal-pad"
                    placeholder={`— ${displayUnit(t.unit, unitPref)}`}
                    placeholderTextColor="#8B8A82"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    // Klavye açıkken odak buraya geçtiğinde kendiliğinden kaydırma
                    // olmadığı için alanı elle görünür alana taşıyoruz.
                    onFocus={() => revealField(inputRefs.current[i])}
                    onSubmitEditing={() => {
                      const next = inputRefs.current[i + 1];
                      if (next) next.focus();
                      else noteRef.current?.focus();
                    }}
                    className={`text-base font-semibold text-right w-20 ${errorText ? "text-danger" : "text-text"}`}
                  />
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Sonraki alana geç"
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    onPress={() => {
                      const next = inputRefs.current[i + 1];
                      if (next) next.focus();
                      else noteRef.current?.focus();
                    }}
                  >
                    <Feather name="chevron-right" size={16} color="#8B8A82" />
                  </Pressable>
                </View>
              </View>
              {errorText ? (
                <Text className="text-danger text-xs mt-1 text-right">{errorText}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <TextInput
        ref={noteRef}
        value={note}
        onChangeText={setNote}
        accessibilityLabel="Not"
        placeholder="Not..."
        placeholderTextColor="#8B8A82"
        onFocus={() => revealField(noteRef.current)}
        className="bg-surface border border-border text-text text-base p-4 rounded-card h-28 mb-6"
        multiline
      />

      {updateMutation.isError ? (
        <Text className="text-danger text-base mb-3">{(updateMutation.error as Error).message}</Text>
      ) : null}

      <Pressable
        onPress={handleUpdate}
        disabled={updateMutation.isPending || uploading}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : updateMutation.isPending || uploading ? 0.7 : 1 })}
        className="bg-accent p-4 rounded-button items-center"
      >
        {updateMutation.isPending ? (
          <ActivityIndicator color="#0B0D0A" />
        ) : (
          <Text className="text-bg text-base font-bold">Kaydet</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        className="mt-4 items-center mb-8"
      >
        <Text className="text-textMuted text-base">İptal</Text>
      </Pressable>
    </ScrollView>
  );
}
