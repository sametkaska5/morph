import { useState } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

/**
 * Basınca sönen dokunulabilir alan.
 *
 * NEDEN VAR: uygulamadaki basma geri bildirimi bugüne kadar `Pressable`'ın
 * FONKSİYON biçimli `style` prop'uyla yazılıyordu:
 *
 *   style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
 *
 * Bu kalıp bu projede üç ayrı bağlamda SESSİZCE çalışmadı (özel tabBarButton
 * içinde, reanimated Animated.View içinde, sanallaştırılmış FlatList hücresinde)
 * — üçünde de fonksiyonun içinde hesaplanan STATİK bir yerleşim özelliği (arka
 * plan rengi, mutlak konum, kenar boşluğu) hiç uygulanmadı. Üçü de tek tek
 * düz stil objesine dönülerek düzeltildi.
 *
 * Bu bileşen aynı işi kurallı biçimde yapıyor: basılı olma durumu yerel state'te
 * tutuluyor, `Pressable`'a giden `style` her zaman düz bir obje. Böylece kural
 * bir belgede yazan not olmaktan çıkıp yapısal hâle geliyor.
 *
 * className: bilerek destructure EDİLMİYOR — `...rest` ile içerideki gerçek
 * `Pressable`'a geçiyor ve NativeWind dönüşümü orada, statik JSX üzerinde
 * uygulanıyor.
 */
type Props = Omit<PressableProps, "style"> & {
  /** Basılıyken uygulanacak opaklık. Öne çıkan öğelerde 0.85, ikincil olanlarda 0.6 civarı. */
  dim?: number;
  /**
   * Basılı DEĞİLKEN uygulanacak opaklık. Devre dışı / işlem sürüyor hâllerini
   * dışarıdan vermek için: `baseOpacity={loading ? 0.7 : 1}`.
   */
  baseOpacity?: number;
  style?: StyleProp<ViewStyle>;
};

export function PressableFade({
  dim = 0.6,
  baseOpacity = 1,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Props) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      {...rest}
      // Çağıranın kendi onPressIn/onPressOut'u varsa kaybolmuyor: sönümü
      // ayarladıktan sonra o da çağrılıyor.
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[{ opacity: pressed ? dim : baseOpacity }, style]}
    >
      {children}
    </Pressable>
  );
}
