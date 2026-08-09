import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { toLocalDateKey, parseLocalDate } from "./date";
import { queryKeys } from "./queryKeys";

/**
 * Tarihe göre ARTAN sıralı gün listesinden mevcut ve en uzun seriyi hesaplar.
 * Ardışık günler (1 gün fark) seriyi büyütür; boşluk sıfırlar. Mevcut seri son
 * kayıttan geriye doğru sayılır ama yalnızca son kayıt bugün ya da dün ise
 * (aksi halde seri kopmuştur). Test edilebilmesi için export edildi.
 */
export function computeStreaks(sortedDates: string[]) {
  if (sortedDates.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);

    if (diffDays === 1) {
      run += 1;
    } else if (diffDays > 1) {
      run = 1;
    }
    longest = Math.max(longest, run);
  }

  // Mevcut seri: son kayıttan geriye doğru, bugün ya da dün ile başlıyorsa say
  const lastDate = new Date(sortedDates[sortedDates.length - 1]);
  const today = new Date(toLocalDateKey(new Date())); // string üzerinden parse, saat dilimi kaymasın
  const daysSinceLast = Math.round((today.getTime() - lastDate.getTime()) / 86400000);

  let current = 0;
  if (daysSinceLast <= 1) {
    current = 1;
    for (let i = sortedDates.length - 1; i > 0; i--) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) current += 1;
      else break;
    }
  }

  return { current, longest };
}

export async function fetchProfileStats(userId: string) {
  const { data: allEntries, error: entriesError } = await supabase
    .from("entries")
    .select("date, type")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (entriesError) throw entriesError;

  const dates = (allEntries ?? []).map((e) => e.date); // streak için log + off_day birlikte
  const { current, longest } = computeStreaks(dates);
  // "Başlangıç" kullanıcının FOTOĞRAF attığı ilk gün olmalı — off day / antrenman
  // günleri fotoğraf içermediği için sayılmıyor. (Sorgu tarihe göre artan sıralı,
  // yani ilk "log" kaydı en eski fotoğraflı gün.)
  const firstDate = (allEntries ?? []).find((e) => e.type === "log")?.date ?? null;
  const totalMemories = (allEntries ?? []).filter((e) => e.type === "log").length;

  let weightDiff: number | null = null;
  let monthsSinceFirst: number | null = null;

  if (firstDate) {
    // parseLocalDate: `new Date("2026-01-01")` UTC gece yarısı sayılıyor, sonra
    // getFullYear/getMonth YEREL okuyor — negatif saat dilimlerinde ay bir geri
    // kayıp "kaç aydır" sayacı yanlış çıkıyordu.
    const first = parseLocalDate(firstDate);
    const now = new Date();
    monthsSinceFirst =
      (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth());

    const { data: kiloType } = await supabase
      .from("measurement_types")
      .select("id")
      .eq("name", "kilo")
      .eq("is_default", true)
      .single();

    if (kiloType) {
      // Sıralamayı JS'te yapıyoruz. `order("date", { foreignTable: "entries" })`
      // + `limit(1)` güvenilir DEĞİL: entries burada to-one bir ilişki ve
      // PostgREST bu durumda ANA satırları (measurement_values) gömülü kolona
      // göre sıralamayı garanti etmiyor — ilk/son kilo yerine rastgele iki satır
      // gelip "kilo değişimi" tamamen yanlış çıkabiliyordu. lib/stats.ts
      // useMeasurementSeries aynı tuzağa düşüp aynı şekilde düzeltilmişti.
      const { data: kiloRows } = await supabase
        .from("measurement_values")
        .select("value, entries!inner(date, type, user_id)")
        .eq("measurement_type_id", kiloType.id)
        .eq("entries.user_id", userId)
        .eq("entries.type", "log");

      const sorted = (kiloRows ?? [])
        .map((r) => ({ date: r.entries.date, value: r.value }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      if (sorted.length >= 2) {
        weightDiff = Number((sorted[sorted.length - 1].value - sorted[0].value).toFixed(1));
      }
    }
  }

  return { firstDate, totalMemories, current, longest, weightDiff, monthsSinceFirst };
}

export function useProfileStats(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile.stats(userId),
    queryFn: () => fetchProfileStats(userId!),
    enabled: !!userId,
  });
}
