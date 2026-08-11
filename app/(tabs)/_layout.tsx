import { Tabs, Redirect } from "expo-router";
import { View, Pressable, ActivityIndicator } from "react-native";
import { useIsMutating } from "@tanstack/react-query";
import { Text } from "@/components/Typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { usePrefetchStatsScreen } from "@/lib/stats";
import { usePrefetchProfileStats } from "@/lib/profileStats";
import { useIsOnline } from "@/lib/useIsOnline";
import { useAppUpdate } from "@/lib/appUpdates";
import { openCapturePicker } from "@/lib/capture";
import { UpdateBanner } from "@/components/UpdateBanner";

/**
 * Sekme çubuğunun güvenli alan HARİÇ yüksekliği ve simgelerin üstündeki boşluk.
 *
 * Değerler, simge+etiket bloğunun ÜSTÜNDEKİ ve ALTINDAKİ boşluğu eşitlemek için
 * seçildi — göz bu iki aralığı karşılaştırıyor ve eşit olmadığında çubuk
 * "orantısız" görünüyor. Hesap (dp):
 *
 *   blok yüksekliği    = simge 24 + boşluk + etiket ≈ 44
 *   iç şerit           = 68 - 12 = 56  →  blok ortalanınca üstte/altta 6'şar
 *   ayraç → simge üstü = 12 + 6 = 18
 *   etiket → sistem tuşu üstü = 6 + (48 - 24) / 2 = 18   ✓
 *
 * Son terim, Android'in kendi gezinme çubuğunun iç boşluğu: 48dp'lik alanda
 * 24dp'lik tuşlar ortalanıyor, yani üstte 12dp boşluk kalıyor. O boşluk bizim
 * hesabımıza dahil çünkü kullanıcı iki simge sırası arasındaki TOPLAM aralığı
 * görüyor.
 */
const TAB_CONTENT_HEIGHT = 68;
const TAB_PADDING_TOP = 12;

const ACCENT = "#8CE05A";
const MUTED = "#6B6A62";
const BG = "#0A0A08";

function CaptureButton() {
  return (
    <Pressable
      onPress={openCapturePicker}
      accessibilityRole="button"
      accessibilityLabel="Anı ekle"
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
      <Text className="text-bg text-sm font-semibold text-center py-2">
        Çevrimdışısın — yeni kayıtlar internet gelince senkronize edilecek
      </Text>
    </View>
  );
}

/**
 * Hiçbir şey çizmiyor: yalnızca sekmelerin verisini arka planda hazırlıyor —
 * istatistikler (grafik serisi + hafta şeridi) ve profil (sayaçlar).
 *
 * Neden dokunuş değil de montaj: sekme çubuğu her zaman ekranda, yani "o sekmeye
 * basılabilir" hâli uygulamanın tamamı boyunca sürüyor; beklenecek bir niyet anı
 * yok. (Anı akışındaki kart çevirmeden farkı bu.)
 *
 * AYRI BİR BİLEŞEN olması bilinçli: sorgulara abone oluyor ve veri geldiğinde
 * yeniden render oluyor. Bu abonelik TabsLayout'un içinde olsaydı sekme
 * yerleşiminin tamamı o anda yeniden render olurdu — görünmez bir yan etki için
 * gereksiz bir maliyet.
 */
function TabDataPrefetcher() {
  const { user } = useAuth();
  const { data: types } = useMeasurementTypes(user?.id);
  // İstatistikler ekranı açılışta listedeki İLK tipi gösteriyor (bkz.
  // istatistikler.tsx: `activeTypeId ?? types?.[0]?.id`), ön yükleme de onu
  // hedefliyor.
  usePrefetchStatsScreen(user?.id, types?.[0]?.id);
  usePrefetchProfileStats(user?.id);
  return null;
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();
  const { ready: updateReady, apply: applyUpdate } = useAppUpdate();
  // Yeniden başlatma devam eden bir kaydı/yüklemeyi yarıda keserdi.
  const isSaving = useIsMutating() > 0;

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
      <TabDataPrefetcher />
      {!isOnline ? <OfflineBanner /> : null}
      {/* Güvenli alanı yalnızca EN ÜSTTEKİ şerit ekliyor — ikisi birden
          eklerse çentiğin altında çift boşluk oluşuyor. */}
      {updateReady ? (
        <UpdateBanner onApply={applyUpdate} withSafeArea={isOnline} busy={isSaving} />
      ) : null}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: MUTED,
          tabBarStyle: {
            backgroundColor: BG,
            borderTopColor: "rgba(255,255,255,0.08)",
            borderTopWidth: 0.5,
            // Android'in 3 tuşlu gezinme çubuğu (veya iOS home indicator) olan
            // cihazlarda sabit yükseklik, sekmeleri sistem tuşlarının olduğu bölgeye
            // çok yaklaştırıp dokunmayı zorlaştırıyordu — güvenli alanı (insets.bottom)
            // ekleyip içeriği o kadar yukarı itiyoruz.
            //
            // İçerik yüksekliği 84 DEĞİL 68: tasarım sistemindeki 84, güvenli alanı
            // OLMAYAN bir cihazda ölçülmüştü. 3 tuşlu gezinme çubuğunda (~48px)
            // 84+48=132px çıkıyordu ve simgeler ekranın altından kopuk duruyordu.
            // 68+48=116 daha derli toplu; jest çubuğunda (~16px) 84 ediyor, yani
            // eski değerin aynısı. Dokunma hedefi 68-12=56px, 48px asgarisinin
            // üstünde. Boşluk dengesinin hesabı TAB_CONTENT_HEIGHT'ın yanında.
            height: TAB_CONTENT_HEIGHT + insets.bottom,
            paddingTop: TAB_PADDING_TOP,
            paddingBottom: insets.bottom,
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
