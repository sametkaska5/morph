import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "./supabase";
import { getPhotoUrl, getPhotoUrls, coverThumbPath, coverPhotoRow } from "./storage";
import { orderEntryPhotos } from "./photos";
import { queryKeys } from "./queryKeys";

/**
 * Girdi LİSTELERİNİN veri katmanı.
 *
 * Bu hook'lar eskiden her biri kendi ekran dosyasının içinde tanımlıydı
 * (index.tsx, zaman-kapsulu.tsx, search.tsx, compare/pick.tsx, calendar-year.tsx).
 * Sonuç: entry/new.tsx optimistic update için EntryRow tipini bir EKRAN
 * dosyasından import etmek zorunda kalıyordu ve anahtarlar elle yazılmış
 * string'ler olarak dağınıktı. Veri erişimi artık burada, anahtarlar
 * queryKeys'ten — ekranlar yalnızca görünüm.
 *
 * Not: imzalı foto linkleri 6 saat geçerli; 30 dk staleTime hem listeyi taze
 * tutuyor hem gereksiz yeniden imzalamayı önlüyor.
 */

const LIST_STALE_TIME = 1000 * 60 * 30;

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
export const MAX_BACK_PHOTOS = 2;

export function useTimelineEntries() {
  return useQuery({
    queryKey: queryKeys.entries.timeline(),
    staleTime: LIST_STALE_TIME,
    queryFn: async (): Promise<EntryRow[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, cover_photo_id, photos!entry_id(id, storage_path, thumb_path, order_index)"
        )
        .eq("type", "log")
        .order("date", { ascending: false })
        .limit(60);

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
            .filter(Boolean) as string[]
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
  });
}

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
          "id, date, note, photos!cover_photo_id(storage_path), measurement_values(value, measurement_types(name, unit)), workout_items(name, order_index, workout_sets(reps, weight, order_index))"
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

/* ─────────────────────────── Arama dizini ─────────────────────────── */

export type SearchEntry = {
  id: string;
  date: string;
  note: string | null;
  photoUrl: string | null;
  photoPath: string | null;
};

export function useSearchIndex(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.entries.searchIndex(userId),
    enabled: !!userId,
    staleTime: LIST_STALE_TIME,
    queryFn: async (): Promise<SearchEntry[]> => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, note, cover_photo_id, photos!entry_id(id, storage_path, thumb_path)")
        .eq("user_id", userId!)
        .eq("type", "log")
        .order("date", { ascending: false });

      if (error) throw error;

      // Küçük liste thumb'ları: yüklemede üretilen kopyayı tercih et.
      // Varyantsız: yol zaten küçük kopya, tek batch isteği yeterli.
      const paths = (data ?? []).map(coverThumbPath).filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? []).map((e) => {
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
        .order("date", { ascending: false })
        .limit(60);
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

/* ─────────────────────────── Girdi detayı ─────────────────────────── */

/** Detay ekranındaki tek bir fotoğraf. `isCover` ızgaralarda görünen kapak. */
export type EntryPhoto = {
  id: string;
  url: string | null;
  path: string;
  isCover: boolean;
};

export function useEntryDetail(entryId: string) {
  return useQuery({
    queryKey: queryKeys.entry.detail(entryId),
    queryFn: async () => {
      // photos!entry_id: kapak değil, o güne ait TÜM fotoğraflar. Eskiden yalnız
      // cover_photo_id okunuyordu — bir güne birden fazla fotoğraf eklenebildiği
      // için diğerleri ekranda hiç görünmezdi.
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, date, note, cover_photo_id, photos!entry_id(id, storage_path, order_index), measurement_values(value, measurement_types(name, unit)), workout_items(name, order_index, workout_sets(reps, weight, order_index))"
        )
        .eq("id", entryId)
        .single();

      if (error) throw error;

      const rows = orderEntryPhotos(data.photos ?? [], data.cover_photo_id);
      const urlMap = await getPhotoUrls(
        rows.map((p) => p.storage_path),
        "full"
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
    },
  });
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
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []).map((e) => e.id);
    },
  });
}

/* ─────────────────────────── Düzenleme için girdi ─────────────────────────── */

/**
 * Düzenleme ekranı hemen HER ZAMAN başka bir ekrandan (anı akışı, detay, ana
 * ekran) açılıyor ve o ekranlar bu kaydı zaten çekmiş, fotoğrafını da diske
 * indirmiş oluyor. Ağ sorgusunu beklemek yerine o cache'lerden kaydı anında
 * bulup placeholder olarak veriyoruz: ekran spinner göstermeden açılıyor,
 * fotoğraf cacheKey ile diskten geliyor. Gerçek sorgu arka planda tamamlanıp
 * yerini alıyor (ölçüm değerleri gibi placeholder'da olmayan alanları doldurur).
 */
type EntrySeed = {
  note: string | null;
  photoUrl: string | null; // tam boy
  photoPath: string | null; // tam boy storage yolu (cacheKey path@full)
  thumbUrl: string | null; // küçük kopya (anlık placeholder)
  thumbPath: string | null; // küçük kopya yolu (cacheKey path@thumb)
};

