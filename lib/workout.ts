import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { parseMeasurementInput } from "./measurementInput";
import { queryKeys } from "./queryKeys";
import { captureError } from "./monitoring";
import { invalidateAfterDayWrite } from "./entries";

/**
 * Offline kuyruğu için sabit mutation anahtarları.
 *
 * React Query, uygulamayı kapalıyken offline kuyruğuna alınan
 * (paused) mutation'ları yeniden hydrate ederken yalnızca
 * mutationKey + variables'ı AsyncStorage'dan okuyabiliyor;
 * mutationFn'i hatırlamıyor. Bu yüzden fonksiyonları key'e bağlı
 * registerWorkoutMutationDefaults ile global olarak kaydediyoruz
 * (bkz. app/_layout.tsx) — bkz. SAVE_ENTRY_MUTATION_KEY aynı kalıp.
 */
export const SAVE_WORKOUT_DAY_MUTATION_KEY = ["saveWorkoutDay"] as const;
export const SAVE_PROGRAM_MUTATION_KEY = ["saveProgram"] as const;

/**
 * Fotoğrafsız gün + antrenman programı veri katmanı.
 *
 * İKİ ayrı akış var, ikisi de aynı güne (entries) bağlanır:
 *   1) Fotoğrafsız gün (app/entry/workout.tsx): ölçüm + off-day işaretleme.
 *   2) Antrenman programı (app/entry/program.tsx): hareket + SET SET giriş
 *      (her set kendi tekrar/ağırlığı). Ayrı bir kısayoldan açılır, antrenman
 *      sırasında hızlı girilir.
 *
 * Program setleri workout_items + workout_sets tablolarında tutulur (bkz.
 * 0010_workout_items.sql).
 */

/* ─────────────────────────── Fotoğrafsız gün (ölçüm / off-day) ─────────────────────────── */

export type WorkoutDayType = "workout" | "off_day";

export type WorkoutDayData = {
  id: string;
  date: string;
  // DB'deki check constraint ile eşleştirildi: log|workout|off_day.
  // Eskiden `string` tipindeydi; union ile yanlış değer yazma derleme zamanında yakalanabilir.
  type: "log" | "workout" | "off_day";
  note: string | null;
  measurement_values: { measurement_type_id: string; value: number }[];
};

/** Belirli tarihteki günü (ölçüm/off-day) düzenleme için yükler. Yoksa null. */
export function useWorkoutDay(userId: string | undefined, date: string) {
  return useQuery<WorkoutDayData | null>({
    queryKey: queryKeys.workoutDay.byDate(userId, date),
    enabled: !!userId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, type, note, measurement_values(measurement_type_id, value)")
        .eq("user_id", userId!)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      return (data as WorkoutDayData | null) ?? null;
    },
  });
}

export type SaveWorkoutDayPayload = {
  userId: string;
  date: string;
  type: WorkoutDayType;
  note: string | null;
  /** measurement_type_id -> METRİK değer (ekran imperial'i çeviriyor). */
  values: Record<string, string>;
};

/**
 * Fotoğrafsız günü kaydeder: entry upsert (workout|off_day) + ölçümler.
 * Program (workout_items) BURADA yazılmaz — o ayrı bir ekrandan (saveProgram)
 * yönetilir, aynı entry'ye bağlanır.
 */
