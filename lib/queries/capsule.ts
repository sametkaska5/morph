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

/* ─────────────────────────── Anı akışı (zaman kapsülü) ─────────────────────────── */

export type MeasurementEntry = { name: string; unit: string; value: number };
export type ProgramItem = { name: string; setCount: number };

export type CapsuleEntry = {
  id: string;
  date: string;
  note: string | null;
  photoUrl: string | null;
  photoPath: string | null; // sabit cache anahtarı
  measurements: MeasurementEntry[];
  program: ProgramItem[];
};

export const CAPSULE_PAGE_SIZE = 20;

export function useCapsuleEntries() {
  return useInfiniteQuery({
    queryKey: queryKeys.entries.capsule(),
    staleTime: LIST_STALE_TIME,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CapsuleEntry[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, photos!cover_photo_id(storage_path), measurement_values(value, measurement_types(name, unit)), workout_items(name, order_index, workout_sets(reps, weight, order_index))",
        )
        .eq("type", "log")
        .order("date", { ascending: false })
        .range(pageParam, pageParam + CAPSULE_PAGE_SIZE - 1);

      if (error) throw error;

      const paths = (data ?? []).map((e) => e.photos?.storage_path).filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths, "full");

      return (data ?? []).map((e) => ({
        id: e.id,
        date: e.date,
        note: e.note,
        photoUrl: e.photos?.storage_path ? (urlMap.get(e.photos.storage_path) ?? null) : null,
        photoPath: e.photos?.storage_path ?? null,
        measurements: (e.measurement_values ?? [])
          .filter((mv) => mv.measurement_types)
          .map((mv) => ({
            name: mv.measurement_types!.name,
            unit: mv.measurement_types!.unit,
            value: mv.value,
          })),
        program: (e.workout_items ?? [])
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((wi) => ({ name: wi.name, setCount: (wi.workout_sets ?? []).length })),
      }));
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === CAPSULE_PAGE_SIZE ? allPages.length * CAPSULE_PAGE_SIZE : undefined,
  });
}
