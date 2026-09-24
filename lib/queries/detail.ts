import { useCallback } from "react";
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { supabase } from "../supabase";
import { getPhotoUrl, getPhotoUrls, coverThumbPath, coverPhotoRow } from "../storage";
import { orderEntryPhotos } from "../photos";
import { queryKeys } from "../queryKeys";
import { LIST_STALE_TIME } from "./constants";

/* ─────────────────────────── Girdi detayı ─────────────────────────── */

/** Detay ekranındaki tek bir fotoğraf. `isCover` ızgaralarda görünen kapak. */
export type EntryPhoto = {
  id: string;
  url: string | null;
  path: string;
  isCover: boolean;
};

async function fetchEntryDetail(entryId: string) {
  // photos!entry_id: kapak değil, o güne ait TÜM fotoğraflar. Eskiden yalnız
  // cover_photo_id okunuyordu — bir güne birden fazla fotoğraf eklenebildiği
  // için diğerleri ekranda hiç görünmezdi.
  const { data, error } = await supabase
    .from("entries")
    .select(
      "id, date, note, cover_photo_id, photos!entry_id(id, storage_path, order_index), measurement_values(value, measurement_types(name, unit)), workout_items(name, order_index, workout_sets(reps, weight, order_index))",
    )
    .eq("id", entryId)
    .single();

  if (error) throw error;

  const rows = orderEntryPhotos(data.photos ?? [], data.cover_photo_id);
  const urlMap = await getPhotoUrls(
    rows.map((p) => p.storage_path),
    "full",
  );
  const photos: EntryPhoto[] = rows.map((p) => ({
    id: p.id,
    path: p.storage_path,
    url: urlMap.get(p.storage_path) ?? null,
    isCover: p.id === data.cover_photo_id,
  }));

  // photoUrl/photoPath: kapak. Ekranın geri kalanı ve paylaşım kartı bu iki
  // alanı okumaya devam ediyor — çoklu fotoğraf onların üstüne EKLENDİ.
  const cover = photos.find((p) => p.isCover) ?? photos[0] ?? null;
  return {
    ...data,
    photos,
    photoUrl: cover?.url ?? null,
    photoPath: cover?.path ?? null,
  };
}

export function useEntryDetail(entryId: string) {
  return useQuery({
    queryKey: queryKeys.entry.detail(entryId),
    // Taze süresi YOKTU: ekran her açılışta kaydı yeniden çekiyor ve o günün
    // BÜTÜN fotoğraflarının imzalı linklerini yeniden üretiyordu. Kardeş sorgu
    // useEditableEntry'de bu süre baştan beri vardı. Vermek güvenli, çünkü
    // tazelik süreye değil olaya bağlı: günü yazan her yol invalidateAfterDayWrite
    // üzerinden entry.all'ı geçersiz kılıyor.
    staleTime: LIST_STALE_TIME,
    queryFn: () => fetchEntryDetail(entryId),
  });
}

/**
 * Detay verisini KULLANICI PARMAĞINI KALDIRMADAN ÖNCE çeker.
 *
 * Ana ekrandaki kareye parmak değdiği an ile dokunuşun tamamlanması arasında
 * ~100-200 ms, üstüne gezinme geçişi var. Sorgu o boşlukta ilerliyor, detay
 * ekranı açıldığında veri çoğu zaman hazır oluyor.
 *
 * Izgara zaten `onPressIn`'i kullanıyor (plak sandığı açılma efekti için), yani
 * "dokunma niyeti" sinyali hazırdı — yeni bir etkileşim eklemeye gerek yok.
 */
export function usePrefetchEntryDetail() {
  const queryClient = useQueryClient();
  return useCallback(
    (entryId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.entry.detail(entryId),
        queryFn: () => fetchEntryDetail(entryId),
        staleTime: LIST_STALE_TIME,
      });
    },
    [queryClient],
  );
}

/**
 * Yan yana kaydırılabilecek kayıtların SIRASI.
 *
 * Ana ekran ızgarasıyla aynı sıralama ve aynı limit kullanılıyor (type=log,
 * tarihe göre yeniden eskiye, 60) — böylece ızgarada gördüğün sıra ile
 * kaydırdığında geldiğin sıra birebir aynı oluyor. user_id filtresi yok;
 * ızgara sorgusunda olduğu gibi RLS hallediyor.
 */
export function useEntryOrder() {
  return useQuery({
    queryKey: queryKeys.entries.order(),
    staleTime: LIST_STALE_TIME,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id")
        .eq("type", "log")
        .order("date", { ascending: false });
      // Limit KALDIRILDI: useTimelineEntries artık sonsuz sayfalı (TIMELINE_PAGE_SIZE=30),
      // yani ızgarada 60'tan eski kayıtlar görünür. Detay ekranındaki ← → kaydırma bu
      // sıraya bakarak hangi kaydın geleceğini belirler; liste eksikse kaydırma o noktada
      // kopar. Yalnızca id çekiliyor (bulk veri değil), bu yüzden sınırsız tutmak güvenli.
      if (error) throw error;
      return (data ?? []).map((e) => e.id);
    },
  });
}
