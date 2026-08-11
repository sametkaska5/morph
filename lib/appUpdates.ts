import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Updates from "expo-updates";
import { captureError } from "./monitoring";

/**
 * Kablosuz güncelleme (EAS Update) durumu ve uygulanması.
 *
 * expo-updates açılışta kendiliğinden bir kez bakıp indiriyor, ama indirdiğini
 * ANCAK bir sonraki soğuk açılışta uyguluyor. Uygulamayı günlerce arka planda
 * tutan bir kullanıcı için bu "hiçbir zaman" demek: güncelleme cihazda hazır
 * bekliyor, kullanıcının haberi yok.
 *
 * Bu modül iki şey ekliyor: (1) uygulama öne geldiğinde tekrar bakmak,
 * (2) indirilen güncelleme hazır olduğunda kullanıcıya haber verip yeniden
 * başlatmayı ONA bıraktırmak.
 */

/**
 * İki kontrol arasındaki en kısa süre.
 *
 * Her öne gelişte bakmak, uygulamayı gün içinde onlarca kez açan kullanıcıda
 * anlamsız ağ trafiği demek — üstelik çoğu mobil veri üzerinden. 15 dakika,
 * güncellemeyi makul sürede fark etmekle gereksiz istek atmamak arasında.
 */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Şimdi kontrol edilmeli mi? Saf — zamanı dışarıdan alıyor ki test edilebilsin.
 *
 * `lastCheckedAt === null` ilk kontrol demek ve her zaman geçer: uygulama
 * açıldığında beklemeye gerek yok.
 */
export function shouldCheckForUpdate(lastCheckedAt: number | null, now: number): boolean {
  if (lastCheckedAt === null) return true;
  return now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * Güncelleme durumu.
 *
 * `ready`, expo-updates'in kendi `isUpdatePending`'inden geliyor — kendi
 * bayrağımızı tutmuyoruz. Sebebi önemli: açılıştaki OTOMATİK indirme bizim
 * kodumuzdan geçmiyor, dolayısıyla kendi state'imizi tutsaydık o durumda
 * bayrak hiç açılmaz ve zaten hazır olan güncelleme kullanıcıya hiç
 * duyurulmazdı. `isUpdatePending` her iki yolu da kapsıyor.
 */
export function useAppUpdate(): { ready: boolean; apply: () => void } {
  const { isUpdatePending } = Updates.useUpdates();
  const lastCheckedAt = useRef<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    /**
     * İKİ AYRI KAPI ve ikisi de gerekli — biri diğerini kapsamıyor:
     *
     *   __DEV__            Geliştirme derlemesi (expo-dev-client). Burada
     *                      updates YAPILANDIRMASI açık olduğu için isEnabled
     *                      `true` dönüyor, ama API'nin kendisi çalışmıyor:
     *                      checkForUpdateAsync "not supported in development
     *                      builds" diyerek reddediyor. Eskiden yalnızca
     *                      isEnabled'a bakılıyordu, dolayısıyla her açılışta
     *                      konsola kırmızı bir hata düşüyor ve Sentry'ye sahte
     *                      bir kayıt gidiyordu.
     *
     *   Updates.isEnabled  Updates'in hiç yapılandırılmadığı ortamlar.
     */
    if (__DEV__ || !Updates.isEnabled) return;

    let cancelled = false;

    async function check() {
      // Yavaş bir ağda öne/arkaya geçiş üst üste gelirse aynı kontrolü
      // paralel başlatmayalım.
      if (busy.current) return;

      const now = Date.now();
      if (!shouldCheckForUpdate(lastCheckedAt.current, now)) return;

      busy.current = true;
      lastCheckedAt.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (cancelled || !result.isAvailable) return;
        // İndirme bitince expo-updates `isUpdatePending`'i kendisi true yapıyor;
        // burada dönen sonucu ayrıca state'e yazmıyoruz (bkz. yukarıdaki not).
        await Updates.fetchUpdateAsync();
      } catch (err) {
        // Güncelleme kontrolü bir KOLAYLIK — patlaması uygulamayı etkilememeli
        // ve kullanıcıya gösterilmemeli. Ağ yoksa zaten sık sık patlayacak.
        captureError(err, { where: "updates.check" });
      } finally {
        busy.current = false;
      }
    }

    check();

    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") check();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  /**
   * İndirilmiş güncellemeyi uygular (JS'i yeniden başlatır).
   *
   * ASLA kendiliğinden çağrılmıyor — her zaman kullanıcının açık dokunuşuyla.
   * Yeniden başlatma o an ekranda ne varsa siler (yazılmakta olan not, seçilmiş
   * fotoğraf), o yüzden zamanlaması kullanıcının kararı olmalı.
   *
   * Kuyruğa alınmış çevrimdışı kayıtlar bundan etkilenmiyor: mutation'lar
   * AsyncStorage'a kalıcılaştırılıyor ve yeniden açılışta
   * `resumePausedMutations` onları devralıyor (bkz. app/_layout.tsx).
   */
  const apply = useCallback(() => {
    Updates.reloadAsync().catch((err) => captureError(err, { where: "updates.reload" }));
  }, []);

  return { ready: isUpdatePending, apply };
}
