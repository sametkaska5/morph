import { Alert } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useCaptureStore } from "@/lib/captureStore";
import { useCaptureSheetStore } from "@/lib/captureSheetStore";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;
// Izgaralarda kare ~108pt gösteriliyor (3x ekranda ~325px) — 400px fazlasıyla yeter.
const THUMB_DIMENSION = 400;
const THUMB_QUALITY = 0.6;

/**
 * Tam boy kopyanın YANI SIRA küçük bir thumbnail de üretir.
 *
 * Thumbnail'i yükleme anında değil ÇEKİM anında üretmek zorundayız: offline
 * kaydedilen entry'ler AsyncStorage'a yalnızca base64 olarak yazılıyor
 * (SaveEntryPayload) ve uygulama kapanıp açıldıktan sonra senkronize olabiliyor —
 * o noktada orijinal dosyanın uri'si artık geçerli olmayabilir. Base64'ü baştan
 * payload'a koyunca offline akış da sorunsuz çalışıyor.
 */
export async function resizeAndCompress(uri: string) {
  const full = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  // Thumbnail'i orijinalden değil, küçültülmüş kopyadan üretiyoruz — sonuç
  // görsel olarak aynı, ama büyük dosyayı ikinci kez decode etmekten kurtuluyoruz.
  const thumb = await ImageManipulator.manipulateAsync(
    full.uri,
    [{ resize: { width: THUMB_DIMENSION } }],
    { compress: THUMB_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  return { uri: full.uri, base64: full.base64!, thumbBase64: thumb.base64! };
}

// İzin reddedildiğinde eskiden sessizce undefined dönülüyordu: kullanıcı + butonuna
// basıyor, hiçbir şey olmuyor ve nedenini anlayamıyordu. Artık ne yapması gerektiğini
// söyleyen bir uyarı gösteriyoruz.
function warnPermissionDenied(kind: "kamera" | "galeri") {
  Alert.alert(
    "İzin gerekli",
    kind === "kamera"
      ? "Fotoğraf çekebilmek için kamera iznini cihaz ayarlarından açman gerekiyor."
      : "Galeriden seçebilmek için fotoğraf erişim iznini cihaz ayarlarından açman gerekiyor."
  );
}

async function pickFromCamera() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    warnPermissionDenied("kamera");
    return;
  }
  return ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 });
}

async function pickFromLibrary() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    warnPermissionDenied("galeri");
    return;
  }
  return ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.9, exif: true });
}

// EXIF "DateTimeOriginal"/"DateTime" formatı "YYYY:MM:DD HH:MM:SS" — ISO'ya çevirip
// döndürüyoruz ki galeriden seçilen eski bir fotoğrafta kayıt tarihi elle seçilmek
// zorunda kalınmadan çekildiği güne otomatik ayarlanabilsin. Konum (iOS: düz alanlar,
// Android: aynı şekilde düz) veya EXIF hiç yoksa (ekran görüntüsü, düzenlenmiş foto) undefined döner.
function parseExifDateTime(exif: Record<string, any> | undefined | null): string | undefined {
  const raw: unknown = exif?.DateTimeOriginal ?? exif?.DateTime ?? exif?.["{TIFF}"]?.DateTime;
  if (typeof raw !== "string") return undefined;
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

async function handleResult(result: ImagePicker.ImagePickerResult | undefined) {
  if (result && !result.canceled && result.assets?.[0]?.uri) {
    const asset = result.assets[0];
    try {
      const resized = await resizeAndCompress(asset.uri);
      const takenAt = parseExifDateTime(asset.exif);
      useCaptureStore.getState().setPhoto({ ...resized, takenAt });
      router.push("/entry/new");
    } catch (err) {
      // resizeAndCompress patlarsa (bozuk/desteklenmeyen görsel, bellek yetersiz)
      // eskiden bu promise hiç await edilmediği için hata yakalanmadan yutuluyor,
      // kullanıcı da neden kayıt ekranına geçmediğini göremiyordu.
      Alert.alert("Fotoğraf işlenemedi", (err as Error).message);
    }
  }
}

/**
 * Fotoğraf çek / galeriden seç seçeneklerini uygulamanın kendi temalı sheet'inde
 * (CaptureOptionsSheet, app/_layout.tsx'te global olarak render edilir) sunar —
 * native ActionSheet/Alert cihazın kendi (genelde açık) temasını kullanıp remory'nin
 * koyu temasıyla uyuşmuyordu. Tab bar'daki + butonu ve boş-durum CTA'ları aynı
 * akışı kullanır — kod tekrarı olmasın diye burada tek yerde tanımlı.
 */
export async function openCapturePicker() {
  useCaptureSheetStore.getState().show();
}

/** CaptureOptionsSheet'teki "Fotoğraf çek" seçeneği bunu çağırır. */
export async function captureFromCamera() {
  useCaptureSheetStore.getState().hide();
  handleResult(await pickFromCamera());
}

/** CaptureOptionsSheet'teki "Galeriden seç" seçeneği bunu çağırır. */
export async function captureFromLibrary() {
  useCaptureSheetStore.getState().hide();
  handleResult(await pickFromLibrary());
}
