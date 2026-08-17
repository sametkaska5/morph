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

/* ─────────────────────────── Arama dizini ─────────────────────────── */

export type SearchEntry = {
  id: string;
  date: string;
  note: string | null;
  photoUrl: string | null;
  photoPath: string | null;
};

export function useSearchEntries(userId: string | undefined, searchTerm: string) {
  return useQuery({
    queryKey: queryKeys.entries.search(userId, searchTerm),
    enabled: !!userId && searchTerm.trim().length > 0,
    staleTime: LIST_STALE_TIME,
    queryFn: async (): Promise<SearchEntry[]> => {
      // @ts-ignore -- search_entries requires a db push and type gen
      const { data, error } = await supabase
        .rpc("search_entries", { search_term: searchTerm })
        .select("id, date, note, cover_photo_id, photos!entry_id(id, storage_path, thumb_path)");

      if (error) throw error;

      const results = (data as unknown as any[]) ?? [];
      const paths = results.map((e) => coverThumbPath(e)).filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return results.map((e) => {
        const path = coverThumbPath(e);
        return {
          id: e.id,
          date: e.date,
          note: e.note,
          photoUrl: path ? (urlMap.get(path) ?? null) : null,
          photoPath: path ?? null,
        };
      });
    },
  });
}
