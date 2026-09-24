import { theme } from "@/lib/theme";
import { useState } from "react";
import { View, Pressable } from "react-native";
import { router, usePathname } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/components/Typography";

/**
 * Var olmayan bir route'a düşüldüğünde gösterilen ekran.
 *
 * Neden gerekiyor: `app.json`'da `scheme: "remory"` tanımlı, yani uygulama
 * `remory://...` derin bağlantılarını karşılıyor. Eşleşmeyen bir yol geldiğinde
 * (eski bir bildirimden, paylaşılmış bayat bir bağlantıdan, ya da elle yazılmış
 * bir adresten) expo-router bu dosyayı arıyor; yoksa kullanıcı boş bir ekranda
 * hiçbir çıkış yolu olmadan kalıyor.
 *
 * Bildirim yönlendirmesi de buraya düşebiliyor: silinmiş bir kayda işaret eden
 * "X ay önce bugün" bildirimi hâlâ işletim sisteminde bekliyor olabilir.
 *
 * Görsel dil ErrorState/ErrorBoundary ile aynı: yuvarlak sönük ikon, başlık,
 * açıklama, tek bir kurtarma düğmesi.
 */
export default function NotFound() {
  // Pressable'a fonksiyon-form style vermiyoruz (bkz. ErrorState) — basılma
  // geri bildirimi manuel onPressIn/onPressOut state'iyle.
  const [pressed, setPressed] = useState(false);
  const pathname = usePathname();

  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-border bg-surfaceMuted">
        <Feather name="compass" size={26} color={theme.colors.textFaint} />
      </View>

      {/* Başlık + açıklama tek erişilebilirlik düğümü — ErrorState ile aynı desen. */}
      <View accessible accessibilityRole="alert" className="items-center">
        <Text className="mb-2 text-center text-xl font-semibold text-text">Bu sayfa yok</Text>
        <Text className="mb-6 max-w-[280px] text-center text-base leading-6 text-textMuted">
          Aradığın bağlantı taşınmış ya da hiç var olmamış olabilir. Silinmiş bir anıya işaret eden
          eski bir bildirim de buraya düşebilir.
        </Text>
      </View>

      <Pressable
        onPress={() => router.replace("/(tabs)")}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel="Ana ekrana dön"
        className="h-12 flex-row items-center justify-center gap-2 rounded-[14px] bg-accent px-6"
        style={{ opacity: pressed ? 0.75 : 1 }}
      >
        <Feather name="home" size={16} color={theme.colors.bg} />
        <Text className="text-base font-semibold text-bg">Ana ekrana dön</Text>
      </Pressable>

      {/* Hangi yolun tutmadığı kullanıcıya değil, hata bildirimine yarıyor:
          "bağlantı çalışmıyor" diyen birinden ekran görüntüsü istediğimizde
          asıl yol elimizde olsun. Sönük ve küçük — ekranın konusu bu değil. */}
      {pathname ? <Text className="mt-6 text-xs text-textFaint">{pathname}</Text> : null}
    </View>
  );
}
