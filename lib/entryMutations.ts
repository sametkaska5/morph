import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { uploadPhoto } from "./storage";

export const SAVE_ENTRY_MUTATION_KEY = ["saveEntry"] as const;

// Sadece JSON-serileştirilebilir alanlar — bu payload AsyncStorage'a yazılıp
// uygulama offline'ken kapansa/yeniden açılsa bile aynen kalabilmeli.
export type SaveEntryPayload = {
  userId: string;
  date: string;
  note: string | null;
  values: Record<string, string>;
  photoBase64: string;
};

export async function saveEntry(payload: SaveEntryPayload) {
  const { userId, date, note, values, photoBase64 } = payload;

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .upsert({ user_id: userId, date, type: "log", note }, { onConflict: "user_id,date" })
    .select()
    .single();
  if (entryError) throw entryError;

  const storagePath = await uploadPhoto(userId, entry.id, photoBase64);

  const { data: photoRow, error: photoError } = await supabase
    .from("photos")
    .insert({ entry_id: entry.id, storage_path: storagePath, order_index: 0 })
    .select()
    .single();
  if (photoError) throw photoError;

  await supabase.from("entries").update({ cover_photo_id: photoRow.id }).eq("id", entry.id);

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
      queryClient.invalidateQueries({ queryKey: ["entries", "timeline"] });
    },
    onError: (err) => {
      console.error("saveEntry mutation başarısız:", err);
    },
  });
}
