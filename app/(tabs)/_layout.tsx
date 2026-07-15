import { Tabs, Redirect } from "expo-router";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { useIsOnline } from "@/lib/useIsOnline";
import { openCapturePicker } from "@/lib/capture";

const ACCENT = "#8CE05A";
const MUTED = "#6B6A62";
const BG = "#0A0A08";

function CaptureButton() {
  return (
    <Pressable
      onPress={openCapturePicker}
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: ACCENT,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "center",
        marginTop: -28,
        shadowColor: ACCENT,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Feather name="plus" size={24} color="#0B0D0A" />
    </Pressable>
  );
}

function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top }} className="bg-danger">
      <Text className="text-bg text-xs font-semibold text-center py-2">
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
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ana Ekran",
          tabBarIcon: ({ color }) => <Feather name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="zaman-kapsulu"
        options={{
          title: "Anı Akışı",
          tabBarIcon: ({ color }) => <Feather name="calendar" size={24} color={color} />,
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
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => <Feather name="user" size={24} color={color} />,
        }}
      />
      </Tabs>
    </View>
  );
}