export async function saveWorkoutDay(payload: SaveWorkoutDayPayload) {
  const { userId, date, type, note, values } = payload;

  // O gün FOTOĞRAFLI (log) bir kayıtsa tipini DEĞİŞTİRMİYORUZ.
  //
  // Bu ekran fotoğrafsız günler için; `type`'ı koşulsuz yazmak fotoğraflı bir
  // günü 'workout'/'off_day' yapıp anı akışından düşürüyordu — fotoğraf duruyor
  // ama hiçbir listede görünmüyor, yani kullanıcı için kaybolmuş oluyor.
  // Ekran bunu `isPhotoDay` ile engelliyor ama o koruma YALNIZCA arayüzde: gün
  // sorgusu henüz dönmemişken form çizilip Kaydet'e basılabiliyordu. Kural
  // veri katmanına da inmeli.
  //
  // saveProgram aynı kararı zaten veriyor ("VARSA type'ını DEĞİŞTİRMEZ") —
  // iki yazma yolu artık aynı davranıyor. workout ↔ off_day geçişi etkilenmiyor;
  // korunan yalnızca 'log'.
  const { data: existing } = await supabase
    .from("entries")
    .select("type")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  const safeType = existing?.type === "log" ? "log" : type;

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .upsert({ user_id: userId, date, type: safeType, note }, { onConflict: "user_id,date" })
    .select()
    .single();
  if (entryError) throw entryError;

  const filledRows = Object.entries(values)
    .map(([typeId, v]) => {
      const num = parseMeasurementInput(v);
      return num === null ? null : { entry_id: entry.id, measurement_type_id: typeId, value: num };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (filledRows.length > 0) {
    const { error } = await supabase
      .from("measurement_values")
      .upsert(filledRows, { onConflict: "entry_id,measurement_type_id" });
    if (error) throw error;
  }

  const clearedTypeIds = Object.entries(values)
    .filter(([, v]) => v.trim() === "")
    .map(([typeId]) => typeId);
  if (clearedTypeIds.length > 0) {
    const { error } = await supabase
      .from("measurement_values")
      .delete()
      .eq("entry_id", entry.id)
      .in("measurement_type_id", clearedTypeIds);
    if (error) throw error;
  }

  return entry;
}

/* ─────────────────────────── Antrenman programı (set set) ─────────────────────────── */

/** Ekrandaki bir setin ham (string) hâli. */
export type WorkoutSetDraft = { reps: string; weight: string };
/** Ekrandaki bir hareketin ham hâli: ad + set listesi. */
export type WorkoutItemDraft = { name: string; sets: WorkoutSetDraft[] };

export type ProgramData = {
  entryId: string;
  items: {
    name: string;
    order_index: number;
    sets: { reps: number | null; weight: number | null; order_index: number }[];
  }[];
};

/** Belirli tarihteki programı (varsa) yükler. Yoksa null. */
export function useProgramDay(userId: string | undefined, date: string) {
  return useQuery<ProgramData | null>({
    queryKey: queryKeys.programDay.byDate(userId, date),
    enabled: !!userId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, workout_items(name, order_index, workout_sets(reps, weight, order_index))")
        .eq("user_id", userId!)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // Sıralamayı JS'te yapıyoruz
      const items = (data.workout_items ?? [])
        .map((it) => ({
          name: it.name,
          order_index: it.order_index,
          sets: (it.workout_sets ?? [])
            .map((s) => ({
              reps: s.reps,
              weight: s.weight,
              order_index: s.order_index,
            }))
            .sort((a, b) => a.order_index - b.order_index),
        }))
        .sort((a, b) => a.order_index - b.order_index);

      return { entryId: data.id, items };
    },
  });
}

export type AllWorkoutsRow = {
  id: string;
  date: string;
  note: string | null;
  items: {
    name: string;
    sets: { reps: number | null; weight: number | null }[];
  }[];
};

export function useAllWorkouts(userId: string | undefined) {
  return useQuery<AllWorkoutsRow[]>({
    queryKey: queryKeys.workoutsList.byUser(userId),
    enabled: !!userId,
    queryFn: async () => {
      // BÜTÜN KAYITLARI ÇEK
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, type, workout_items(name, order_index, workout_sets(reps, weight, order_index))",
        )
        .eq("user_id", userId!)
        .order("date", { ascending: false });

      if (error) throw error;

      // JAVASCRIPT İLE FİLTRELE:
      // Sadece "gerçekten bir program/not girilmiş" olan günleri göster.
      // 1. Ya içinde özel hareket (workout_items) tablosu dolu olacak
      // 2. Ya da tipi 'workout' (fotoğrafsız) olup içine en azından bir NOT yazılmış olacak.
      // Tamamen boş (ne hareket ne not) olan günleri göstermez.
      const filteredData = (data || []).filter((entry) => {
        const hasExercises = entry.workout_items && entry.workout_items.length > 0;
        const hasNote = entry.note && entry.note.trim().length > 0;

        return hasExercises || (entry.type === "workout" && hasNote);
      });

      console.log(
        "FETCHED WORKOUTS:",
        JSON.stringify(
          filteredData.map((d) => ({
            date: d.date,
            type: d.type,
            itemsCount: d.workout_items ? d.workout_items.length : 0,
          })),
          null,
          2,
        ),
      );

      return filteredData.map((entry) => ({
        id: entry.id,
        date: entry.date,
        note: entry.note,
        items: (entry.workout_items || [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((item: any) => ({
            name: item.name,
            sets: (item.workout_sets || [])
              .sort((a: any, b: any) => a.order_index - b.order_index)
              .map((s: any) => ({
                reps: s.reps,
                weight: s.weight,
              })),
          })),
      }));
    },
  });
}

export type SaveProgramPayload = {
  userId: string;
  date: string;
  items: WorkoutItemDraft[];
};

/**
 * Günün programını kaydeder. Gün için entry yoksa oluşturur (type='workout');
 * VARSA type'ını DEĞİŞTİRMEZ — böylece fotoğraflı (log) bir güne program eklemek
 * o günü akıştan düşürmez. workout_items sil-ve-yeniden-yaz (setler cascade ile
 * hareketle birlikte silinir).
 */
export async function saveProgram(payload: SaveProgramPayload) {
  const { userId, date, items } = payload;

  const clean = items
    .map((it, i) => ({ name: it.name.trim(), order_index: i, sets: it.sets }))
    .filter((it) => it.name);

  const { data: existing, error: selError } = await supabase
    .from("entries")
    .select("id")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (selError) throw selError;

  let entryId = existing?.id ?? null;

  if (!entryId) {
    // Boş program + gün yoksa: boşuna entry yaratma.
    if (clean.length === 0) return null;
    const { data, error } = await supabase
      .from("entries")
      .insert({ user_id: userId, date, type: "workout" })
      .select("id")
      .single();
    if (error) throw error;
    entryId = data.id;
  }

  const { error: delError } = await supabase.from("workout_items").delete().eq("entry_id", entryId);
  if (delError) throw delError;

  if (clean.length === 0) return entryId;

  // Tüm hareketleri TEK seferde ekle ve oluşturulan id'leri geri al.
  // Eskiden: her hareket için ayrı roundtrip (N+1) — 10 hareket = 10 DB çağrısı.
  // Şimdi: tek bir INSERT ... RETURNING id, order_index.
  const { data: itemRows, error: itemError } = await supabase
    .from("workout_items")
    .insert(clean.map((it) => ({ entry_id: entryId, name: it.name, order_index: it.order_index })))
    .select("id, order_index");
  if (itemError) throw itemError;

  // Dönen satırları order_index → id olarak eşleştiriyoruz.
  // clean[i].order_index = i garantisi var (üstteki map) ve DB bu değeri
  // aynen saklıyor, yani eşleştirme kaymaz.
  const itemIdByIndex = new Map((itemRows ?? []).map((r) => [r.order_index, r.id]));

  // Tüm setleri tek bir dizi halinde topla, ardından TEK INSERT.
  // Eskiden: hareket başına ayrı roundtrip — 10 hareket × set = çok sayıda çağrı.
  const allSetRows = clean.flatMap((it) => {
    const itemId = itemIdByIndex.get(it.order_index);
    if (!itemId) return [];
    return it.sets
      .map((s, i) => ({
        workout_item_id: itemId,
        reps: parseIntOrNull(s.reps),
        weight: parseMeasurementInput(s.weight),
        order_index: i,
      }))
      .filter((s) => s.reps !== null || s.weight !== null);
  });

  if (allSetRows.length > 0) {
    const { error: setError } = await supabase.from("workout_sets").insert(allSetRows);
    if (setError) throw setError;
  }

  return entryId;
}

function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const num = parseInt(trimmed, 10);
  return Number.isFinite(num) ? num : null;
}

/**
 * saveWorkoutDay ve saveProgram mutationFn'lerini queryClient'a kaydeder.
 *
 * saveEntry'nin registerEntryMutationDefaults ile aynı kalıbı izler:
 * restart sonrası resumePausedMutations() bu kayıtlı fonksiyonu bulup
 * offline'da kuyruğa alınmış kayıtları senkronize edebilir.
 *
 * İÇERİK KISITLAMASI — Yalnızca JSON-serileştirilebilir payload:
 *   SaveWorkoutDayPayload: {userId, date, type, note, values} ✔
 *   SaveProgramPayload:    {userId, date, items[]}            ✔
 * Her iki tip de AsyncStorage'a güvenle yazılıp okunabilir.
 */
export function registerWorkoutMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(SAVE_WORKOUT_DAY_MUTATION_KEY, {
    mutationFn: saveWorkoutDay,
    onSuccess: () => invalidateAfterDayWrite(queryClient),
    onError: (err) => captureError(err, { where: "saveWorkoutDay" }),
  });

  queryClient.setMutationDefaults(SAVE_PROGRAM_MUTATION_KEY, {
    mutationFn: saveProgram,
    onSuccess: () => invalidateAfterDayWrite(queryClient),
    onError: (err) => captureError(err, { where: "saveProgram" }),
  });
}
