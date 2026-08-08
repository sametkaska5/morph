import { ReactNode, useEffect } from "react";
import { View, Pressable, Modal } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const DISMISS_DISTANCE = 100; // bu kadar aşağı çekilirse kapanır
const DISMISS_VELOCITY = 800; // ya da bu hızda hızlıca çekilirse (mesafe yetmese bile)

/**
 * Alttan açılan, üstündeki çubuktan aşağı sürükleyerek kapatılabilen temalı sheet.
 * RN Modal'ın kendi "fade" geçişi Android'de yavaş hissettirdiği için kendi hızlı
 * (~150ms) animasyonumuzu kullanıyoruz. CaptureOptionsSheet ve Profil'deki Birimler
 * sheet'i bunu paylaşıyor — yeni bir sheet gerekirse burayı kullan, koddan kopyalama.
 */
export function DraggableSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // Sheet ekranın EN ALTINA yaslanıyor, yani gezinme çubuğunun üstüne denk
  // geliyor. Sabit `pb-10` (40px) 3 tuşlu gezinme çubuğunun (~48px) altında
  // kalıyordu: en alttaki seçenek sistem tuşlarının arkasına giriyordu.
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 150 });
      backdropOpacity.value = withTiming(1, { duration: 150 });
    } else {
      translateY.value = 600;
      backdropOpacity.value = 0;
    }
  }, [visible, translateY, backdropOpacity]);

  // Not: aşağıdaki eslint-disable'lar yanlış pozitif — Reanimated shared value'ya
  // (.value) worklet içinden yazmak kütüphanenin standart kullanımı; react-hooks'un
  // yeni immutability kuralı bunu "effect'te kullanılan değeri mutasyon" sanıyor.
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        // eslint-disable-next-line react-hooks/immutability
        translateY.value = withTiming(600, { duration: 150 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 18 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, backdropStyle]}>
          {/* Arka plan hem karartma hem kapatma hedefi. Etiketsizken ekran
              okuyucu onu "isimsiz düğme" olarak duyuruyordu — ne olduğu ve
              basılınca ne olacağı belirsizdi. */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            className="flex-1 bg-black/60 justify-end"
          >
            <Animated.View style={sheetStyle}>
              {/* Bu Pressable yalnızca dokunmayı yutuyor (sheet'e basmak
                  kapatmasın diye) — bir eylem değil, o yüzden ekran okuyucuya
                  düğme olarak sunulmuyor. accessibilityViewIsModal odağı
                  sheet'in içinde tutuyor. */}
              <Pressable
                onPress={() => {}}
                accessible={false}
                accessibilityViewIsModal
                style={{ paddingBottom: insets.bottom + 24 }}
                className="bg-bg border-t border-border rounded-t-[24px] px-5"
              >
                <GestureDetector gesture={panGesture}>
                  {/* Sürükleme tutamağı görsel bir ipucu; okunacak bir içeriği yok. */}
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    className="items-center py-3"
                  >
                    <View className="w-10 h-1.5 rounded-full bg-white/25" />
                  </View>
                </GestureDetector>
                {children}
              </Pressable>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
