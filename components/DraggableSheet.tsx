import { ReactNode, useEffect } from "react";
import { View, Pressable, Modal } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
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

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
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
          <Pressable onPress={onClose} className="flex-1 bg-black/60 justify-end">
            <Animated.View style={sheetStyle}>
              <Pressable onPress={() => {}} className="bg-bg border-t border-border rounded-t-[24px] px-5 pb-10">
                <GestureDetector gesture={panGesture}>
                  <View className="items-center py-3">
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
