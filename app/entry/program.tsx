import { theme } from "@/lib/theme";
import { useRef, useState, useEffect } from "react";
import { View, Platform, ScrollView, ActivityIndicator } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text, TextInput } from "@/components/Typography";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey, parseLocalDate } from "@/lib/date";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import {
  useProgramDay,
  saveProgram,
  type WorkoutItemDraft,
  type WorkoutSetDraft,
  SAVE_PROGRAM_MUTATION_KEY,
} from "@/lib/workout";
import { invalidateAfterDayWrite } from "@/lib/entries";
import { alertError } from "@/lib/alerts";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";
import { hapticSuccess } from "@/lib/haptics";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** AsyncStorage anahtarı — tarih başına bir taslak slot. */
const draftKey = (date: string) => `program-draft:${date}`;

const EMPTY_SET: WorkoutSetDraft = { reps: "", weight: "" };
const newExercise = (): WorkoutItemDraft => ({ name: "", sets: [{ ...EMPTY_SET }] });

export default function ProgramScreen() {
  const screen = useScreenInsets();
  const params = useLocalSearchParams();
  const paramDate = Array.isArray(params.date) ? params.date[0] : params.date;

  const { user } = useAuth();
  const queryClient = useQueryClient();

  // parseLocalDate: gerekçesi entry/workout.tsx'te — route'tan gelen tarih
  // anahtarı UTC olarak okunursa program yanlış güne yazılıyor.
  const [date, setDate] = useState(() => (paramDate ? parseLocalDate(paramDate) : new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const dateKey = toLocalDateKey(date);

  const { data: existing, isLoading, error, refetch } = useProgramDay(user?.id, dateKey);

  const [items, setItems] = useState<WorkoutItemDraft[]>([]);
  // Hangi hareketin silineceği — null ise ConfirmDialog kapalı.
  const [deleteExIndex, setDeleteExIndex] = useState<number | null>(null);
  // Kaydedilmemiş değişiklik uyarısı.
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Kullanıcı herhangi bir şey değiştirdi mi? Ref: re-render gerektirmiyor.
  const isDirty = useRef(false);
  /**
   * Taslak geri yüklendi mi?
   *
   * Sunucu verisi (hydration) taslakı ezmesin diye kullanılıyor.
   * AsyncStorage okuması async olduğundan render-time hydration
   * taslaktan önce çalışabilir; bu ref’i kontrol ederek ikinci
   * geçişi engelliyoruz.
   */
  const draftRestored = useRef(false);

  // Taslak geri yükleme: mount’ta AsyncStorage’dan oku.
  useEffect(() => {
    async function restoreDraft() {
      try {
        const raw = await AsyncStorage.getItem(draftKey(dateKey));
        if (raw) {
          const { items: saved } = JSON.parse(raw) as { items: WorkoutItemDraft[] };
          setItems(saved);
          isDirty.current = true;
          draftRestored.current = true;
        }
      } catch {
        // Okunamadıysa sessizce geç — sunucu verisi devreye girer.
      }
    }
    restoreDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // yalnızca mount’ta

  // Taslak kaydetme: items her değiştiğinde 800ms debounce ile yaz.
  useEffect(() => {
    if (!isDirty.current) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(draftKey(dateKey), JSON.stringify({ items })).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [items, dateKey]);

  const nameRefs = useRef<(TextInput | null)[]>([]);
  // Her setin tekrar (reps) alanı için ref — kg alanından "İleri" ile geçiş.
  // Anahtar: `${egzersizIndex}-${setIndex}`
  const repsRefs = useRef<Record<string, TextInput | null>>({});
  // Silinen son set — "Set ekle" ile geri alınabilir. Egzersiz başına bir slot.
  const lastDeletedSets = useRef<Record<number, WorkoutSetDraft>>({});
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
  if (!isLoading && !error && hydratedKey !== hydrationKey && !draftRestored.current) {
    setHydratedKey(hydrationKey);
    isDirty.current = false; // yeni veri geldi, form temiz
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
        })),
      );
    }
  }

  const saveMutation = useMutation({
    mutationKey: SAVE_PROGRAM_MUTATION_KEY,
    mutationFn: saveProgram,
    onSuccess: () => {
      // Liste tek yerde (bkz. lib/entries.ts invalidateAfterDayWrite) — burada
      // workoutDay atlanmıştı, yani program yazılan gün fotoğrafsız gün ekranında
      // eski hâliyle görünüyordu.
      invalidateAfterDayWrite(queryClient);
      hapticSuccess();
      router.back();
    },
    onError: (err) => alertError("Kayıt başarısız", err, "program.saveProgram"),
  });

  function updateExercise(exIndex: number, patch: Partial<WorkoutItemDraft>) {
    isDirty.current = true;
    setItems((prev) => prev.map((it, i) => (i === exIndex ? { ...it, ...patch } : it)));
  }
  function updateSet(exIndex: number, setIndex: number, patch: Partial<WorkoutSetDraft>) {
    isDirty.current = true;
    setItems((prev) =>
      prev.map((it, i) =>
        i === exIndex
          ? { ...it, sets: it.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) }
          : it,
      ),
    );
  }
  function addSet(exIndex: number) {
    isDirty.current = true;
    // Silinen son set varsa geri getir (geri al); yoksa boş set ekle.
    const recovered = lastDeletedSets.current[exIndex];
    if (recovered) {
      delete lastDeletedSets.current[exIndex];
      setItems((prev) =>
        prev.map((it, i) => (i === exIndex ? { ...it, sets: [...it.sets, { ...recovered }] } : it)),
      );
    } else {
      setItems((prev) =>
        prev.map((it, i) => (i === exIndex ? { ...it, sets: [...it.sets, { ...EMPTY_SET }] } : it)),
      );
    }
  }
  function removeSet(exIndex: number, setIndex: number) {
    isDirty.current = true;
    // Silinen seti sakla — "Set ekle" ile geri alınabilir.
    setItems((prev) => {
      const exercise = prev[exIndex];
      if (exercise) {
        lastDeletedSets.current[exIndex] = { ...exercise.sets[setIndex] };
      }
      return prev.map((it, i) =>
        i === exIndex ? { ...it, sets: it.sets.filter((_, j) => j !== setIndex) } : it,
      );
    });
  }

  function handleSave() {
    if (!user) return;
    isDirty.current = false;
    AsyncStorage.removeItem(draftKey(dateKey)).catch(() => {});
    saveMutation.mutate({ userId: user.id, date: dateKey, items });
  }

  function handleBack() {
    if (isDirty.current) {
      setShowDiscardConfirm(true);
    } else {
      router.back();
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      className="flex-1 bg-bg"
      contentContainerStyle={{
        padding: 20,
        paddingTop: screen.top,
        paddingBottom: screen.bottom + keyboardPadding,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row justify-between items-center mb-4">
        <PressableFade
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          dim={0.7}
        >
          <Feather name="chevron-left" size={22} color={theme.colors.text} />
        </PressableFade>
        <Text className="text-text text-2xl font-bold">Antrenman programı</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Etiket + ipucu: new.tsx ile aynı gerekçe. */}
      <PressableFade
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={`Tarih: ${date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`}
        accessibilityHint="Tarih seçiciyi açar"
        dim={0.7}
        className="bg-surface border border-border rounded-button px-4 py-4 mb-3 flex-row items-center justify-between"
      >
        <Text className="text-textMuted text-lg">Tarih</Text>
        <Text className="text-text text-lg font-semibold">
          {date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </Text>
      </PressableFade>

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
        <ActivityIndicator color={theme.colors.accent} className="my-8" />
      ) : error ? (
        // Formu hiç göstermiyoruz: boş formun üzerine basılan "Kaydet" o günün
        // programını silerdi.
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {items.length === 0 ? (
            <View className="bg-surface border border-border rounded-card p-4 mb-3">
              <Text className="text-textMuted text-lg">
                Bu günün antrenmanını hareket hareket, set set ekle. Her set kendi tekrar ve
                ağırlığını tutar.
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
                  placeholderTextColor={theme.colors.textFaint}
                  onFocus={() => revealField(nameRefs.current[exIndex])}
                  className="flex-1 text-text text-lg font-semibold"
                  maxLength={60}
                />
                <PressableFade
                  onPress={() => setDeleteExIndex(exIndex)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Hareketi sil"
                  className="w-8 h-8 items-center justify-center"
                >
                  <Feather name="trash-2" size={16} color={theme.colors.textFaint} />
                </PressableFade>
              </View>

              {/* Set tablosu başlığı */}
              <View className="flex-row items-center gap-2 mb-1 px-1">
                <Text className="text-textFaint text-sm w-8">Set</Text>
                <Text className="text-textFaint text-sm flex-1 text-center">Kg</Text>
                <Text className="text-textFaint text-sm flex-1 text-center">Tekrar</Text>
                <View className="w-7" />
              </View>

              {exercise.sets.map((set, setIndex) => (
                <View key={setIndex} className="flex-row items-center gap-2 mb-2">
                  <View className="w-8 h-9 rounded-md bg-bg border border-border items-center justify-center">
                    <Text className="text-textMuted text-base font-semibold">{setIndex + 1}</Text>
                  </View>
                  <TextInput
                    value={set.weight}
                    onChangeText={(val) => updateSet(exIndex, setIndex, { weight: val })}
                    onFocus={() => revealField(nameRefs.current[exIndex])}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => repsRefs.current[`${exIndex}-${setIndex}`]?.focus()}
                    placeholder="—"
                    placeholderTextColor={theme.colors.textFaint}
                    className="flex-1 bg-bg border border-border rounded-button px-3 py-2 text-text text-lg text-center"
                  />
                  <TextInput
                    ref={(el) => {
                      repsRefs.current[`${exIndex}-${setIndex}`] = el;
                    }}
                    value={set.reps}
                    onChangeText={(val) => updateSet(exIndex, setIndex, { reps: val })}
                    onFocus={() => revealField(nameRefs.current[exIndex])}
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor={theme.colors.textFaint}
                    className="flex-1 bg-bg border border-border rounded-button px-3 py-2 text-text text-lg text-center"
                  />
                  <PressableFade
                    onPress={() => removeSet(exIndex, setIndex)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${setIndex + 1}. seti sil`}
                    disabled={exercise.sets.length === 1}
                    dim={exercise.sets.length === 1 ? 0.25 : 0.6}
                    baseOpacity={exercise.sets.length === 1 ? 0.25 : 1}
                    className="w-7 h-9 items-center justify-center"
                  >
                    <Feather name="x" size={16} color={theme.colors.textFaint} />
                  </PressableFade>
                </View>
              ))}

              <PressableFade
                onPress={() => addSet(exIndex)}
                dim={0.7}
                accessibilityRole="button"
                accessibilityLabel="Set ekle"
                className="flex-row items-center justify-center gap-2 border border-dashed border-accent/50 rounded-button py-2 mt-1"
              >
                <Feather name="plus" size={15} color={theme.colors.accent} />
                <Text className="text-accent text-base font-semibold">Set ekle</Text>
              </PressableFade>
            </View>
          ))}

          <PressableFade
            onPress={() => {
              isDirty.current = true;
              setItems((prev) => [...prev, newExercise()]);
            }}
            dim={0.85}
            accessibilityRole="button"
            accessibilityLabel="Hareket ekle"
            className="flex-row items-center justify-center gap-2 bg-surface border border-border rounded-button py-4 mb-3"
          >
            <Feather name="plus" size={18} color={theme.colors.accent} />
            <Text className="text-accent text-lg font-semibold">Hareket ekle</Text>
          </PressableFade>

          <PressableFade
            onPress={handleSave}
            disabled={saveMutation.isPending}
            dim={0.85}
            baseOpacity={saveMutation.isPending ? 0.7 : 1}
            accessibilityRole="button"
            accessibilityLabel="Programı kaydet"
            className="bg-accent p-4 rounded-button items-center mt-3 flex-row justify-center gap-2"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <Text className="text-bg text-lg font-bold">Kaydet</Text>
            )}
          </PressableFade>

          <PressableFade
            onPress={handleBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            className="mt-4 items-center mb-8"
          >
            <Text className="text-textMuted text-lg">İptal</Text>
          </PressableFade>
        </>
      )}

      <ConfirmDialog
        visible={deleteExIndex !== null}
        icon="trash-2"
        danger
        title="Hareketi sil?"
        message={
          deleteExIndex !== null && items[deleteExIndex]?.name
            ? `"${items[deleteExIndex].name}" ve tüm setleri silinecek.`
            : "Bu hareketi ve tüm setlerini silmek istediğine emin misin?"
        }
        confirmLabel="Sil"
        onConfirm={() => {
          if (deleteExIndex !== null) {
            setItems((prev) => prev.filter((_, i) => i !== deleteExIndex));
          }
          setDeleteExIndex(null);
        }}
        onClose={() => setDeleteExIndex(null)}
      />

      <ConfirmDialog
        visible={showDiscardConfirm}
        icon="alert-triangle"
        danger
        title="Değişiklikler kaybolacak"
        message="Kaydedilmemiş değişikliklerini kaybedeceksin. Çıkmak istediğine emin misin?"
        confirmLabel="Çık"
        cancelLabel="Geri dön"
        onConfirm={() => {
          isDirty.current = false;
          draftRestored.current = false;
          AsyncStorage.removeItem(draftKey(dateKey)).catch(() => {});
          setShowDiscardConfirm(false);
          router.back();
        }}
        onClose={() => setShowDiscardConfirm(false)}
      />
    </ScrollView>
  );
}
