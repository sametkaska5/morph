import { useQuery, type QueryClient } from "@tanstack/react-query";
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
        .eq("measurement_type_id", typeId!)
        .eq("entries.user_id", userId!)
        // Fotoğrafsız günlerde (workout) girilen ölçümler de grafikte görünsün —
        // eskiden yalnızca 'log' okunuyordu, foto çekilmeyen günün ölçümü kaybolurdu.
        .in("entries.type", ["log", "workout"]);
      if (error) throw error;
      // Sıralamayı JS'te yapıyoruz. entries bu sorguda to-one bir ilişki olduğu
      // için PostgREST'in foreignTable order'ı ANA satırları (measurement_values)
      // güvenilir sıralamıyordu — değerler ekleme sırasında gelip grafik yanlış
      // diziliyordu. Tarihe göre ARTAN sıralayınca en eski solda, en yeni sağda olur.
      return (data ?? [])
        .map((d) => ({ date: d.entries.date, value: d.value }))
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

/**
 * Bir haftanın (Pazartesi–Pazar) gün durumları.
 *
 * `weekOffset`: 0 = içinde bulunulan hafta, -1 = bir önceki hafta, -2 = iki
 * önceki... Şerit yalnızca bu haftayı gösterdiği sürece geçmişe dönük off day /
 * antrenman işaretlemenin bir yolu yoktu (yıllık takvim salt görsel); şeridin
 * geriye gezinebilmesi o kapıyı açıyor — güne dokunmak fotoğrafsız gün ekranını
 * o tarihle açar.
 */
export function useWeek(userId: string | undefined, weekOffset = 0) {
  return useQuery({
    queryKey: queryKeys.currentWeek.byWeek(userId, weekOffset),
    enabled: !!userId,
    queryFn: async (): Promise<WeekDayStatus[]> => {
      const todayKey = toLocalDateKey(new Date());
      const monday = getMondayOfWeek(new Date());
      monday.setDate(monday.getDate() + weekOffset * 7);

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
        .eq("user_id", userId!)
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

/**
 * Bu haftanın gün listesinden mevcut seriyi sayar: bugünden (gelecek günler
 * atlanarak) geriye doğru, tipi olan her gün seriyi büyütür; ilk boş gün keser.
 * Saf fonksiyon — istatistik ekranındaki IIFE'den test edilebilsin diye çıkarıldı.
 */
export function computeWeekStreak(week: Pick<WeekDayStatus, "isFuture" | "type">[]): number {
  let streak = 0;
  for (let i = week.length - 1; i >= 0; i--) {
    if (week[i].isFuture) continue;
    if (week[i].type) streak++;
    else break;
  }
  return streak;
}

/**
 * İstatistikler ekranını besleyen TÜM sorguları tazeler (aşağı çekip yenile).
 *
 * Neden ekranda değil burada: liste, ekranın hangi verilere dayandığının
 * tanımı ve eksik bırakılması sessiz bir hataya yol açıyor — özellikle
 * measurement_series, çünkü bir kaydın ölçümü BAŞKA ekrandan (düzenleme)
 * değiştirildiğinde grafik cache'ten eski değeri göstermeye devam edebiliyor;
 * elle yenileme bunun tek çıkış yolu. Adlandırılmış ve test edilebilir bir
 * fonksiyon olarak burada duruyor.
 */
export function invalidateStatsQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.measurementSeries.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.currentWeek.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.shareablePhotos.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.measurementTypes.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.all }),
  ]);
}

export type Trend = { delta: number | null; isGood: boolean };

/**
 * İki ölçüm arasındaki değişim + bunun "iyi" olup olmadığı (hedef yönüne göre:
 * kilo düşsün, kas ölçüsü artsın). Ekranda hem satır içi grafik başlığı hem
 * büyütme modalı aynı hesabı kopyalıyordu — tek kaynağa indirildi.
 */
export function computeTrend(
  currentValue: number | undefined,
  previousValue: number | undefined,
  targetDirection: "decrease_is_good" | "increase_is_good" | undefined
): Trend {
  const delta =
    currentValue != null && previousValue != null
      ? Number((currentValue - previousValue).toFixed(1))
      : null;
  const isGood =
    delta != null && targetDirection
      ? targetDirection === "decrease_is_good"
        ? delta <= 0
        : delta >= 0
      : true;
  return { delta, isGood };
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
        .eq("user_id", userId!)
        .eq("type", "log")
        .not("cover_photo_id", "is", null)
        .order("date", { ascending: false })
        .limit(12);
      if (error) throw error;

      const paths = (data ?? [])
        .map((entry) => entry.photos?.storage_path)
        .filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? [])
        .map((entry) => ({
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
