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
import { CapsuleEntry } from "./capsule";
import { EntryRow } from "./timeline";

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
    queryKeys.entries.capsule(),
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
  // Izgara artık sayfalı (useInfiniteQuery), yani cache'te düz bir dizi değil
  // sayfa dizisi duruyor — hepsinde aramamız gerekiyor.
  const timeline = queryClient.getQueryData<InfiniteData<EntryRow[]>>(queryKeys.entries.timeline());
  const gridHit = timeline?.pages.flat().find((e) => e.id === entryId);
  if (gridHit?.cover_photo_url) {
    seed.thumbUrl = gridHit.cover_photo_url;
    seed.thumbPath = gridHit.cover_photo_path ?? null;
    found = true;
  }

  return found ? seed : null;
}

async function fetchEditableEntry(queryClient: QueryClient, entryId: string) {
  const { data, error } = await supabase
    .from("entries")
    // order_index de okunuyor: düzenleme ekranında fotoğraf DEĞİŞTİRİLDİĞİNDE
    // yeni satır, yerini aldığı fotoğrafın sırasını devralıyor (bkz.
    // app/entry/edit/[id].tsx). Sabit 0 yazmak, günün başka fotoğrafları
    // varken şeridin sırasını bozuyordu.
    .select(
      "id, note, cover_photo_id, photos!entry_id(id, storage_path, thumb_path, order_index), measurement_values(id, value, measurement_type_id, measurement_types(name, unit))",
    )
    .eq("id", entryId)
    .single();

  if (error) throw error;

  const coverRow = coverPhotoRow(data);
  const photoPath = coverRow?.storage_path ?? null;
  const thumbPath = coverRow?.thumb_path ?? null;

  /**
   * İMZALI LİNKİ YENİDEN ÜRETMİYORUZ — ekran onu beklemesin diye.
   *
   * Bu sorgu iki ağ turu sürüyordu: önce kayıt, sonra imzalama (imzalama kaydı
   * beklemek ZORUNDA, çünkü hangi dosyayı imzalayacağını kayıttan öğreniyor).
   * Düzenleme ekranında "Kaydet" ve ölçüm alanları sorgunun TAMAMINI bekliyor
   * (bkz. formReady), yani kullanıcı, ekranda ZATEN GÖRÜNEN bir fotoğrafın
   * linkinin yeniden üretilmesini bekliyordu.
   *
   * Ekran hemen her zaman anı akışından/detaydan açılıyor ve o ekranlar aynı
   * fotoğrafın imzalı linkini çoktan almış oluyor. Yol aynıysa o linki olduğu
   * gibi kullanıyoruz: bir tur ağ eksiliyor.
   *
   * Küçük kopya (thumb) yalnızca "tam boy henüz diskte yokken boş kare
   * görünmesin" diye var. Tam boy linki kardeş cache'ten geldiyse o fotoğraf
   * zaten bir ekranda gösterilmiş, yani diskte — placeholder'a gerek kalmıyor.
   * Kardeş cache'te link YOKSA (derin bağlantı, soğuk açılış) eski davranış
   * aynen sürüyor: ikisi de paralel imzalanıyor.
   */
  const cached = findEntryInCaches(queryClient, entryId);
  const reusedPhotoUrl = photoPath && cached?.photoPath === photoPath ? cached.photoUrl : null;

  let photoUrl: string | null;
  let thumbUrl: string | null;

  if (reusedPhotoUrl) {
    photoUrl = reusedPhotoUrl;
    thumbUrl = thumbPath && cached?.thumbPath === thumbPath ? cached.thumbUrl : null;
  } else {
    [photoUrl, thumbUrl] = await Promise.all([
      photoPath ? getPhotoUrl(photoPath, "full").catch(() => null) : Promise.resolve(null),
      thumbPath ? getPhotoUrl(thumbPath).catch(() => null) : Promise.resolve(null),
    ]);
  }

  return { ...data, photoUrl, photoPath, thumbUrl, thumbPath };
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
      // Şekil, queryFn'in döndürdüğüyle birebir aynı olmalı — eskiden `as any`
      // ile susturuluyordu, dolayısıyla sorgu şekli değişse placeholder sessizce
      // eksik kalırdı. Artık TypeScript ikisini senkron tutuyor.
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
    queryFn: () => fetchEditableEntry(queryClient, entryId),
  });
}

/**
 * Düzenleme verisini KULLANICI DÜĞMEYE BASMADAN ÖNCE çeker.
 *
 * Anı akışında düzenle düğmesi yalnızca kart ÇEVRİLDİĞİNDE görünüyor. Kartı
 * çevirmek ile düğmeye basmak arasında 450 ms'lik çevirme animasyonu ve
 * kullanıcının düğmeyi arayıp dokunması var — sorgu o boşlukta tamamlanıyor,
 * ekran açıldığında veri cache'te hazır oluyor ve form ilk karede dolu geliyor.
 *
 * Çevirme, "bu anıya bakıyorum" sinyali; her kaydırılan sayfa için değil
 * yalnızca çevrilen kart için çekiyoruz, yoksa akışta gezinmek onlarca
 * gereksiz sorgu üretirdi.
 */
export function usePrefetchEditableEntry() {
  const queryClient = useQueryClient();
  return useCallback(
    (entryId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.entry.edit(entryId),
        queryFn: () => fetchEditableEntry(queryClient, entryId),
        staleTime: LIST_STALE_TIME,
      });
    },
    [queryClient],
  );
}
