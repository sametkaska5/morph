import { theme } from "@/lib/theme";
import { View } from "react-native";
import { PressableFade } from "./PressableFade";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/components/Typography";

/**
 * "Yeni sürüm hazır" şeridi.
 *
 * Neden modal/uyarı kutusu değil şerit: güncelleme acil bir şey değil ve
 * kullanıcı ne yaptığının ortasında olabilir. Ekranı kapatan bir kutu, anı
 * yazarken gelip akışı bölerdi. Şerit görünür ama engellemiyor — kullanıcı
 * hazır olduğunda dokunuyor. Desen yeni değil: çevrimdışı şeridi de aynı yerde,
 * aynı biçimde duruyor (bkz. app/(tabs)/_layout.tsx).
 *
 * Kapatma düğmesi bilerek yok: kapatılabilseydi güncelleme sessizce unutulurdu
 * ve şeridin tek amacı zaten hatırlatmak. Rahatsız etmiyor, yer kaplıyor.
 */
export function UpdateBanner({
  onApply,
  /**
   * Üstte başka bir şerit (çevrimdışı) varsa güvenli alanı O ekliyor —
   * ikisi birden eklerse çentiğin altında çift boşluk oluşuyor.
   */
  withSafeArea = true,
  /**
   * Kaydetme/yükleme sürüyor: yeniden başlatma o işi yarıda keserdi.
   * Düğme kapalı ve sebebi yazılı — sessizce tepkisiz kalmasındansa.
   */
  busy = false,
}: {
  onApply: () => void;
  withSafeArea?: boolean;
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingTop: withSafeArea ? insets.top : 0 }}
      className="bg-accentSoft border-b border-accent"
    >
      <View className="flex-row items-center gap-3 px-4 py-2.5">
        <Feather name="download" size={15} color={theme.colors.accent} />
        <View className="flex-1">
          <Text className="text-text text-sm font-semibold">Yeni sürüm hazır</Text>
          {busy ? (
            <Text className="text-textFaint text-xs mt-0.5">Kaydetme bitince yeniden başlat</Text>
          ) : null}
        </View>

        <PressableFade
          onPress={onApply}
          disabled={busy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Yeni sürüme geçmek için yeniden başlat"
          dim={0.7}
          baseOpacity={busy ? 0.4 : 1}
          className="rounded-button bg-accent px-3 py-1.5"
        >
          <Text className="text-bg text-xs font-semibold">Yeniden başlat</Text>
        </PressableFade>
      </View>
    </View>
  );
}
