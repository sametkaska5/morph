import { Alert } from "react-native";
import { actionErrorMessage } from "./errors";
import { captureError } from "./monitoring";

/**
 * Başarısız bir eylemi kullanıcıya bildirir VE izlemeye raporlar.
 *
 * İkisini tek çağrıda birleştirmesinin sebebi: ham hata metnini kullanıcıdan
 * gizlemek, onu tamamen kaybetmek anlamına gelmemeli. Eskiden ekranlar
 * `Alert.alert("Kayıt başarısız", (err as Error).message)` yazıyordu — kullanıcı
 * anlamsız İngilizce teknik metin görüyor, biz de hatadan haberdar olmuyorduk.
 * Bu yardımcı ikisini de düzeltiyor ve çağrı yerinde tek satır kalıyor.
 *
 * @param title  Alert başlığı — NE'nin başarısız olduğunu söyler ("Kayıt başarısız").
 * @param error  Yakalanan ham hata.
 * @param where  Sentry etiketi (örn. "profile.updateAvatar") — hangi akışın
 *               patladığını panoda ayırt edebilmek için.
 */
export function alertError(title: string, error: unknown, where: string) {
  captureError(error, { where });
  Alert.alert(title, actionErrorMessage(error));
}
