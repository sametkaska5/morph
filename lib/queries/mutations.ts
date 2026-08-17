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
    (p) => [p.storage_path, p.thumb_path].filter(Boolean) as string[],
  );

  // cover_photo_id → photos.id FK'sini silmeden önce boşaltıyoruz.
  // Yalnızca fotoğrafı olan kayıtlarda: fotoğraf yoksa kapak da zaten null
  // (FK "on delete set null"), yani fazladan bir sorgu olurdu.
  if (paths.length > 0) {
    await supabase.from("entries").update({ cover_photo_id: null }).eq("id", entryId);
  }

  // SIRA ÖNEMLİ — satırlar ÖNCE, dosyalar SONRA.
  //
  // Eskiden tersiydi: dosyalar silinip ardından satır silme patlarsa geride
  // DOSYASI OLMAYAN bir kayıt kalıyordu — ızgarada ve akışta kırık görsel,
  // kullanıcı için geri dönüşü yok. Bu sırayla en kötü durum, satırı gitmiş ama
  // dosyası kalmış bir yetim: kullanıcı hiç görmüyor ve günlük süpürme topluyor
  // (bkz. lib/orphanSweep.ts). İki başarısızlıktan geri alınabilir olanı seçiyoruz.
  //
  // photos satırları ayrıca silinmiyor: photos.entry_id "on delete cascade"
  // (0001_init.sql), yani entry gidince onlar da gidiyor.
  //
  // lib/photos.ts'teki deleteEntryPhoto aynı sırayı aynı gerekçeyle kullanıyor.
  const { error } = await supabase.from("entries").delete().eq("id", entryId);
  if (error) throw error;

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("photos").remove(paths);
    if (storageError) throw storageError;
  }

  return true;
}

/**
 * Bir GÜNÜN kaydı (entries satırı) eklendiğinde, değiştiğinde ya da
 * silindiğinde tazelenmesi gereken TÜM sorgular.
 *
 * Neden tek fonksiyon: bu listeyi üç ayrı yazma yolu (yeni fotoğraflı kayıt,
 * fotoğrafsız gün, antrenman programı) ve silme, dördü de kendi içinde elle
 * sayıyordu — ve dördü de farklı şeyleri atlıyordu. Örnekler:
 *   - yeni kayıt currentWeek'i atlıyordu → yeni fotoğraf eklendikten sonra
 *     istatistiklerdeki hafta şeridi ve seri sayacı bayat kalıyordu,
 *   - yeni kayıt shareablePhotos'u atlıyordu → paylaşım kartının fotoğraf
 *     listesinde son eklenen gün görünmüyordu,
 *   - fotoğrafsız gün programDay'i, program da workoutDay'i atlıyordu → iki
 *     ekran birbirinin yazdığı günü eski hâliyle gösteriyordu.
 * Liste tek yerde olunca "hangi ekran neye dayanıyor" sorusu bir kez cevaplanıyor.
 *
 * Hepsi `all` anahtarı: React Query önek eşleşmesi yaptığı için alt anahtarların
 * tamamını (tarih/kullanıcı/ölçüm bazlı olanlar dahil) kapsıyor.
 */
export function invalidateAfterDayWrite(queryClient: QueryClient) {
  return Promise.all([
    // Listeler: ızgara, anı akışı, arama, karşılaştırma seçimi, sıra, yıl takvimi.
    queryClient.invalidateQueries({ queryKey: queryKeys.entries.all }),
    // Tek kayıt: detay ekranı + düzenleme formu.
    queryClient.invalidateQueries({ queryKey: queryKeys.entry.all }),
    // Hafta şeridi ve ondan hesaplanan seri sayacı.
    queryClient.invalidateQueries({ queryKey: queryKeys.currentWeek.all }),
    // Fotoğrafsız gün ekranı — "bu günün fotoğraflı kaydı var" koruması buna dayanıyor.
    queryClient.invalidateQueries({ queryKey: queryKeys.workoutDay.all }),
    // Antrenman programı ekranı: o tarihteki entry'yi kimliğiyle okuyor.
    queryClient.invalidateQueries({ queryKey: queryKeys.programDay.all }),
    // "Toplam Anı", seriler, kilo değişimi, kaç aydır.
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.all }),
    // Ölçüm grafiği.
    queryClient.invalidateQueries({ queryKey: queryKeys.measurementSeries.all }),
    // Paylaşım kartında seçilebilen fotoğraflar.
    queryClient.invalidateQueries({ queryKey: queryKeys.shareablePhotos.all }),
  ]);
}

/**
 * Cache invalidation burada (veri katmanının sorumluluğu); navigasyon gibi
 * ekrana özgü işler çağıran tarafın mutate(id, { onSuccess }) callback'inde.
 */
export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => deleteEntry(entryId),
    onSuccess: () => invalidateAfterDayWrite(queryClient),
  });
}
