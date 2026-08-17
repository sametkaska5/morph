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

/* ─────────────────────────── Yıl takvimi ─────────────────────────── */

/**
 * Yılın gün → kayıt tipi haritası. Map yerine düz obje: sorgu sonucu
 * AsyncStorage'a JSON olarak kalıcı hale getiriliyor (bkz. app/_layout.tsx
 * PersistQueryClientProvider) — Map JSON'a çevrilemediği için geri
 * yüklendiğinde düz {} objesine dönüşüyor ve .get() çağrısı "undefined is
 * not a function" ile patlıyordu.
 */
export function useYearEntries(userId: string | undefined, year: number) {
  return useQuery({
    queryKey: queryKeys.entries.year(userId, year),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, type")
        .eq("user_id", userId!)
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`);
      if (error) throw error;

      // id de taşınıyor: takvimdeki fotoğraflı güne dokununca doğrudan o kaydı
      // açabilmek için gerekiyor (yalnızca tip bilinseydi kullanıcıyı önce
      // fotoğrafsız gün ekranına uğratmak zorunda kalırdık).
      const map: Record<string, { id: string; type: string }> = {};
      (data ?? []).forEach((e) => {
        map[e.date] = { id: e.id, type: e.type };
      });
      return map;
    },
  });
}
