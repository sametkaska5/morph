import {
  View,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
// expo-image (RN'in kendi Image'ı DEĞİL): anı akışı ve detay ekranı zaten
// expo-image kullanıyor ve aynı fotoğrafı cacheKey ile diskte tutuyor. RN Image
// AYRI bir cache kullandığı için buradaki fotoğraf her seferinde sıfırdan
// iniyordu — oysa aynı dosya zaten indirilmiş durumdaydı.
import { Image } from "expo-image";
import { Text, TextInput } from "@/components/Typography";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { uploadPhoto, uploadThumb, getPhotoUrl, coverPhotoRow, photoCacheKey } from "@/lib/storage";
import { resizeAndCompress } from "@/lib/capture";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useUnitPreference, displayUnit, toDisplayValue, toMetricValue } from "@/lib/units";

/* ---------------- FETCH ---------------- */

/**
 * Düzenleme ekranı hemen HER ZAMAN başka bir ekrandan (anı akışı, detay, ana
 * ekran) açılıyor ve o ekranlar bu kaydı zaten çekmiş, fotoğrafını da diske
 * indirmiş oluyor. Ağ sorgusunu beklemek yerine o cache'lerden kaydı anında
 * bulup placeholder olarak veriyoruz: ekran spinner göstermeden açılıyor,
 * fotoğraf cacheKey ile diskten geliyor. Gerçek sorgu arka planda tamamlanıp
 * yerini alıyor (ölçüm değerleri gibi placeholder'da olmayan alanları doldurur).
 */
type EntrySeed = {
  note: string | null;
  photoUrl: string | null; // tam boy
  photoPath: string | null; // tam boy storage yolu (cacheKey path@full)
  thumbUrl: string | null; // küçük kopya (anlık placeholder)
  thumbPath: string | null; // küçük kopya yolu (cacheKey path@thumb)
};

function findEntryInCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  entryId: string
): EntrySeed | null {
  const seed: EntrySeed = { note: null, photoUrl: null, photoPath: null, thumbUrl: null, thumbPath: null };
  let found = false;

  // Anı akışı (sonsuz sorgu) ve detay ekranı: TAM BOY photoUrl + photoPath.
  const capsule = queryClient.getQueryData<{ pages: any[][] }>(["entries", "capsule"]);
  for (const page of capsule?.pages ?? []) {
    const hit = page.find((e: any) => e.id === entryId);
    if (hit) {
      seed.note = hit.note ?? null;
      seed.photoUrl = hit.photoUrl ?? null;
      seed.photoPath = hit.photoPath ?? null;
      found = true;
      break;
    }
  }
  if (!seed.photoUrl) {
    const detail = queryClient.getQueryData<any>(["entry", entryId]);
    if (detail) {
      seed.note = seed.note ?? detail.note ?? null;
      seed.photoUrl = detail.photoUrl ?? null;
      seed.photoPath = detail.photoPath ?? null;
      found = true;
    }
  }

  // Ana ekran ızgarası: KÜÇÜK kopya (thumb). Tam boy diskte olmasa da bu genelde
  // cache'te oluyor ve anlık placeholder olarak gösterilebiliyor.
  const timeline = queryClient.getQueryData<any[]>(["entries", "timeline"]);
  const gridHit = timeline?.find((e: any) => e.id === entryId);
  if (gridHit?.cover_photo_url) {
    seed.thumbUrl = gridHit.cover_photo_url;
    seed.thumbPath = gridHit.cover_photo_path ?? null;
    found = true;
  }

  return found ? seed : null;
}

function useEntry(entryId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["entry", "edit", entryId],
    // İmzalı linkler 6 saat geçerli; ekranı her açışta sıfırdan çekmek yerine
    // cache'ten anında gösteriyoruz (uygulamanın geri kalanıyla aynı süre).
    staleTime: 1000 * 60 * 30,
    // Fotoğrafı ve notu anında gösterebilmek için başka ekranların cache'inden
    // tohumla; gerçek fetch tamamlanınca ölçümlerle birlikte tam veri gelir.
    placeholderData: () => {
      const seed = findEntryInCaches(queryClient, entryId);
      if (!seed) return undefined;
      return {
        id: entryId,
        note: seed.note,
        photoUrl: seed.photoUrl,
        photoPath: seed.photoPath,
        thumbUrl: seed.thumbUrl,
        thumbPath: seed.thumbPath,
        measurement_values: [],
      } as any;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, note, cover_photo_id, photos!entry_id(id, storage_path, thumb_path), measurement_values(id, value, measurement_type_id, measurement_types(name, unit))"
        )
        .eq("id", entryId)
        .single();

      if (error) throw error;

      // İmzalı linkleri BURADA üretiyoruz. Eskiden bu iş render sonrası bir
      // useEffect'te yapılıyordu: kayıt sorgusu bitiyor → efekt çalışıyor →
      // imzalama isteği gidiyor → ancak ondan sonra fotoğraf inmeye başlıyordu.
      // Tam boy VE küçük kopyayı paralel imzalıyoruz; küçük kopya, tam boy diskte
      // yoksa anlık placeholder olarak gösterilip "boş kare" beklemesini önlüyor.
      const coverRow = coverPhotoRow<{ storage_path: string; thumb_path?: string | null }>(data);
      const photoPath = coverRow?.storage_path ?? null;
      const thumbPath = coverRow?.thumb_path ?? null;

      const [photoUrl, thumbUrl] = await Promise.all([
        photoPath ? getPhotoUrl(photoPath, "full").catch(() => null) : Promise.resolve(null),
        thumbPath ? getPhotoUrl(thumbPath).catch(() => null) : Promise.resolve(null),
      ]);

      return { ...data, photoUrl, photoPath, thumbUrl, thumbPath };
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
  const inputRefs = useRef<Array<TextInput | null>>([]);
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

  /* INIT */
  useEffect(() => {
    if (data?.note) setNote(data.note);

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
        {allTypes?.map((t, i) => (
          <View key={t.id} className="flex-row justify-between items-center mb-3">
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
                className="text-text text-base font-semibold text-right w-20"
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
        ))}
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
        onPress={() => updateMutation.mutate()}
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
