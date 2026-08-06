import "../global.css";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Stack, router } from "expo-router";
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
import { registerAuthAutoRefresh } from "@/lib/supabase";
import { registerEntryMutationDefaults, QUERY_CACHE_STORAGE_KEY } from "@/lib/entryMutations";
import { maybeSweepOrphans } from "@/lib/orphanSweep";
import {
  refreshMemoryNotifications,
  getInitialNotificationTap,
  addNotificationTapListener,
  type NotificationTap,
} from "@/lib/notifications";
import { useNotificationSettings } from "@/lib/notificationSettings";
import { initMonitoring } from "@/lib/monitoring";
import { CaptureOptionsSheet } from "@/components/CaptureOptionsSheet";
import { AppAlert } from "@/components/AppAlert";
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

// Oturum yenilemesini ön/arka plan durumuna bağla — gerekçesi lib/supabase.ts'te.
// Süreç boyunca tek bir abonelik; kök layout hiç unmount olmadığı için kaldırılmıyor.
registerAuthAutoRefresh();

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
});

// Bir sorgunun döndürdüğü veri şekli değiştiğinde (örn. yeni bir alan eklendiğinde)
// bu sürümü artır — persist edilmiş eski-şekilli cache tamamen atılıp sıfırdan
// fetch edilir. Aksi halde restore edilen eski veri yeni koda "undefined alan" olarak
// çarpar (bkz: zaman-kapsulu.tsx measurements alanı eklenince yaşanan çökme).
const PERSIST_CACHE_BUSTER = "4";

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

/**
 * "Geçmiş anı" bildirimlerini açılışta yeniden kurar.
 *
 * İşletim sisteminin bekleyen bildirim sınırı yüzünden aynı anda yalnızca en
 * yakın N tanesi zamanlanıyor (bkz. lib/memoryMilestones.ts). Tetiklenenlerin
 * yerine sıradakiler ancak yeniden hesaplanınca giriyor — bu olmadan ilk parti
 * tükendikten sonra kullanıcı bir daha hiç anı bildirimi almazdı.
 *
 * OrphanSweeper ile aynı desen: görünür bir şey render etmez, açılışla
 * yarışmasın diye geciktirilir, hatası kullanıcıya gösterilmez.
 */
function MemoryNotificationRefresher() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: settings } = useNotificationSettings(userId);
  const enabled = settings?.past_memory_enabled;
  const reminderTime = settings?.reminder_time;

  useEffect(() => {
    if (!userId || !enabled || !reminderTime) return;
    const t = setTimeout(() => {
      refreshMemoryNotifications(userId, reminderTime);
    }, 6000);
    return () => clearTimeout(t);
  }, [userId, enabled, reminderTime]);
  return null;
}

/**
 * "X ay önce bugün" bildirimine dokunulduğunda o kaydın detayını açar.
 *
 * Bildirimler `data: { entryId }` taşıyor (bkz. scheduleMemoryNotifications) ama
 * bunu okuyan kimse yoktu: dokunan kullanıcı hangi anı için uyarıldığını
 * göremeden ana ekrana düşüyordu.
 *
 * İki ayrı yol var çünkü dokunma iki farklı durumda gelebiliyor: uygulama
 * kapalıyken (süreç bildirimle başlıyor, dinleyici olaya yetişemiyor → son yanıt
 * sorgulanıyor) ve uygulama açıkken (dinleyici). Soğuk açılışta İKİSİ birden
 * tetiklenebiliyor, o yüzden bildirim kimliğiyle tekilleştiriyoruz — aksi halde
 * aynı kayıt üst üste iki kez push edilip geri tuşu kullanıcıyı aynı ekrana
 * geri getirirdi.
 *
 * Oturum açılmadan yönlendirmiyoruz: `(tabs)` dışındaki bir route'a giriş
 * ekranının üstünden push etmek kullanıcıyı kimliksiz bir detay ekranında
 * bırakırdı.
 */
function NotificationRouter() {
  const { session, loading } = useAuth();
  const ready = !loading && !!session;
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    const go = (tap: NotificationTap) => {
      if (handledId.current === tap.notificationId) return;
      handledId.current = tap.notificationId;
      router.push(`/entry/${tap.entryId}`);
    };

    getInitialNotificationTap().then((tap) => {
      if (tap) go(tap);
    });

    return addNotificationTapListener(go);
  }, [ready]);

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
            <MemoryNotificationRefresher />
            <NotificationRouter />
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
            <AppAlert />
          </AuthProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
