import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { uploadPhoto, uploadThumb } from "./storage";
import { parseMeasurementInput } from "./measurementInput";
import { nextOrderIndex } from "./photos";
import { captureError } from "./monitoring";
import { invalidateAfterDayWrite } from "./entries";

export const SAVE_ENTRY_MUTATION_KEY = ["saveEntry"] as const;

/** Persist edilen React Query cache'inin AsyncStorage anahtarı. _layout.tsx bunu
 * persister'a verir, useAuth çıkışta bununla siler — iki yerde ayrı ayrı yazılınca
 * anahtarlar birbirinden kayabildiği için tek kaynaktan okunuyor. */
export const QUERY_CACHE_STORAGE_KEY = "remory-query-cache";

// Sadece JSON-serileştirilebilir alanlar — bu payload AsyncStorage'a yazılıp
// uygulama offline'ken kapansa/yeniden açılsa bile aynen kalabilmeli.
export type SaveEntryPayload = {
  userId: string;
  date: string;
  note: string | null;
  values: Record<string, string>;
  // For single photo backwards compatibility or single photo captures
  photoBase64?: string;
  thumbBase64?: string;
  // For multiple photos (gallery selection)
  photos?: { base64: string; thumbBase64?: string }[];
};

export async function saveEntry(payload: SaveEntryPayload) {
  const { userId, date, note, values, photoBase64, thumbBase64, photos = [] } = payload;

  const photosToUpload = photos.length > 0 ? photos : [];
  if (photosToUpload.length === 0 && photoBase64) {
    photosToUpload.push({ base64: photoBase64, thumbBase64 });
  }

  // O güne ait kayıt ZATEN varsa (aynı güne ikinci fotoğraf) notunu koruyoruz.
  // Aşağıdaki upsert notu koşulsuz yazıyordu ve yeni kayıt ekranı mevcut notu
  // HİÇ göstermiyor — yani kullanıcı sabah yazdığı notu, akşam ikinci fotoğrafı
  // eklerken farkında olmadan siliyordu. (Aynı güne ikinci fotoğrafın eski
  // fotoğrafı silmesi de aynı sınıftan bir hataydı, aşağıdaki nota bakın.)
  // Kullanıcı bu ekranda not YAZDIYSA onun yazdığı kazanır.
  const { data: existingEntry } = await supabase
    .from("entries")
    .select("note")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .upsert(
      { user_id: userId, date, type: "log", note: note ?? existingEntry?.note ?? null },
      { onConflict: "user_id,date" },
    )
    .select()
    .single();
  if (entryError) throw entryError;

  const { data: existingPhotos } = await supabase
    .from("photos")
    .select("order_index")
    .eq("entry_id", entry.id);

  let startOrderIndex = nextOrderIndex(existingPhotos ?? []);
  let lastPhotoId: string | null = null;

  for (const p of photosToUpload) {
    const storagePath = await uploadPhoto(userId, entry.id, p.base64);

    let thumbPath: string | null = null;
    if (p.thumbBase64) {
      try {
        thumbPath = await uploadThumb(userId, entry.id, p.thumbBase64);
      } catch (err) {
        captureError(err, { where: "saveEntry.thumb", userId, entryId: entry.id });
      }
    }

    const { data: photoRow, error: photoError } = await supabase
      .from("photos")
      .insert({
        entry_id: entry.id,
        storage_path: storagePath,
        thumb_path: thumbPath,
        order_index: startOrderIndex++,
      })
      .select()
      .single();
    if (photoError) throw photoError;
    lastPhotoId = photoRow.id;
  }

  // En son eklenen kapak olur: kullanıcı az önce çektiği fotoğrafı ızgarada
  // görmeyi bekler. Diğerleri duruyor, detay ekranından erişilebiliyor.
  if (lastPhotoId) {
    await supabase.from("entries").update({ cover_photo_id: lastPhotoId }).eq("id", entry.id);
  }

  // Değerler buraya new.tsx'ten zaten temizlenmiş (metrik) gelir; yine de
  // parseMeasurementInput ile geçiriyoruz — offline'da kuyruğa alınıp sonra
  // resume edilen eski payload'lar dahil, DB'ye NaN yazılmasın (savunma katmanı).
  const measurementRows = Object.entries(values)
    .map(([typeId, v]) => {
      const num = parseMeasurementInput(v);
      return num === null ? null : { entry_id: entry.id, measurement_type_id: typeId, value: num };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (measurementRows.length > 0) {
    const { error: valuesError } = await supabase
      .from("measurement_values")
      .upsert(measurementRows, { onConflict: "entry_id,measurement_type_id" });
    if (valuesError) throw valuesError;
  }

  return entry;
}

/**
 * mutationFn'i queryClient'a kayıtlı tutar. React Query, offline'ken kuyruğa alınan
 * (paused) mutation'ları yeniden hydrate ederken sadece mutationKey + variables'ı
 * AsyncStorage'dan okuyabiliyor — asıl fonksiyonu (closure) hatırlamıyor. Bu yüzden
 * mutationFn'i component içinde değil, burada global olarak tanımlayıp uygulama
 * açılışında bir kere kaydediyoruz; restart sonrası resumePausedMutations() bu
 * kayıtlı fonksiyonu bulup kaldığı yerden devam ettirebiliyor.
 */
export function registerEntryMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(SAVE_ENTRY_MUTATION_KEY, {
    mutationFn: saveEntry,
    // Tazelenecek sorguların listesi tek yerde (bkz. invalidateAfterDayWrite).
    // Eskiden burada elle üç anahtar sayılıyordu ve currentWeek ile
    // shareablePhotos atlanmıştı: yeni fotoğraf eklendikten sonra istatistiklerdeki
    // hafta şeridi bayat kalıyor, paylaşım kartının listesinde o gün görünmüyordu.
    onSuccess: () => invalidateAfterDayWrite(queryClient),
    onError: (err) => {
      // Bu, offline'da kuyruğa alınıp sonra resume edilen senkronları da kapsar —
      // kullanıcı ekranda olmayabilir, o yüzden sessiz kalması en tehlikeli yer.
      captureError(err, { where: "saveEntry" });
    },
  });
}