function findEntryInCaches(queryClient: QueryClient, entryId: string): EntrySeed | null {
  const seed: EntrySeed = {
    note: null,
    photoUrl: null,
    photoPath: null,
    thumbUrl: null,
    thumbPath: null,
  };
  let found = false;

  // Anı akışı (sonsuz sorgu) ve detay ekranı: TAM BOY photoUrl + photoPath.
  const capsule = queryClient.getQueryData<{ pages: CapsuleEntry[][] }>(
    queryKeys.entries.capsule()
  );
  for (const page of capsule?.pages ?? []) {
    const hit = page.find((e) => e.id === entryId);
    if (hit) {
      seed.note = hit.note ?? null;
      seed.photoUrl = hit.photoUrl ?? null;
      seed.photoPath = hit.photoPath ?? null;
      found = true;
      break;
    }
  }
  if (!seed.photoUrl) {
    // Tohumlama için detay cache'inden yalnızca şu üç alan okunuyor; tam satır
    // tipini istemek yerine ihtiyacımız olan en dar şekli yazıyoruz.
    const detail = queryClient.getQueryData<{
      note?: string | null;
      photoUrl?: string | null;
      photoPath?: string | null;
    }>(queryKeys.entry.detail(entryId));
    if (detail) {
      seed.note = seed.note ?? detail.note ?? null;
      seed.photoUrl = detail.photoUrl ?? null;
      seed.photoPath = detail.photoPath ?? null;
      found = true;
    }
  }

  // Ana ekran ızgarası: KÜÇÜK kopya (thumb). Tam boy diskte olmasa da bu genelde
  // cache'te oluyor ve anlık placeholder olarak gösterilebiliyor.
  const timeline = queryClient.getQueryData<EntryRow[]>(queryKeys.entries.timeline());
  const gridHit = timeline?.find((e) => e.id === entryId);
  if (gridHit?.cover_photo_url) {
    seed.thumbUrl = gridHit.cover_photo_url;
    seed.thumbPath = gridHit.cover_photo_path ?? null;
    found = true;
  }

  return found ? seed : null;
}

export function useEditableEntry(entryId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.entry.edit(entryId),
    // İmzalı linkler 6 saat geçerli; ekranı her açışta sıfırdan çekmek yerine
    // cache'ten anında gösteriyoruz (uygulamanın geri kalanıyla aynı süre).
    staleTime: LIST_STALE_TIME,
    // Fotoğrafı ve notu anında gösterebilmek için başka ekranların cache'inden
    // tohumla; gerçek fetch tamamlanınca ölçümlerle birlikte tam veri gelir.
    placeholderData: () => {
      const seed = findEntryInCaches(queryClient, entryId);
      if (!seed) return undefined;
      // Şekil, aşağıdaki queryFn'in döndürdüğüyle birebir aynı olmalı — eskiden
      // `as any` ile susturuluyordu, dolayısıyla sorgu şekli değişse placeholder
      // sessizce eksik kalırdı. Artık TypeScript ikisini senkron tutuyor.
      return {
        id: entryId,
        note: seed.note,
        cover_photo_id: null,
        photos: [],
        measurement_values: [],
        photoUrl: seed.photoUrl,
        photoPath: seed.photoPath,
        thumbUrl: seed.thumbUrl,
        thumbPath: seed.thumbPath,
      };
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, note, cover_photo_id, photos!entry_id(id, storage_path, thumb_path), measurement_values(id, value, measurement_type_id, measurement_types(name, unit))"
        )
        .eq("id", entryId)
        .single();

      if (error) throw error;

      // İmzalı linkleri BURADA üretiyoruz. Eskiden bu iş render sonrası bir
      // useEffect'te yapılıyordu: kayıt sorgusu bitiyor → efekt çalışıyor →
      // imzalama isteği gidiyor → ancak ondan sonra fotoğraf inmeye başlıyordu.
      // Tam boy VE küçük kopyayı paralel imzalıyoruz; küçük kopya, tam boy diskte
      // yoksa anlık placeholder olarak gösterilip "boş kare" beklemesini önlüyor.
      const coverRow = coverPhotoRow(data);
      const photoPath = coverRow?.storage_path ?? null;
      const thumbPath = coverRow?.thumb_path ?? null;

      const [photoUrl, thumbUrl] = await Promise.all([
        photoPath ? getPhotoUrl(photoPath, "full").catch(() => null) : Promise.resolve(null),
        thumbPath ? getPhotoUrl(thumbPath).catch(() => null) : Promise.resolve(null),
      ]);

      return { ...data, photoUrl, photoPath, thumbUrl, thumbPath };
    },
  });
}

/* ─────────────────────────── Girdi silme ─────────────────────────── */

async function deleteEntry(entryId: string) {
  const { data: photos, error: photoError } = await supabase
    .from("photos")
    .select("storage_path, thumb_path")
    .eq("entry_id", entryId);

  if (photoError) throw photoError;

  // Tam boy kopyanın yanında küçük kopyayı da siliyoruz, yoksa storage'da
  // yetim thumbnail dosyaları birikir.
  const paths = (photos ?? []).flatMap(
    (p) => [p.storage_path, p.thumb_path].filter(Boolean) as string[]
  );

  if (paths.length > 0) {
    // cover_photo_id, entries'i referans aldığı için önce onu temizlemek gerekiyor,
    // yoksa foreign key kısıtı silmeyi engelleyebilir
    await supabase.from("entries").update({ cover_photo_id: null }).eq("id", entryId);

    const { error: storageError } = await supabase.storage.from("photos").remove(paths);
    if (storageError) throw storageError;
  }

  const { error } = await supabase.from("entries").delete().eq("id", entryId);
  if (error) throw error;

  return true;
}

/**
 * Cache invalidation burada (veri katmanının sorumluluğu); navigasyon gibi
 * ekrana özgü işler çağıran tarafın mutate(id, { onSuccess }) callback'inde.
 */
export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      // Silinen kayıt "Toplam Anı"/seri sayaçlarını da değiştiriyor — profil
      // istatistikleri invalidate edilmeyince eski sayılar ekranda kalıyordu.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentWeek.all });
    },
  });
}

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
