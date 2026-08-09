import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { uploadPhoto, uploadThumb } from "./storage";
import { parseMeasurementInput } from "./measurementInput";
import { nextOrderIndex } from "./photos";
import { captureError } from "./monitoring";
import { queryKeys } from "./queryKeys";

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
  photoBase64: string;
  /**
   * Izgaralarda kullanılan küçük kopya. Opsiyonel çünkü bu alan eklenmeden ÖNCE
   * offline kuyruğa alınmış (AsyncStorage'da bekleyen) mutation'lar bunu
   * taşımıyor — onlar da senkronize olabilmeli, sadece thumbnail'siz kalırlar.
   */
  thumbBase64?: string;
};

export async function saveEntry(payload: SaveEntryPayload) {
  const { userId, date, note, values, photoBase64, thumbBase64 } = payload;

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
      { onConflict: "user_id,date" }
    )
    .select()
    .single();
  if (entryError) throw entryError;

  const storagePath = await uploadPhoto(userId, entry.id, photoBase64);

  // Thumbnail bir optimizasyon — yüklenemezse kaydı düşürmüyoruz, thumb_path
  // null kalır ve okuyan taraf tam boya geri düşer.
  let thumbPath: string | null = null;
  if (thumbBase64) {
    try {
      thumbPath = await uploadThumb(userId, entry.id, thumbBase64);
    } catch (err) {
      console.warn("thumbnail yüklenemedi, tam boy kullanılacak:", err);
    }
  }

  // Entry upsert'ü (user_id, date) çakışmasında MEVCUT kaydı yeniden kullanıyor:
  // aynı güne ikinci kez fotoğraf çekmek yeni bir gün değil, o güne bir fotoğraf
  // daha eklemek demek. Bu yüzden order_index'i mevcutların ARDINA koyuyoruz.
  //
  // Eskiden burada o entry'nin diğer tüm fotoğrafları satır ve dosya olarak
  // SİLİNİYORDU (kapak karışıklığını çözmek için). Sonucu şuydu: sabah bir
  // fotoğraf çekip akşam bir tane daha çeken kullanıcı sabahkini geri dönüşsüz
  // kaybediyordu — üstelik hiçbir uyarı görmeden. Kapak karışıklığı artık
  // silerek değil, kapağı açıkça YENİ fotoğrafa vererek çözülüyor.
  const { data: existingPhotos } = await supabase
    .from("photos")
    .select("order_index")
    .eq("entry_id", entry.id);

  const { data: photoRow, error: photoError } = await supabase
    .from("photos")
    .insert({
      entry_id: entry.id,
      storage_path: storagePath,
      thumb_path: thumbPath,
      order_index: nextOrderIndex(existingPhotos ?? []),
    })
    .select()
    .single();
  if (photoError) throw photoError;

  // En son eklenen kapak olur: kullanıcı az önce çektiği fotoğrafı ızgarada
  // görmeyi bekler. Diğerleri duruyor, detay ekranından erişilebiliyor.
  await supabase.from("entries").update({ cover_photo_id: photoRow.id }).eq("id", entry.id);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      // Yeni kayıt ölçüm de içerebilir — istatistik grafiği güncel kalsın.
      queryClient.invalidateQueries({ queryKey: queryKeys.measurementSeries.all });
    },
    onError: (err) => {
      // Bu, offline'da kuyruğa alınıp sonra resume edilen senkronları da kapsar —
      // kullanıcı ekranda olmayabilir, o yüzden sessiz kalması en tehlikeli yer.
      captureError(err, { where: "saveEntry" });
    },
  });
}
