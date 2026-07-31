import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { parseMeasurementInput } from "./measurementInput";
import { queryKeys } from "./queryKeys";

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
  type: string;
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

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .upsert({ user_id: userId, date, type, note }, { onConflict: "user_id,date" })
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
        .select(
          "id, workout_items(name, order_index, workout_sets(reps, weight, order_index))"
        )
        .eq("user_id", userId!)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const items = ((data as any).workout_items ?? [])
        .map((it: any) => ({
          name: it.name as string,
          order_index: it.order_index as number,
          sets: ((it.workout_sets ?? []) as any[])
            .map((s) => ({
              reps: s.reps as number | null,
              weight: s.weight as number | null,
              order_index: s.order_index as number,
            }))
            .sort((a: any, b: any) => a.order_index - b.order_index),
        }))
        .sort((a: any, b: any) => a.order_index - b.order_index);

      return { entryId: (data as any).id as string, items };
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

  for (const it of clean) {
    const { data: itemRow, error: itemError } = await supabase
      .from("workout_items")
      .insert({ entry_id: entryId, name: it.name, order_index: it.order_index })
      .select("id")
      .single();
    if (itemError) throw itemError;

    const setRows = it.sets
      .map((s, i) => ({
        workout_item_id: itemRow.id,
        reps: parseIntOrNull(s.reps),
        weight: parseMeasurementInput(s.weight),
        order_index: i,
      }))
      // Tamamen boş setleri (ne tekrar ne ağırlık) yazma.
      .filter((s) => s.reps !== null || s.weight !== null);

    if (setRows.length > 0) {
      const { error: setError } = await supabase.from("workout_sets").insert(setRows);
      if (setError) throw setError;
    }
  }

  return entryId;
}

function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const num = parseInt(trimmed, 10);
  return Number.isFinite(num) ? num : null;
}
