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

/* ─────────────────────────── Ana ekran ızgarası ─────────────────────────── */

/** Kapağın ARKASINDA duran fotoğraf — ızgaradaki yaprak efekti için. */
export type BackPhoto = { url: string; path: string };

export type EntryRow = {
  id: string;
  date: string;
  note: string | null;
  cover_photo_url: string | null;
  cover_photo_path: string | null; // sabit cache anahtarı için — link değişse de bu değişmiyor
  photo_count: number;
  /**
   * Kapak dışındaki fotoğraflardan EN FAZLA ikisi. Sınır bilinçli: ızgarada 60
   * kart var, kart başına tüm fotoğrafları indirmek listeyi ağırlaştırırdı ve
   * yaprak efektinde zaten ikiden fazlası görünmüyor.
   */
  back_photos: BackPhoto[];
  pending?: boolean; // offline'da eklenip henüz Supabase'e senkronize olmamış kayıt
};

/** Yaprak efektinde kapağın arkasında gösterilecek en fazla fotoğraf sayısı. */
const MAX_BACK_PHOTOS = 2;

/**
 * Izgara sayfa boyutu.
 *
 * Eskiden sayfalama YOKTU: sorgu `.limit(60)` ile sabitti, yani 60'tan eski
 * anılar ana ekranda hiç görünmüyordu (yalnızca arama ve yıllık takvimden
 * erişilebiliyordu). Bilinçli bir ürün kararı değil, fark edilmemiş bir sınırdı.
 *
 * 30 seçildi (60 değil): üç sütunlu ızgarada 10 satır, yani bir ekranın iki
 * katından fazla — kaydırma alt sınıra ulaşmadan sonraki sayfa gelmeye başlıyor.
 * İlk sayfa küçüldüğü için ilk çizim de hızlandı: 60 kaydın kapak + yaprak
 * fotoğrafları tek seferde 180'e yakın imzalı link demekti, artık yarısı.
 */
const TIMELINE_PAGE_SIZE = 30;

export function useTimelineEntries() {
  return useInfiniteQuery({
    queryKey: queryKeys.entries.timeline(),
    staleTime: LIST_STALE_TIME,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<EntryRow[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, cover_photo_id, photos!entry_id(id, storage_path, thumb_path, order_index)",
        )
        .eq("type", "log")
        .order("date", { ascending: false })
        .range(pageParam, pageParam + TIMELINE_PAGE_SIZE - 1);

      if (error) throw error;

      // Kapak + arkadaki en fazla 2 fotoğrafın küçük kopya yolları. Kapak
      // sırası orderEntryPhotos'tan geliyor ki ızgaradaki yaprak dizilimi
      // detay ekranındaki şeritle aynı sırayı göstersin.
      const backPathsByEntry = new Map<string, string[]>();
      for (const e of data ?? []) {
        const ordered = orderEntryPhotos(e.photos ?? [], e.cover_photo_id);
        backPathsByEntry.set(
          e.id,
          ordered
            .slice(1, 1 + MAX_BACK_PHOTOS)
            .map((p) => p.thumb_path ?? p.storage_path)
            .filter(Boolean) as string[],
        );
      }

      // 3 sütunlu ızgara: kare ~108pt. Yüklemede üretilen küçük kopyayı
      // kullanıyoruz; olmayan (eski) kayıtlarda coverThumbPath tam boya düşer.
      // Kapak ve arka yapraklar TEK batch'te imzalanıyor — aşağıdaki nota göre
      // path başına ayrı istek 60 kayıtlık ızgarada belirgin şekilde yavaş.
      const paths = [
        ...((data ?? []).map(coverThumbPath).filter(Boolean) as string[]),
        ...[...backPathsByEntry.values()].flat(),
      ];
      // Bilerek transform'suz (varyantsız) çağrı: yol zaten küçük kopyaya işaret
      // ediyor, üstüne dönüşüm istemek path başına ayrı imzalama isteği demek
      // olurdu — 60 kayıtlık ızgarada tek batch isteği çok daha hızlı.
      const urlMap = await getPhotoUrls(paths);

      return (data ?? []).map((e) => {
        const path = coverThumbPath(e);
        const backPaths = backPathsByEntry.get(e.id) ?? [];
        return {
          id: e.id,
          date: e.date,
          note: e.note,
          cover_photo_url: path ? (urlMap.get(path) ?? null) : null,
          cover_photo_path: path ?? null,
          photo_count: (e.photos ?? []).length,
          back_photos: backPaths
            .map((p) => ({ url: urlMap.get(p) ?? null, path: p }))
            .filter((p): p is BackPhoto => p.url !== null),
        };
      });
    },
    // queryFn'DEN SONRA duruyor ve durmak zorunda: TypeScript sayfa tipini
    // queryFn'in dönüş tipinden çıkarıyor, önce yazılırsa `lastPage` unknown
    // kalıyor. Anı akışındaki sorgu da aynı sırada.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === TIMELINE_PAGE_SIZE ? allPages.length * TIMELINE_PAGE_SIZE : undefined,
  });
}
