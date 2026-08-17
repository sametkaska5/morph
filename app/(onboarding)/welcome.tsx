import { theme } from "@/lib/theme";
import { View } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text } from "@/components/Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { markOnboardingSeen } from "@/lib/onboarding";

/**
 * İlk açılışta bir kez gösterilen karşılama ekranı.
 *
 * Buraya yalnızca `app/index.tsx` yönlendiriyor ve yalnızca oturum yokken —
 * karar mantığı orada. "İleri" görüldü bayrağını yazıp GİRİŞ ekranına geçiyor:
 * eskiden doğrudan `/(tabs)`'a gidiyordu, ki oturumsuz kullanıcıyı tab layout
 * anında `(auth)`'a geri atardı.
 *
 * `replace` (push değil): geri tuşu kullanıcıyı bir daha karşılamaya
 * döndürmemeli, o adım bitti.
 */
export default function Welcome() {
  async function handleContinue() {
    await markOnboardingSeen();
    router.replace("/(auth)");
  }

  return (
    <View className="flex-1 bg-bg justify-between px-6 py-16">
      <View className="items-center mt-16">
        <View className="w-14 h-14 rounded-2xl border-[1.5px] border-accent items-center justify-center mb-4 bg-accentSoft">
          <Feather name="hexagon" size={24} color={theme.colors.accent} />
        </View>
        <Text className="text-text text-4xl font-bold uppercase tracking-wide">Remory</Text>
        <Text className="text-textMuted text-base text-center mt-3">
          Anılarını kaydet.{"\n"}Gelecekteki kendinle buluştur.
        </Text>
      </View>

      <PressableFade
        dim={0.85}
        className="bg-accent rounded-button py-4 items-center"
        accessibilityRole="button"
        accessibilityLabel="Devam et"
        onPress={handleContinue}
      >
        <Text className="text-bg text-base font-semibold">İleri</Text>
      </PressableFade>
    </View>
  );
}
