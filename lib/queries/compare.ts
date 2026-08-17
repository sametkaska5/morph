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

/* ─────────────────────────── Karşılaştırma için seçilebilir kayıtlar ─────────────────────────── */

export type PickableEntry = {
  id: string;
  date: string;
  photoUrl: string | null;
  photoPath: string | null;
};

export function usePickableEntries(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.entries.pickable(userId),
    enabled: !!userId,
    staleTime: LIST_STALE_TIME,
    queryFn: async (): Promise<PickableEntry[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, photos!cover_photo_id(storage_path, thumb_path)")
        .eq("user_id", userId!)
        .eq("type", "log")
        .order("date", { ascending: false });
      // Limit KALDIRILDI: karşılaştırma ekranı yalnızca son 60 günü gösteriyordu;
      // daha eski fotoğraflarla karşılaştırma yapılamıyordu. Yalnızca id+tarih+kapak
      // yolu çekiliyor (bulk veri değil), sınırsız tutmak güvenli.
      if (error) throw error;

      // Izgara görünümü: küçük kopyayı tercih et, yoksa tam boya düş.
      // Varyantsız: yol zaten küçük kopya, tek batch isteği yeterli.
      const paths = (data ?? []).map(coverThumbPath).filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? []).map((e) => {
        const path = coverThumbPath(e);
        return {
          id: e.id,
          date: e.date,
          photoUrl: path ? (urlMap.get(path) ?? null) : null,
          photoPath: path ?? null,
        };
      });
    },
  });
}
