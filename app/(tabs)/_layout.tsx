import { Tabs, Redirect, router } from "expo-router";
import { View, Pressable, ActivityIndicator, ActionSheetIOS, Alert, Platform } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/useAuth";
import { useCaptureStore } from "@/lib/captureStore";

const ACCENT = "#8CE05A";
const MUTED = "#6B6A62";
const BG = "#0A0A08";

async function pickFromCamera() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") return;
  return ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.6, base64: true });
}

async function pickFromLibrary() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") return;
  return ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.6, base64: true });
}

function handleResult(result: ImagePicker.ImagePickerResult | undefined) {
  if (result && !result.canceled && result.assets?.[0]?.base64) {
    useCaptureStore.getState().setPhoto({
      uri: result.assets[0].uri,
      base64: result.assets[0].base64,
    });
    router.push("/entry/new");
  }
}

async function handleCapturePress() {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["İptal", "Fotoğraf çek", "Galeriden seç", "Off day işaretle"], cancelButtonIndex: 0 },
      async (buttonIndex) => {
        if (buttonIndex === 1) handleResult(await pickFromCamera());
        if (buttonIndex === 2) handleResult(await pickFromLibrary());
        if (buttonIndex === 3) router.push("/entry/off-day");
      }
    );
  } else {
    Alert.alert("Anı ekle", "Ne yapmak istersin?", [
      { text: "İptal", style: "cancel" },
      { text: "Fotoğraf çek", onPress: async () => handleResult(await pickFromCamera()) },
      { text: "Galeriden seç", onPress: async () => handleResult(await pickFromLibrary()) },
      { text: "Off day işaretle", onPress: () => router.push("/entry/off-day") },
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

export default function TabsLayout() {
  const { session, loading } = useAuth();

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
  );
}
