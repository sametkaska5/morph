import { supabase } from "./supabase";
import { deleteAllUserPhotos } from "./storage";
import { captureError } from "./monitoring";

/**
 * Hesabı ve tüm verisini kalıcı olarak siler.
 *
 * SIRALAMA VE HATA STRATEJİSİ:
 *
 * 1) Storage temizliği — başarısız olursa devam eder (aşağıya bak).
 * 2) delete_own_account RPC — auth.users satırını siler; bu cascade ile
 *    profiles/entries/photos/measurement_values/notification_settings'i
 *    de temizler. Başarısız olursa throw edilir (hesap silinmez).
 * 3) signOut — useAuth üzerinden auth ekranına yönlendirmeyi tetikler.
 *
 * NEDEN STORAGE HATASI YUTULUR:
 * Eskiden storage silme başarısız olduğunda (ağ hatası, geçici Supabase
 * kesintisi) tüm fonksiyon throw ediyordu ve kullanıcı hesabını silemiyordu.
 * Kullanıcı "sil" demiş ama hesabı hâlâ duruyor — bu daha kötü bir sonuç.
 *
 * Geride kalan dosyalar sorun olmaz: hesap silinince RLS politikaları
 * (storage.objects) o dosyalara erişimi zaten kapatır. Supabase tarafında
 * görünmez bir storage artığı kalır; gerekirse dashboard'dan manuel temizlenir.
 * Bu denge, kullanıcının isteğini yerine getirmekten daha az önemli.
 */
export async function deleteAccount(userId: string) {
  try {
    await deleteAllUserPhotos(userId);
  } catch (err) {
    // Storage temizleme başarısız — hesap silmeye devam ediyoruz.
    // Hatayı izleme servisine bildiriyoruz; kullanıcıya göstermiyoruz.
    captureError(err, { where: "deleteAccount.storage", userId });
  }

  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw error;

  await supabase.auth.signOut();
}
