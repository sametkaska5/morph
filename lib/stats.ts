import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { getPhotoUrls } from "./storage";
import { toLocalDateKey, getMondayOfWeek, weekdayLetter } from "./date";
import { queryKeys } from "./queryKeys";

/**
 * İstatistikler ekranının veri katmanı — ölçüm serisi (grafik), haftalık
 * kayıt durumu ve paylaşılabilir fotoğraf listesi. Eskiden üçü de 893
 * satırlık istatistikler.tsx'in içinde tanımlıydı.
 */

export type MeasurementSeriesPoint = { date: string; value: number };

export function useMeasurementSeries(userId: string | undefined, typeId: string | undefined) {
  return useQuery({
    // userId anahtarda yoksa, aynı cihazda hesap değiştirildiğinde önceki
    // kullanıcının grafiği cache'ten okunabiliyordu.
    queryKey: queryKeys.measurementSeries.byType(userId, typeId),
    enabled: !!userId && !!typeId,
    queryFn: async (): Promise<MeasurementSeriesPoint[]> => {
      const { data, error } = await supabase
        .from("measurement_values")
        .select("value, entries!inner(date, type, user_id)")
        .eq("measurement_type_id", typeId)
        .eq("entries.user_id", userId)
        // Fotoğrafsız günlerde (workout) girilen ölçümler de grafikte görünsün —
        // eskiden yalnızca 'log' okunuyordu, foto çekilmeyen günün ölçümü kaybolurdu.
        .in("entries.type", ["log", "workout"]);
      if (error) throw error;
      // Sıralamayı JS'te yapıyoruz. entries bu sorguda to-one bir ilişki olduğu
      // için PostgREST'in foreignTable order'ı ANA satırları (measurement_values)
      // güvenilir sıralamıyordu — değerler ekleme sırasında gelip grafik yanlış
      // diziliyordu. Tarihe göre ARTAN sıralayınca en eski solda, en yeni sağda olur.
      return (data ?? [])
        .map((d: any) => ({ date: d.entries.date, value: d.value }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    },
  });
}

export type WeekDayStatus = {
  date: string;
  label: string;
  isFuture: boolean;
  isToday: boolean;
  id: string | null;
  type: string | null;
};

export function useCurrentWeek(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.currentWeek.byUser(userId),
    enabled: !!userId,
    queryFn: async (): Promise<WeekDayStatus[]> => {
      const todayKey = toLocalDateKey(new Date());
      const monday = getMondayOfWeek(new Date());

      const days: { date: string; label: string; isFuture: boolean; isToday: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateKey = toLocalDateKey(d);
        days.push({
          date: dateKey,
          label: weekdayLetter(d),
          isFuture: dateKey > todayKey,
          isToday: dateKey === todayKey,
        });
      }

      const { data, error } = await supabase
        .from("entries")
        .select("id, date, type")
        .eq("user_id", userId)
        .gte("date", days[0].date)
        .lte("date", days[days.length - 1].date);
      if (error) throw error;

      const byDate = new Map((data ?? []).map((e) => [e.date, { id: e.id, type: e.type }]));
      return days.map((d) => ({
        ...d,
        id: byDate.get(d.date)?.id ?? null,
        type: byDate.get(d.date)?.type ?? null,
      }));
    },
  });
}

export type ShareablePhotoEntry = {
  id: string;
  date: string;
  photoUrl: string | null;
  photoPath: string | null;
};

export function useShareablePhotoEntries(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.shareablePhotos.byUser(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ShareablePhotoEntry[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, photos!cover_photo_id(storage_path)")
        .eq("user_id", userId)
        .eq("type", "log")
        .not("cover_photo_id", "is", null)
        .order("date", { ascending: false })
        .limit(12);
      if (error) throw error;

      const paths = (data ?? [])
        .map((entry: any) => entry.photos?.storage_path)
        .filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? [])
        .map((entry: any) => ({
          id: entry.id,
          date: entry.date,
          photoUrl: entry.photos?.storage_path
            ? (urlMap.get(entry.photos.storage_path) ?? null)
            : null,
          photoPath: entry.photos?.storage_path ?? null,
        }))
        .filter((entry) => entry.photoUrl);
    },
  });
}
