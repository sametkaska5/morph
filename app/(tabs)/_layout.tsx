import { Tabs, Redirect, router } from "expo-router";
import { View, Text, Pressable, ActivityIndicator, ActionSheetIOS, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useAuth } from "@/lib/useAuth";
import { useCaptureStore } from "@/lib/captureStore";
import { useIsOnline } from "@/lib/useIsOnline";

const ACCENT = "#8CE05A";
const MUTED = "#6B6A62";
const BG = "#0A0A08";

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

async function handleCapturePress() {
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

function CaptureButton() {
  return (
    <Pressable
      onPress={handleCapturePress}
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: ACCENT,
        alignItems: "center",
        justifyContent: "center",
        marginTop: -26,
        shadowColor: ACCENT,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Feather name="plus" size={22} color="#0B0D0A" />
    </Pressable>
  );
}

function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top }} className="bg-danger">
      <Text className="text-bg text-[10px] font-semibold text-center py-1">
        Çevrimdışısın — yeni kayıtlar internet gelince senkronize edilecek
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const isOnline = useIsOnline();

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#8CE05A" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <View style={{ flex: 1 }}>
      {!isOnline ? <OfflineBanner /> : null}
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: "rgba(255,255,255,0.08)",
          borderTopWidth: 0.5,
          height: 84,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 9 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ana Ekran",
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="zaman-kapsulu"
        options={{
          title: "Zaman Kapsülü",
          tabBarIcon: ({ color }) => <Feather name="calendar" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: "",
          tabBarIcon: () => null,
          tabBarButton: () => <CaptureButton />,
        }}
      />
      <Tabs.Screen
        name="istatistikler"
        options={{
          title: "İstatistikler",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
      </Tabs>
    </View>
  );
}
