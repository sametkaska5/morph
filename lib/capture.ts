import { Platform, ActionSheetIOS, Alert } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useCaptureStore } from "@/lib/captureStore";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

async function resizeAndCompress(uri: string) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return { uri: result.uri, base64: result.base64! };
}

async function pickFromCamera() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") return;
  return ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 });
}

async function pickFromLibrary() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") return;
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
    const resized = await resizeAndCompress(asset.uri);
    const takenAt = parseExifDateTime(asset.exif);
    useCaptureStore.getState().setPhoto({ ...resized, takenAt });
    router.push("/entry/new");
  }
}

/**
 * Fotoğraf çek / galeriden seç seçeneklerini platforma uygun şekilde (iOS: ActionSheet,
 * Android: Alert) sunar. Tab bar'daki + butonu ve Ana Ekran'ın boş-durum CTA'sı aynı
 * akışı kullanır — kod tekrarı olmasın diye burada tek yerde tanımlı.
 */
export async function openCapturePicker() {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["İptal", "Fotoğraf çek", "Galeriden seç"], cancelButtonIndex: 0 },
      async (buttonIndex) => {
        if (buttonIndex === 1) handleResult(await pickFromCamera());
        if (buttonIndex === 2) handleResult(await pickFromLibrary());
      }
    );
  } else {
    Alert.alert("Anı ekle", "Fotoğrafı nereden eklemek istersin?", [
      { text: "İptal", style: "cancel" },
      { text: "Fotoğraf çek", onPress: async () => handleResult(await pickFromCamera()) },
      { text: "Galeriden seç", onPress: async () => handleResult(await pickFromLibrary()) },
    ]);
  }
}
