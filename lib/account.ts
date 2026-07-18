import { supabase } from "./supabase";
import { deleteAllUserPhotos } from "./storage";

/**
 * Hesabı ve tüm verisini kalıcı olarak siler: önce storage'daki fotoğraflar
 * (DB cascade'ine dahil değil), sonra delete_own_account RPC'si (0008_delete_own_account.sql)
 * ile auth.users satırı — bu da profiles/entries/photos/measurement_values/
 * notification_settings'i cascade ile temizler. En sonda local oturumu kapatıp
 * useAuth üzerinden auth ekranına yönlendirilmeyi tetikliyoruz.
 */
export async function deleteAccount(userId: string) {
  await deleteAllUserPhotos(userId);

  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw error;

  await supabase.auth.signOut();
}
