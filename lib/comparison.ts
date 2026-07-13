import { supabase } from "./supabase";
import { getPhotoUrl } from "./storage";

export type ComparisonSide = {
  entryId: string;
  date: string;
  photoUrl: string | null;
  measurements: Record<string, number>; // measurement_type_id -> value
};

export type ComparisonData = {
  start: ComparisonSide;
  end: ComparisonSide;
  daysBetween: number;
  types: { id: string; name: string; unit: string; targetDirection: string }[];
};

async function loadSide(entryRow: any): Promise<ComparisonSide> {
  const photoPath = entryRow.photos?.storage_path;
  const measurements: Record<string, number> = {};
  for (const mv of entryRow.measurement_values ?? []) {
    measurements[mv.measurement_type_id] = mv.value;
  }
  return {
    entryId: entryRow.id,
    date: entryRow.date,
    photoUrl: photoPath ? await getPhotoUrl(photoPath) : null,
    measurements,
  };
}

export async function fetchDefaultComparison(userId: string): Promise<ComparisonData | null> {
  const selectStr =
    "id, date, photos!cover_photo_id(storage_path), measurement_values(measurement_type_id, value)";

  const { data: firstEntry } = await supabase
    .from("entries")
    .select(selectStr)
    .eq("user_id", userId)
    .eq("type", "log")
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: lastEntry } = await supabase
    .from("entries")
    .select(selectStr)
    .eq("user_id", userId)
    .eq("type", "log")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!firstEntry || !lastEntry || firstEntry.id === lastEntry.id) return null;

  // is_default filtresi yok — RLS ("user_id is null or auth.uid() = user_id")
  // zaten sistem varsayılanları + kullanıcının kendi özel tiplerini döndürüyor.
  const { data: types } = await supabase
    .from("measurement_types")
    .select("id, name, unit, target_direction")
    .order("sort_order");

  const start = await loadSide(firstEntry);
  const end = await loadSide(lastEntry);

  const daysBetween = Math.round(
    (new Date(end.date).getTime() - new Date(start.date).getTime()) / 86400000
  );

  return {
    start,
    end,
    daysBetween,
    types: (types ?? []).map((t) => ({ id: t.id, name: t.name, unit: t.unit, targetDirection: t.target_direction })),
  };
}

export async function fetchComparisonBetween(entryIdA: string, entryIdB: string): Promise<ComparisonData | null> {
  const selectStr =
    "id, date, photos!cover_photo_id(storage_path), measurement_values(measurement_type_id, value)";

  const { data: a } = await supabase.from("entries").select(selectStr).eq("id", entryIdA).maybeSingle();
  const { data: b } = await supabase.from("entries").select(selectStr).eq("id", entryIdB).maybeSingle();
  if (!a || !b) return null;

  const [firstEntry, lastEntry] = new Date(a.date) <= new Date(b.date) ? [a, b] : [b, a];

  // is_default filtresi yok — RLS ("user_id is null or auth.uid() = user_id")
  // zaten sistem varsayılanları + kullanıcının kendi özel tiplerini döndürüyor.
  const { data: types } = await supabase
    .from("measurement_types")
    .select("id, name, unit, target_direction")
    .order("sort_order");

  const start = await loadSide(firstEntry);
  const end = await loadSide(lastEntry);
  const daysBetween = Math.round(
    (new Date(end.date).getTime() - new Date(start.date).getTime()) / 86400000
  );

  return {
    start,
    end,
    daysBetween,
    types: (types ?? []).map((t) => ({ id: t.id, name: t.name, unit: t.unit, targetDirection: t.target_direction })),
  };
}
