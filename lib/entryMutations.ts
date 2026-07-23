import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { uploadPhoto, uploadThumb } from "./storage";

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

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .upsert({ user_id: userId, date, type: "log", note }, { onConflict: "user_id,date" })
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

  const { data: photoRow, error: photoError } = await supabase
    .from("photos")
    .insert({ entry_id: entry.id, storage_path: storagePath, thumb_path: thumbPath, order_index: 0 })
    .select()
    .single();
  if (photoError) throw photoError;

  await supabase.from("entries").update({ cover_photo_id: photoRow.id }).eq("id", entry.id);

  // Entry upsert'ü (user_id, date) çakışmasında MEVCUT kaydı yeniden kullanıyor —
  // yani aynı güne ikinci kez kayıt yapılınca eskisinin fotoğrafı hem photos
  // tablosunda hem storage'da öylece kalıyordu (ızgarada yanlış kapak + sürekli
  // büyüyen çöp dosyalar). Yeni kapağı yazdıktan sonra o entry'nin diğer tüm
  // fotoğraflarını satır ve dosya olarak temizliyoruz.
  const { data: stalePhotos } = await supabase
    .from("photos")
    .select("id, storage_path, thumb_path")
    .eq("entry_id", entry.id)
    .neq("id", photoRow.id);

  if (stalePhotos && stalePhotos.length > 0) {
    // Tam boy kopyanın yanında thumbnail'i de silmezsek storage'da yetim
    // küçük dosyalar birikir.
    const staleFiles = stalePhotos.flatMap((p) =>
      [p.storage_path, p.thumb_path].filter(Boolean) as string[]
    );
    await supabase.storage.from("photos").remove(staleFiles);
    await supabase
      .from("photos")
      .delete()
      .in("id", stalePhotos.map((p) => p.id));
  }

  const measurementRows = Object.entries(values)
    .filter(([, v]) => v.trim() !== "")
    .map(([typeId, v]) => ({
      entry_id: entry.id,
      measurement_type_id: typeId,
      value: parseFloat(v.replace(",", ".")),
    }));

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
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => {
      console.error("saveEntry mutation başarısız:", err);
    },
  });
}
