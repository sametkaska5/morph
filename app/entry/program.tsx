import { useRef, useState } from "react";
import { View, Pressable, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Text, TextInput } from "@/components/Typography";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey } from "@/lib/date";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import { useProgramDay, saveProgram, type WorkoutItemDraft, type WorkoutSetDraft } from "@/lib/workout";
import { queryKeys } from "@/lib/queryKeys";
import { alertError } from "@/lib/alerts";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";

const EMPTY_SET: WorkoutSetDraft = { reps: "", weight: "" };
const newExercise = (): WorkoutItemDraft => ({ name: "", sets: [{ ...EMPTY_SET }] });

export default function ProgramScreen() {
  const screen = useScreenInsets();
  const params = useLocalSearchParams();
  const paramDate = Array.isArray(params.date) ? params.date[0] : params.date;

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(() => (paramDate ? new Date(paramDate) : new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const dateKey = toLocalDateKey(date);

  const { data: existing, isLoading, error, refetch } = useProgramDay(user?.id, dateKey);

  const [items, setItems] = useState<WorkoutItemDraft[]>([]);

  const nameRefs = useRef<(TextInput | null)[]>([]);
  const { scrollRef, onScroll, revealField, keyboardPadding } = useKeyboardFocus();

  // O tarihte program varsa bir kez doldur (düzenleme). Her (tarih, entry) için
  // tek sefer — kullanıcının aktif düzenlemesini geç gelen veri ezmesin.
  // Effect'te setState yerine render sırasında senkronizasyon: aynı "bir kez
  // hydrate et" anahtarı state'te tutuluyor, veri hazır olur olmaz form tek
  // geçişte doluyor (react.dev: you-might-not-need-an-effect).
  // `!error` şart: sorgu patladığında da isLoading false oluyor ve existing
  // undefined kalıyordu — form "bu günde hiç hareket yok" diye BOŞ doluyor,
  // kullanıcı kaydedince gerçekte var olan programın üstüne boş yazılıyordu.
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrationKey = `${dateKey}:${existing?.entryId ?? "new"}`;
  if (!isLoading && !error && hydratedKey !== hydrationKey) {
    setHydratedKey(hydrationKey);
    if (!existing || existing.items.length === 0) {
      setItems([]);
    } else {
      setItems(
        existing.items.map((it) => ({
          name: it.name,
          sets:
            it.sets.length > 0
              ? it.sets.map((s) => ({
                  reps: s.reps != null ? String(s.reps) : "",
                  weight: s.weight != null ? String(s.weight) : "",
                }))
              : [{ ...EMPTY_SET }],
        }))
      );
    }
  }

  const saveMutation = useMutation({
    mutationFn: saveProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.programDay.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.entry.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentWeek.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      router.back();
    },
    onError: (err) => alertError("Kayıt başarısız", err, "program.saveProgram"),
  });

  function updateExercise(exIndex: number, patch: Partial<WorkoutItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === exIndex ? { ...it, ...patch } : it)));
  }
  function updateSet(exIndex: number, setIndex: number, patch: Partial<WorkoutSetDraft>) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === exIndex
          ? { ...it, sets: it.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) }
          : it
      )
    );
  }
  function addSet(exIndex: number) {
    // Yeni set son setin değerlerini kopyalar — antrenmanda çoğu set benzer,
    // sadece değişeni düzeltmek en az dokunuş.
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== exIndex) return it;
        const last = it.sets[it.sets.length - 1] ?? EMPTY_SET;
        return { ...it, sets: [...it.sets, { ...last }] };
      })
    );
  }
  function removeSet(exIndex: number, setIndex: number) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === exIndex ? { ...it, sets: it.sets.filter((_, j) => j !== setIndex) } : it
      )
    );
  }

  function handleSave() {
    if (!user) return;
    saveMutation.mutate({ userId: user.id, date: dateKey, items });
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
        <Text className="text-text text-xl font-bold">Antrenman programı</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Etiket + ipucu: new.tsx ile aynı gerekçe. */}
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

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="my-8" />
      ) : error ? (
        // Formu hiç göstermiyoruz: boş formun üzerine basılan "Kaydet" o günün
        // programını silerdi.
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {items.length === 0 ? (
            <View className="bg-surface border border-border rounded-card p-4 mb-3">
              <Text className="text-textMuted text-base">
                Bu günün antrenmanını hareket hareket, set set ekle. Her set kendi tekrar ve ağırlığını tutar.
              </Text>
            </View>
          ) : null}

          {items.map((exercise, exIndex) => (
            <View key={exIndex} className="bg-surface border border-border rounded-card p-4 mb-3">
              <View className="flex-row items-center gap-2 mb-3">
                <TextInput
                  ref={(el) => {
                    nameRefs.current[exIndex] = el;
                  }}
                  value={exercise.name}
                  onChangeText={(val) => updateExercise(exIndex, { name: val })}
                  placeholder="Hareket (örn. Bench Press)"
                  placeholderTextColor="#8B8A82"
                  onFocus={() => revealField(nameRefs.current[exIndex])}
                  className="flex-1 text-text text-base font-semibold"
                  maxLength={60}
                />
                <Pressable
                  onPress={() => setItems((prev) => prev.filter((_, i) => i !== exIndex))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Hareketi sil"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  className="w-8 h-8 items-center justify-center"
                >
                  <Feather name="trash-2" size={16} color="#8B8A82" />
                </Pressable>
              </View>

              {/* Set tablosu başlığı */}
              <View className="flex-row items-center gap-2 mb-1 px-1">
                <Text className="text-textFaint text-xs w-8">Set</Text>
                <Text className="text-textFaint text-xs flex-1 text-center">Kg</Text>
                <Text className="text-textFaint text-xs flex-1 text-center">Tekrar</Text>
                <View className="w-7" />
              </View>

              {exercise.sets.map((set, setIndex) => (
                <View key={setIndex} className="flex-row items-center gap-2 mb-2">
                  <View className="w-8 h-9 rounded-md bg-bg border border-border items-center justify-center">
                    <Text className="text-textMuted text-sm font-semibold">{setIndex + 1}</Text>
                  </View>
                  <TextInput
                    value={set.weight}
                    onChangeText={(val) => updateSet(exIndex, setIndex, { weight: val })}
                    onFocus={() => revealField(nameRefs.current[exIndex])}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor="#8B8A82"
                    className="flex-1 bg-bg border border-border rounded-button px-3 py-2 text-text text-base text-center"
                  />
                  <TextInput
                    value={set.reps}
                    onChangeText={(val) => updateSet(exIndex, setIndex, { reps: val })}
                    onFocus={() => revealField(nameRefs.current[exIndex])}
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor="#8B8A82"
                    className="flex-1 bg-bg border border-border rounded-button px-3 py-2 text-text text-base text-center"
                  />
                  <Pressable
                    onPress={() => removeSet(exIndex, setIndex)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${setIndex + 1}. seti sil`}
                    disabled={exercise.sets.length === 1}
                    style={({ pressed }) => ({ opacity: exercise.sets.length === 1 ? 0.25 : pressed ? 0.6 : 1 })}
                    className="w-7 h-9 items-center justify-center"
                  >
                    <Feather name="x" size={16} color="#8B8A82" />
                  </Pressable>
                </View>
              ))}

              <Pressable
                onPress={() => addSet(exIndex)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                accessibilityRole="button"
                accessibilityLabel="Set ekle"
                className="flex-row items-center justify-center gap-2 border border-dashed border-accent/50 rounded-button py-2 mt-1"
              >
                <Feather name="plus" size={15} color="#8CE05A" />
                <Text className="text-accent text-sm font-semibold">Set ekle</Text>
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={() => setItems((prev) => [...prev, newExercise()])}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Hareket ekle"
            className="flex-row items-center justify-center gap-2 bg-surface border border-border rounded-button py-4 mb-3"
          >
            <Feather name="plus" size={18} color="#8CE05A" />
            <Text className="text-accent text-base font-semibold">Hareket ekle</Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saveMutation.isPending}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : saveMutation.isPending ? 0.7 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Programı kaydet"
            className="bg-accent p-4 rounded-button items-center mt-3 flex-row justify-center gap-2"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color="#0B0D0A" />
            ) : (
              <Text className="text-bg text-base font-bold">Kaydet</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="mt-4 items-center mb-8"
          >
            <Text className="text-textMuted text-base">İptal</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
