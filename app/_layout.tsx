import "../global.css";
import { useEffect } from "react";
import { View } from "react-native";
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
import { AuthProvider, useAuth } from "@/lib/useAuth";
import { registerEntryMutationDefaults, QUERY_CACHE_STORAGE_KEY } from "@/lib/entryMutations";
import { maybeSweepOrphans } from "@/lib/orphanSweep";
import { initMonitoring } from "@/lib/monitoring";
import { CaptureOptionsSheet } from "@/components/CaptureOptionsSheet";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// NOT: Buradaki varsayılan font ataması eskiden `Text.defaultProps` ile yapılıyordu.
// React 19 fonksiyon bileşenlerinde defaultProps desteğini kaldırdığı için o kod
// sessizce hiçbir işe yaramıyordu. Varsayılan font artık components/Typography.tsx
// içindeki Text/TextInput sarmalayıcılarında tanımlı — ekranlar RN yerine oradan
// import ediyor.

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

// Hata izlemeyi uygulama açılışında bir kez başlat (DSN yoksa no-op).
initMonitoring();

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
});

// Bir sorgunun döndürdüğü veri şekli değiştiğinde (örn. yeni bir alan eklendiğinde)
// bu sürümü artır — persist edilmiş eski-şekilli cache tamamen atılıp sıfırdan
// fetch edilir. Aksi halde restore edilen eski veri yeni koda "undefined alan" olarak
// çarpar (bkz: zaman-kapsulu.tsx measurements alanı eklenince yaşanan çökme).
const PERSIST_CACHE_BUSTER = "2";

// Yetim dosya süpürmesini uygulama açılışında tetikler. Görünür bir şey render
// etmez. Süpürme fire-and-forget (maybeSweepOrphans kendi içinde günde bir kez
// çalışır ve hataları yutar); startup'la yarışmasın diye birkaç saniye
// geciktiriyoruz — asıl veri yüklemesi ve resumePausedMutations öne geçsin.
function OrphanSweeper() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      maybeSweepOrphans(userId);
    }, 5000);
    return () => clearTimeout(t);
  }, [userId]);
  return null;
}

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
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            buster: PERSIST_CACHE_BUSTER,
          }}
          onSuccess={() => {
            // Uygulama kapalıyken kuyruğa alınmış (offline'da eklenmiş) kayıtları,
            // restore tamamlanır tamamlanmaz senkronize etmeyi dener.
            queryClient.resumePausedMutations();
          }}
        >
          <AuthProvider>
            <OrphanSweeper />
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(onboarding)/welcome" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="forgot-password" options={{ presentation: "modal" }} />
              <Stack.Screen name="privacy-policy" options={{ presentation: "modal" }} />
              <Stack.Screen name="terms" options={{ presentation: "modal" }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="entry/new" options={{ presentation: "modal" }} />
              <Stack.Screen name="entry/workout" options={{ presentation: "modal" }} />
              <Stack.Screen name="entry/program" options={{ presentation: "modal" }} />
              <Stack.Screen name="entry/[id]" />
              <Stack.Screen name="entry/edit/[id]" options={{ presentation: "modal" }} />
              <Stack.Screen name="compare/pick" options={{ presentation: "modal" }} />
              <Stack.Screen name="compare" options={{ presentation: "modal" }} />
              <Stack.Screen name="calendar-year" />
              <Stack.Screen name="search" options={{ presentation: "modal" }} />
              <Stack.Screen name="profile/edit" options={{ presentation: "modal" }} />
              <Stack.Screen name="settings/notifications" options={{ presentation: "modal" }} />
              <Stack.Screen name="settings/measurements" options={{ presentation: "modal" }} />
              <Stack.Screen name="settings/help" options={{ presentation: "modal" }} />
            </Stack>
            <CaptureOptionsSheet />
          </AuthProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
