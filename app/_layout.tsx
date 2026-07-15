import "../global.css";
import { View, Text, TextInput } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { AuthProvider } from "@/lib/useAuth";
import { registerEntryMutationDefaults } from "@/lib/entryMutations";

// Uygulamadaki HER Text/TextInput varsayılan olarak Inter kullansın — font-* sınıfı
// (font-semibold, font-bold vb.) olmayan yerler bile Inter Regular'a düşsün, sistem
// fontuna (SF Pro/Roboto) geri dönmesin. Ağırlık sınıfları (font-bold vb.) zaten
// tailwind.config.js'teki custom plugin ile doğru Inter dosyasına eşleniyor.
(Text as any).defaultProps = { ...(Text as any).defaultProps, style: [{ fontFamily: "Inter_400Regular" }, (Text as any).defaultProps?.style] };
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: [{ fontFamily: "Inter_400Regular" }, (TextInput as any).defaultProps?.style] };

// React Native'de `navigator.onLine` yok — React Query varsayılan olarak her zaman
// online sanır. NetInfo'ya bağlamazsak offline'da mutation'lar hiç duraklamaz/kuyruğa
// girmez, direkt hata verir.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => setOnline(!!state.isConnected));
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 gün — offline'da eski veri görünmeye devam etsin
    },
  },
});
registerEntryMutationDefaults(queryClient);

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "remory-query-cache",
});

// Bir sorgunun döndürdüğü veri şekli değiştiğinde (örn. yeni bir alan eklendiğinde)
// bu sürümü artır — persist edilmiş eski-şekilli cache tamamen atılıp sıfırdan
// fetch edilir. Aksi halde restore edilen eski veri yeni koda "undefined alan" olarak
// çarpar (bkz: zaman-kapsulu.tsx measurements alanı eklenince yaşanan çökme).
const PERSIST_CACHE_BUSTER = "2";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Fontlar yüklenmeden render edilirse metinler bir an sistem fontuyla (SF Pro/Roboto)
  // görünüp Inter yüklenince değişir (göz kırpması) — o yüzden yüklenene kadar bekletiyoruz.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: "#0A0A08" }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: PERSIST_CACHE_BUSTER }}
        onSuccess={() => {
          // Uygulama kapalıyken kuyruğa alınmış (offline'da eklenmiş) kayıtları,
          // restore tamamlanır tamamlanmaz senkronize etmeyi dener.
          queryClient.resumePausedMutations();
        }}
      >
        <AuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(onboarding)/welcome" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="entry/new" options={{ presentation: "modal" }} />
            <Stack.Screen name="entry/off-day" options={{ presentation: "modal" }} />
            <Stack.Screen name="entry/[id]" />
            <Stack.Screen name="entry/edit/[id]" options={{ presentation: "modal" }} />
            <Stack.Screen name="compare/pick" options={{ presentation: "modal" }} />
            <Stack.Screen name="compare" options={{ presentation: "modal" }} />
            <Stack.Screen name="calendar-year" />
            <Stack.Screen name="settings/notifications" options={{ presentation: "modal" }} />
            <Stack.Screen name="settings/measurements" options={{ presentation: "modal" }} />
            <Stack.Screen name="settings/help" options={{ presentation: "modal" }} />
          </Stack>
        </AuthProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
