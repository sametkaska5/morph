import { useState, useRef } from "react";
import { View, Image, Pressable, Platform, Alert, ScrollView, ActivityIndicator } from "react-native";
import { Text, TextInput } from "@/components/Typography";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { useCaptureStore } from "@/lib/captureStore";
import { toLocalDateKey } from "@/lib/date";
import { saveEntry, SAVE_ENTRY_MUTATION_KEY, type SaveEntryPayload } from "@/lib/entryMutations";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import { useUnitPreference, displayUnit, toMetricValue } from "@/lib/units";
import { validateMeasurementInput, measurementErrorText } from "@/lib/measurementInput";
import { captureError } from "@/lib/monitoring";
import type { EntryRow } from "@/lib/entries";
import { queryKeys } from "@/lib/queryKeys";

export default function NewEntry() {
  const photo = useCaptureStore((s) => s.photo);
  const clearPhoto = useCaptureStore((s) => s.clear);
  // Fotoğraf var ama base64'ü henüz üretilmedi (arka plan küçültme sürüyor).
  // Bu sürede önizleme görünüyor ama kaydetme beklemeli.
  const photoProcessing = !!photo && !photo.base64;
  const { user } = useAuth();
  const { data: types } = useMeasurementTypes(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const queryClient = useQueryClient();

  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  // Galeriden seçilen eski fotoğrafın EXIF çekim tarihi varsa (bkz. (tabs)/_layout.tsx
  // parseExifDateTime) tarihi otomatik ona ayarlıyoruz — kullanıcı tekrar elle seçmesin.
  const [date, setDate] = useState(() => (photo?.takenAt ? new Date(photo.takenAt) : new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const noteRef = useRef<TextInput | null>(null);
  const { scrollRef, onScroll, revealField, keyboardPadding } = useKeyboardFocus();

  const saveMutation = useMutation<
    Awaited<ReturnType<typeof saveEntry>>,
    Error,
    SaveEntryPayload,
    { previous?: EntryRow[] }
  >({
    mutationKey: SAVE_ENTRY_MUTATION_KEY,
    mutationFn: saveEntry,
    onMutate: async (payload) => {
      // Offline'da bile kaydı hemen Ana Ekran'da görebilmek için timeline cache'ine
      // "senkronize edilecek" işaretli bir kayıt ekliyoruz — gerçek satır Supabase'e
      // yazılınca (online olduğunda) invalidate ile yerini gerçek veriye bırakıyor.
      await queryClient.cancelQueries({ queryKey: queryKeys.entries.timeline() });
      const previous = queryClient.getQueryData<EntryRow[]>(queryKeys.entries.timeline());

      const optimisticEntry: EntryRow = {
        id: `pending-${payload.date}`,
        date: payload.date,
        note: payload.note,
        // Izgarada ~108pt'lik kare gösteriliyor ve bu obje persist edilen React
        // Query cache'i üzerinden AsyncStorage'a yazılıyor — tam boy base64'ü
        // gömmek hem diske yüzlerce KB yazıyor hem render'ı yavaşlatıyordu.
        // Küçük kopya varsa onu kullan, yoksa (eski akış) tam boya düş.
        cover_photo_url: `data:image/jpeg;base64,${payload.thumbBase64 ?? payload.photoBase64}`,
        cover_photo_path: `pending-${payload.date}`,
        pending: true,
      };

      queryClient.setQueryData<EntryRow[]>(queryKeys.entries.timeline(), (old) => {
        const rest = (old ?? []).filter((e) => e.date !== payload.date);
        return [optimisticEntry, ...rest].sort((a, b) => (a.date < b.date ? 1 : -1));
      });

      return { previous };
    },
    onError: (err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.entries.timeline(), context.previous);
      }
      captureError(err, { where: "new.saveEntry" });
      Alert.alert("Kayıt başarısız", (err as Error).message);
    },
  });

  function handleSave() {
    if (!user) return;
    if (!photo) {
      Alert.alert("Fotoğraf bulunamadı", "Kaydetmeden önce bir fotoğraf çekmen/seçmen gerekiyor.");
      return;
    }
    if (!photo.base64) {
      // Arka plan küçültme henüz bitmedi — birkaç saniye içinde hazır olur.
      Alert.alert("Fotoğraf hazırlanıyor", "Fotoğraf işleniyor, bir saniye sonra tekrar dene.");
      return;
    }
    // Geçersiz / negatif / makul olmayan yüksek bir değer varsa kaydetme —
    // kullanıcı hangi alanın sorunlu olduğunu satır altındaki kırmızı uyarıdan
    // görüyor. Sessizce düşürmek yerine engelliyoruz ki yanlışlıkla "kaydettim"
    // sanmasın.
    const hasInvalid = (types ?? []).some((t) => {
      const s = validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref)).status;
      return s === "invalid" || s === "negative" || s === "too_high";
    });
    if (hasInvalid) {
      Alert.alert("Geçersiz ölçüm", "Bazı ölçüm değerleri geçerli değil. Kırmızı uyarıları düzeltip tekrar dene.");
      return;
    }

    // Kullanıcı imperial tercih ettiyse girdiği değerler lb/inch cinsinden — DB'ye
    // her zaman metrik yazıldığı için kaydetmeden önce kg/cm'ye çeviriyoruz.
    const metricValues: Record<string, string> = {};
    for (const t of types ?? []) {
      const v = validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref));
      if (v.status !== "ok") continue;
      metricValues[t.id] = String(toMetricValue(v.value, t.unit, unitPref));
    }

    // İnternet olsun olmasın kayıt anında Ana Ekran'a dönüyoruz — foto zaten optimistic
    // olarak timeline'da görünüyor (onMutate), gerçek senkronizasyon arka planda
    // (online olunca) tamamlanıyor. Kullanıcı offline'da spinner'da beklemek zorunda kalmasın.
    saveMutation.mutate({
      userId: user.id,
      date: toLocalDateKey(date),
      note: note || null,
      values: metricValues,
      photoBase64: photo.base64,
      thumbBase64: photo.thumbBase64,
    });
    clearPhoto();
    router.replace("/(tabs)");
  }

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 20 + keyboardPadding }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row justify-between items-center mb-4">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">Yeni Kayıt</Text>
        {/* Kaydet artık altta tam genişlikte birincil buton olarak duruyor
            (düzenleme ekranıyla aynı desen). Başlığın ortada kalması için
            sol taraftaki chevron kadar boşluk bırakıyoruz. */}
        <View style={{ width: 22 }} />
      </View>

      {photo?.uri ? (
        <Image source={{ uri: photo.uri }} className="w-full h-72 rounded-card mb-4" resizeMode="cover" />
      ) : null}

      <Pressable
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        className="bg-surface border border-border rounded-button px-4 py-4 mb-3 flex-row items-center justify-between"
      >
        <Text className="text-textMuted text-base">Tarih</Text>
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

      <View className="bg-surface border border-border rounded-card p-4 mb-3">
        <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">ÖLÇÜMLER</Text>
        {types?.map((t, i) => {
          const errorText = measurementErrorText(
            validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref))
          );
          return (
            <View key={t.id} className="py-2">
              <View className="flex-row items-center justify-between">
                {/* Ölçüm adı ikincil bir etiket değil, girilen değerin ne olduğunu
                    söyleyen asıl metin — 14pt gri yerine 16pt gövde boyutu. */}
                <Text className="text-textMuted text-base capitalize">{t.name}</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    ref={(el) => { inputRefs.current[i] = el; }}
                    value={values[t.id] ?? ""}
                    onChangeText={(v) => setValues((prev) => ({ ...prev, [t.id]: v }))}
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

      <View className="bg-surface border border-border rounded-card p-4">
        <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">NOT</Text>
        <TextInput
          ref={noteRef}
          value={note}
          onChangeText={setNote}
          placeholder="birkaç kelime yaz..."
          placeholderTextColor="#8B8A82"
          accessibilityLabel="Not"
          onFocus={() => revealField(noteRef.current)}
          multiline
          className="text-text text-base min-h-[64px]"
          maxLength={300}
        />
      </View>

      {/* Birincil aksiyon: üstteki küçük metin bağlantısı yerine altta tam
          genişlikte dolu buton. Düzenleme ekranıyla birebir aynı desen —
          iki kardeş ekranda kaydetmenin yeri ve görünümü artık ayrışmıyor. */}
      <Pressable
        onPress={handleSave}
        disabled={photoProcessing}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : photoProcessing ? 0.7 : 1 })}
        accessibilityRole="button"
        accessibilityLabel="Kaydı kaydet"
        className="bg-accent p-4 rounded-button items-center mt-6 flex-row justify-center gap-2"
      >
        {photoProcessing ? (
          <>
            <ActivityIndicator color="#0B0D0A" />
            <Text className="text-bg text-base font-bold">Hazırlanıyor…</Text>
          </>
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
