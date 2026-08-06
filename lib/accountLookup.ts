import { supabase } from "./supabase";

/**
 * Verilen e-postayla bir hesap var mı.
 *
 * Neden gerekiyor: Supabase, giriş başarısız olduğunda hesabın hiç olmamasıyla
 * şifrenin yanlış olmasını ayırmadan aynı hatayı döndürüyor. Kullanıcı da
 * "e-postamı mı yanlış yazdım, şifremi mi" diye takılıp kalıyor. Bu kontrol o
 * belirsizliği kaldırıyor (bkz. migration 0011).
 *
 * Yalnızca GİRİŞ BAŞARISIZ OLDUKTAN SONRA çağrılıyor: her girişte fazladan bir
 * gidiş-dönüş yapmanın anlamı yok ve sorgu yüzeyini gereksiz genişletirdi.
 */
export type AccountCheck = "exists" | "missing" | "unknown";

export async function checkAccountExists(email: string): Promise<AccountCheck> {
  const clean = email.trim();
  if (!clean) return "unknown";

  try {
    const { data, error } = await supabase.rpc("email_exists", { check_email: clean });
    if (error) return "unknown";
    return data === true ? "exists" : "missing";
  } catch {
    // Ağ hatası, fonksiyon henüz migrate edilmemiş, yetki değişmiş... Hangisi
    // olursa olsun "unknown" dönüyoruz: çağıran taraf o zaman eski genel
    // mesaja düşüyor. Bu kontrol bir KOLAYLIK — patlaması girişi bozmamalı.
    return "unknown";
  }
}
