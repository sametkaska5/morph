import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { getPhotoUrl } from "./storage";
import { queryKeys } from "./queryKeys";
import { parseLocalDate } from "./date";

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

/**
 * Aşağıdaki iki fonksiyonun paylaştığı `selectStr`'in döndürdüğü satır şekli.
 * photos to-one ilişki olduğu için (entries.cover_photo_id → photos.id) tekil
 * bir nesne ya da null geliyor, dizi değil.
 */
type ComparisonEntryRow = {
  id: string;
  date: string;
  photos: { storage_path: string; thumb_path: string | null } | null;
  measurement_values: { measurement_type_id: string; value: number }[];
};

async function loadSide(entryRow: ComparisonEntryRow): Promise<ComparisonSide> {
  const photoRow = entryRow.photos;
  // Karşılaştırma fotoğrafları yan yana YARIM genişlikte gösteriliyor — tam boy
  // (1280px) yerine küçük kopya (thumb, 400px) hem yeterli hem kat kat hızlı
  // iniyor. thumb yoksa (eski kayıt) tam boya geri düşüyoruz.
  const photoPath = photoRow?.thumb_path ?? photoRow?.storage_path ?? null;
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
    "id, date, photos!cover_photo_id(storage_path, thumb_path), measurement_values(measurement_type_id, value)";

  // İlk kayıt, son kayıt ve ölçüm tipleri BİRBİRİNDEN BAĞIMSIZ — sıralı beklemek
  // yerine tek seferde paralel çekiyoruz (is_default filtresi yok; RLS zaten
  // sistem varsayılanları + kullanıcının özel tiplerini döndürüyor).
  const [{ data: firstEntry }, { data: lastEntry }, { data: types }] = await Promise.all([
    supabase.from("entries").select(selectStr).eq("user_id", userId).eq("type", "log").order("date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("entries").select(selectStr).eq("user_id", userId).eq("type", "log").order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("measurement_types").select("id, name, unit, target_direction").order("sort_order"),
  ]);

  if (!firstEntry || !lastEntry || firstEntry.id === lastEntry.id) return null;

  // İki tarafın fotoğrafını da paralel imzalıyoruz.
  const [start, end] = await Promise.all([loadSide(firstEntry), loadSide(lastEntry)]);

  const daysBetween = Math.round(
    (parseLocalDate(end.date).getTime() - parseLocalDate(start.date).getTime()) / 86400000
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
    "id, date, photos!cover_photo_id(storage_path, thumb_path), measurement_values(measurement_type_id, value)";

  // İki kayıt ve ölçüm tipleri bağımsız — paralel çekiyoruz (eskiden sıralıydı,
  // "Karşılaştır"a basınca 3 ayrı gidiş-dönüş art arda bekleniyordu).
  const [{ data: a }, { data: b }, { data: types }] = await Promise.all([
    supabase.from("entries").select(selectStr).eq("id", entryIdA).maybeSingle(),
    supabase.from("entries").select(selectStr).eq("id", entryIdB).maybeSingle(),
    supabase.from("measurement_types").select("id, name, unit, target_direction").order("sort_order"),
  ]);
  if (!a || !b) return null;

  const [firstEntry, lastEntry] = a.date <= b.date ? [a, b] : [b, a];

  // İki tarafın fotoğrafını da paralel imzalıyoruz.
  const [start, end] = await Promise.all([loadSide(firstEntry), loadSide(lastEntry)]);
  const daysBetween = Math.round(
    (parseLocalDate(end.date).getTime() - parseLocalDate(start.date).getTime()) / 86400000
  );

  return {
    start,
    end,
    daysBetween,
    types: (types ?? []).map((t) => ({ id: t.id, name: t.name, unit: t.unit, targetDirection: t.target_direction })),
  };
}

export function useComparison(a: string | undefined, b: string | undefined) {
  return useQuery({
    queryKey: queryKeys.comparison(a, b),
    enabled: !!a && !!b,
    // Imzali linkler 6 saat gecerli; ayni cifti tekrar acinca sifirdan cekmek
    // yerine cache'ten aninda goster (uygulamanin geri kalaniyla ayni sure).
    staleTime: 1000 * 60 * 30,
    queryFn: () => fetchComparisonBetween(a!, b!),
  });
}
