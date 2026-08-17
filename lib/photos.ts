import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { uploadPhoto, uploadThumb } from "./storage";
import { resizeAndCompress } from "./capture";
import { queryKeys } from "./queryKeys";

/**
 * Bir günün FOTOĞRAFLARI — ekleme, silme, kapak seçme.
 *
 * Şema ilk günden beri çoklu fotoğrafa hazırdı (photos.entry_id + order_index +
 * entries.cover_photo_id) ama uygulama tarafı gün başına tek fotoğraf
 * varsayıyordu: aynı güne ikinci kez fotoğraf eklenince saveEntry eskisini hem
 * satır hem dosya olarak SİLİYORDU. Bu modül o varsayımı kaldırıyor.
 */

type PhotoRow = { id: string; storage_path: string; order_index: number };

/**
 * Görüntüleme sırası: kapak HER ZAMAN başta, kalanlar order_index'e göre.
 *
 * Saf fonksiyon çünkü sıralama kullanıcının gördüğü şeyi doğrudan belirliyor —
 * kapak başta değilse detay ekranı ızgaradakinden farklı bir fotoğrafla açılır
 * ve kullanıcı yanlış güne baktığını sanır.
 */
export function orderEntryPhotos<T extends PhotoRow>(
  rows: T[],
  coverPhotoId: string | null | undefined,
): T[] {
  const rest = rows
    .filter((p) => p.id !== coverPhotoId)
    .sort((a, b) => a.order_index - b.order_index || (a.id < b.id ? -1 : 1));
  const cover = rows.find((p) => p.id === coverPhotoId);
  return cover ? [cover, ...rest] : rest;
}

/** Yeni fotoğraf hangi order_index'i alacak — mevcut en büyüğün bir fazlası. */
export function nextOrderIndex(rows: Pick<PhotoRow, "order_index">[]): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.order_index)) + 1;
}

/**
 * Kapak silinince yerine kim geçer: sıradaki ilk fotoğraf. Hiç kalmıyorsa null
 * (çağıran taraf zaten son fotoğrafın silinmesine izin vermiyor).
 */
export function nextCoverAfterDelete<T extends { id: string }>(
  ordered: T[],
  deletedId: string,
): string | null {
  const remaining = ordered.filter((p) => p.id !== deletedId);
  return remaining[0]?.id ?? null;
}

async function invalidateEntryViews(
  queryClient: ReturnType<typeof useQueryClient>,
  entryId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.entry.detail(entryId) }),
    // Kapak değişmiş olabilir: ızgara, anı akışı, arama ve karşılaştırma
    // seçimi hepsi kapağı gösteriyor.
    queryClient.invalidateQueries({ queryKey: queryKeys.entries.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.shareablePhotos.all }),
  ]);
}

/* ─────────────────────────── Ekleme ─────────────────────────── */

export type AddPhotosPayload = { userId: string; entryId: string; uris: string[] };

export async function addPhotosToEntry({ userId, entryId, uris }: AddPhotosPayload) {
  const { data: existing, error: readError } = await supabase
    .from("photos")
    .select("id, storage_path, order_index")
    .eq("entry_id", entryId);
  if (readError) throw readError;

  const baseOrder = nextOrderIndex(existing ?? []);

  /**
   * Fotoğrafları PARALEL işle: her birinin resize+compress+upload zinciri
   * bağımsız olduğundan aynı anda yürütülebilir.
   *
   * Eskiden: for döngüsü her fotoğrafı sırayla bekliyordu — 5 fotoğraf seçmek
   * 5× işlem süresi demekti. Şimdi hepsi birlikte başlıyor.
   *
   * Sıra korunuyor: Promise.all sonuçları giriş dizisiyle aynı sıradadır,
   * order_index başta atandığı için paralel tamamlansa da sıralama kaymaz.
   *
   * Bellek notu: tüm base64'ler eş zamanlı bellekte duruyor. Galeriden çoklu
   * seçimde bu zaten seçim anındaki durumla aynı; büyük fotoğraf sayısında
   * (10+) bellek baskısı oluşabilir — şimdilik ImagePicker'ın kendi sınırı
   * bunu pratikte engelliyor.
   */
  const results = await Promise.all(
    uris.map(async (uri, i) => {
      const { base64, thumbBase64 } = await resizeAndCompress(uri);
      const storagePath = await uploadPhoto(userId, entryId, base64);

      // Thumbnail üretimi başarısız olsa bile fotoğrafı kaybetmiyoruz:
      // thumb_path null kalır, okuyan taraf storage_path'e düşer (bkz. migration 0009).
      let thumbPath: string | null = null;
      try {
        thumbPath = await uploadThumb(userId, entryId, thumbBase64);
      } catch {
        thumbPath = null;
      }

      return { storagePath, thumbPath, order_index: baseOrder + i };
    }),
  );

  // Tüm fotoğrafları TEK toplu INSERT ile kaydet.
  const rows = results.map((r) => ({
    entry_id: entryId,
    storage_path: r.storagePath,
    thumb_path: r.thumbPath,
    order_index: r.order_index,
  }));
  const { error: insertError } = await supabase.from("photos").insert(rows);
  if (insertError) throw insertError;
}

export function useAddEntryPhotos(entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<AddPhotosPayload, "entryId">) =>
      addPhotosToEntry({ ...payload, entryId }),
    onSuccess: () => invalidateEntryViews(queryClient, entryId),
  });
}

/* ─────────────────────────── Silme ─────────────────────────── */

export async function deleteEntryPhoto(photoId: string, nextCoverId: string | null) {
  const { data: photo, error: readError } = await supabase
    .from("photos")
    .select("id, entry_id, storage_path, thumb_path")
    .eq("id", photoId)
    .single();
  if (readError) throw readError;

  // Kapağı ÖNCE devrediyoruz: satır silinince cover_photo_id FK'si
  // "on delete set null" ile boşalır ve ızgara o günü fotoğrafsız gösterirdi.
  if (nextCoverId) {
    const { error: coverError } = await supabase
      .from("entries")
      .update({ cover_photo_id: nextCoverId })
      .eq("id", photo.entry_id);
    if (coverError) throw coverError;
  }

  const { error: deleteError } = await supabase.from("photos").delete().eq("id", photoId);
  if (deleteError) throw deleteError;

  // Dosyaları en sona bırakıyoruz: satır silinmeden dosya silinseydi ve satır
  // silme patlasaydı, geride dosyası olmayan bir kayıt kalırdı (kırık görsel).
  const files = [photo.storage_path, photo.thumb_path].filter(Boolean) as string[];
  if (files.length > 0) {
    await supabase.storage.from("photos").remove(files);
  }
}

export function useDeleteEntryPhoto(entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId, nextCoverId }: { photoId: string; nextCoverId: string | null }) =>
      deleteEntryPhoto(photoId, nextCoverId),
    onSuccess: () => invalidateEntryViews(queryClient, entryId),
  });
}

/* ─────────────────────────── Kapak seçme ─────────────────────────── */

export function useSetCoverPhoto(entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      const { error } = await supabase
        .from("entries")
        .update({ cover_photo_id: photoId })
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => invalidateEntryViews(queryClient, entryId),
  });
}
