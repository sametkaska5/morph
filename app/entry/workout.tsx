import { useRef, useState, type ComponentProps } from "react";
import { View, Pressable, Platform, ScrollView, ActivityIndicator } from "react-native";
import { showAlert } from "@/lib/appAlert";
import { Text, TextInput } from "@/components/Typography";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey, parseLocalDate } from "@/lib/date";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import { useUnitPreference, displayUnit, toDisplayValue, toMetricValue } from "@/lib/units";
import { validateMeasurementInput, measurementErrorText } from "@/lib/measurementInput";
import { useWorkoutDay, saveWorkoutDay, type WorkoutDayType } from "@/lib/workout";
import { queryKeys } from "@/lib/queryKeys";
import { alertError } from "@/lib/alerts";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";

export default function WorkoutDayScreen() {
  const screen = useScreenInsets();
  const params = useLocalSearchParams();
  const paramDate = Array.isArray(params.date) ? params.date[0] : params.date;

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allTypes } = useMeasurementTypes(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  // Tarih route param'dan (istatistik şeridinden) gelebilir; yoksa bugün.
  // parseLocalDate şart: `new Date("2026-08-03")` UTC gece yarısı sayılıyor ve
  // negatif saat dilimlerinde toLocalDateKey bir gün ÖNCEsini üretiyordu — yani
  // kullanıcı 3 Ağustos'a dokunup 2 Ağustos'u kaydediyordu.
  const [date, setDate] = useState(() => (paramDate ? parseLocalDate(paramDate) : new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const dateKey = toLocalDateKey(date);

  const {
    data: existing,
    isLoading: existingLoading,
    error: existingError,
    refetch: refetchExisting,
  } = useWorkoutDay(user?.id, dateKey);
  // O gün zaten fotoğraflı bir kayıtsa (log), bu ekrandan workout olarak upsert
  // etmek entry'nin type'ını değiştirip fotoğrafı akıştan düşürürdü. Bu durumda
  // formu göstermeyip kullanıcıyı o kaydın kendisine yönlendiriyoruz.
  const isPhotoDay = existing?.type === "log";

  const [dayType, setDayType] = useState<WorkoutDayType>("workout");
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const measureRefs = useRef<(TextInput | null)[]>([]);
  const noteRef = useRef<TextInput | null>(null);
  const { scrollRef, onScroll, revealField, keyboardPadding } = useKeyboardFocus();

  // O tarihte kayıt varsa alanları bir kez doldur (düzenleme). Her (tarih, entry)
  // için tek sefer — sonradan allTypes/unitPref geç yüklenip kullanıcının
  // düzenlediği alanları ezmesin diye hydration anahtarıyla kilitliyoruz. allTypes
  // gelmeden hydrate etmiyoruz ki imperial'de ölçümler doğru birime çevrilsin.
  // Effect'te setState yerine render sırasında senkronizasyon — form, veri hazır
  // olur olmaz tek geçişte dolar (react.dev: you-might-not-need-an-effect).
  // `!existingError` şart: sorgu patladığında da existingLoading false oluyor ve
  // existing undefined kalıyordu — form o gün hiç kayıt yokmuş gibi BOŞ doluyor,
  // kullanıcı kaydedince o günün notu ve ölçümleri siliniyordu.
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrationKey = `${dateKey}:${existing?.id ?? "new"}`;
  if (!existingLoading && !existingError && allTypes && hydratedKey !== hydrationKey) {
    setHydratedKey(hydrationKey);
    if (!existing) {
      setDayType("workout");
      setValues({});
      setNote("");
    } else {
      setDayType(existing.type === "off_day" ? "off_day" : "workout");
      setNote(existing.note ?? "");

      const v: Record<string, string> = {};
      for (const mv of existing.measurement_values) {
        const baseUnit = allTypes.find((t) => t.id === mv.measurement_type_id)?.unit ?? "";
        v[mv.measurement_type_id] = String(toDisplayValue(mv.value, baseUnit, unitPref));
      }
      setValues(v);
    }
  }

  const saveMutation = useMutation({
    mutationFn: saveWorkoutDay,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentWeek.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.measurementSeries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutDay.all });
      router.back();
    },
    onError: (err) => alertError("Kayıt başarısız", err, "workout.saveWorkoutDay"),
  });

  function handleSave() {
    if (!user) return;

    const hasInvalid = (allTypes ?? []).some((t) => {
      const s = validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref)).status;
      return s === "invalid" || s === "negative" || s === "too_high";
    });
    if (hasInvalid) {
      showAlert("Geçersiz ölçüm", "Bazı ölçüm değerleri geçerli değil. Kırmızı uyarıları düzeltip tekrar dene.");
      return;
    }

    // Her ölçüm tipini ya metrik değere ya da boş stringe indiriyoruz: boş olanlar
    // saveWorkoutDay'de silinir (düzenlemede ölçüm kaldırma senaryosu).
    const metricValues: Record<string, string> = {};
    for (const t of allTypes ?? []) {
      const v = validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref));
      metricValues[t.id] = v.status === "ok" ? String(toMetricValue(v.value, t.unit, unitPref)) : "";
    }

    saveMutation.mutate({
      userId: user.id,
      date: dateKey,
      type: dayType,
      note: note.trim() || null,
      values: metricValues,
    });
  }

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 20, paddingTop: screen.top, paddingBottom: screen.bottom + keyboardPadding }}
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
        <Text className="text-text text-xl font-bold">Fotoğrafsız gün</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tarih seçici — new.tsx ile aynı desen (etiket/ipucu gerekçesi de orada). */}
      <Pressable
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={`Tarih: ${date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`}
        accessibilityHint="Tarih seçiciyi açar"
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
            if (selected) setDate(selected);
          }}
          onDismiss={() => setShowPicker(false)}
        />
      )}

      {existingError ? (
        // Formu hiç göstermiyoruz: boş formun üzerine basılan "Kaydet" o günün
        // ölçümlerini ve notunu silerdi.
        <ErrorState error={existingError} onRetry={() => refetchExisting()} />
      ) : isPhotoDay ? (
        <View className="bg-surface border border-border rounded-card p-4 mt-1">
          <View className="flex-row items-center gap-3 mb-2">
            <View className="w-9 h-9 rounded-lg bg-accentSoft items-center justify-center">
              <Feather name="image" size={18} color="#8CE05A" />
            </View>
            <Text className="text-text text-base font-semibold flex-1">Bu günün fotoğraflı kaydı var</Text>
          </View>
          <Text className="text-textMuted text-base mb-4">
            Bu güne ait ölçüm ve notları fotoğraflı kaydın üzerinden düzenleyebilirsin. Başka bir gün için
            fotoğrafsız kayıt yapmak istersen yukarıdan tarihi değiştir.
          </Text>
          <Pressable
            onPress={() => router.replace(`/entry/${existing!.id}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraflı kaydı aç"
            className="bg-accent p-4 rounded-button items-center flex-row justify-center gap-2"
          >
            <Feather name="arrow-right" size={16} color="#0B0D0A" />
            <Text className="text-bg text-base font-bold">Kaydı aç</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Gün tipi: Antrenman (fotosuz spor) / Off day (bilinçli dinlenme).
              İstatistik şeridindeki hızlı off-day işaretlemenin karşılığı burada. */}
          <View className="flex-row gap-2 mb-3">
            <DayTypeOption
              label="Antrenman"
              icon="check"
              active={dayType === "workout"}
              onPress={() => setDayType("workout")}
            />
            <DayTypeOption
              label="Off day"
              icon="moon"
              active={dayType === "off_day"}
              onPress={() => setDayType("off_day")}
            />
          </View>

          {/* ÖLÇÜMLER — new/edit ekranlarıyla aynı satır deseni. */}
          <View className="bg-surface border border-border rounded-card p-4 mb-3">
            <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">ÖLÇÜMLER</Text>
            {allTypes?.map((t, i) => {
              const errorText = measurementErrorText(
                validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref))
              );
              return (
                <View key={t.id} className="py-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-textMuted text-base capitalize">{t.name}</Text>
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        ref={(el) => {
                          measureRefs.current[i] = el;
                        }}
                        value={values[t.id] ?? ""}
                        onChangeText={(val) => setValues((prev) => ({ ...prev, [t.id]: val }))}
                        keyboardType="decimal-pad"
                        placeholder={`— ${displayUnit(t.unit, unitPref)}`}
                        placeholderTextColor="#8B8A82"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => revealField(measureRefs.current[i])}
                        onSubmitEditing={() => measureRefs.current[i + 1]?.focus()}
                        className={`text-base font-semibold text-right w-20 ${errorText ? "text-danger" : "text-text"}`}
                      />
                      <Pressable
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Sonraki alana geç"
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        onPress={() => measureRefs.current[i + 1]?.focus()}
                      >
                        <Feather name="chevron-right" size={16} color="#8B8A82" />
                      </Pressable>
                    </View>
                  </View>
                  {errorText ? <Text className="text-danger text-xs mt-1 text-right">{errorText}</Text> : null}
                </View>
              );
            })}
          </View>

          {/* Program ayrı bir ekranda (set logger). Antrenman gününde oraya kısayol. */}
          {dayType === "workout" ? (
            <Pressable
              onPress={() => router.push(`/entry/program?date=${dateKey}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              accessibilityRole="button"
              accessibilityLabel="Antrenman programını düzenle"
              className="bg-surface border border-border rounded-card p-4 mb-3 flex-row items-center gap-3"
            >
              <View className="w-9 h-9 rounded-lg bg-accentSoft items-center justify-center">
                <Feather name="clipboard" size={18} color="#8CE05A" />
              </View>
              <View className="flex-1">
                <Text className="text-text text-base font-semibold">Antrenman programı</Text>
                <Text className="text-textFaint text-sm">Hareket ve setleri ekle</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#8B8A82" />
            </Pressable>
          ) : null}

          {/* NOT — off day nedeni ya da güne dair serbest not. */}
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

          <Pressable
            onPress={handleSave}
            disabled={saveMutation.isPending}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : saveMutation.isPending ? 0.7 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Günü kaydet"
            className="bg-accent p-4 rounded-button items-center mt-6 flex-row justify-center gap-2"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color="#0B0D0A" />
            ) : (
              <Text className="text-bg text-base font-bold">Kaydet</Text>
            )}
          </Pressable>
        </>
      )}

      <Pressable
        onPress={() => router.back()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        className="mt-4 items-center mb-8"
      >
        <Text className="text-textMuted text-base">İptal</Text>
      </Pressable>
    </ScrollView>
  );
}

function DayTypeOption({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Etiketi açıkça veriyoruz: accessibilityState zaten seçili olup
      // olmadığını duyuruyor ama etiket olmadan ekran okuyucu neyin seçili
      // olduğunu söyleyemiyordu.
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-button py-3 border ${
        active ? "bg-accentSoft border-accent" : "bg-surface border-border"
      }`}
    >
      <Feather name={icon} size={16} color={active ? "#8CE05A" : "#8B8A82"} />
      <Text className={`text-base font-semibold ${active ? "text-accent" : "text-textMuted"}`}>{label}</Text>
    </Pressable>
  );
}
