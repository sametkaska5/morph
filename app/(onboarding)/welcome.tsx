import { View, Pressable } from "react-native";
import { Text } from "@/components/Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

export default function Welcome() {
  return (
    <View className="flex-1 bg-bg justify-between px-6 py-16">
      <View className="items-center mt-16">
        <View className="w-14 h-14 rounded-2xl border-[1.5px] border-accent items-center justify-center mb-4 bg-accentSoft">
          <Feather name="hexagon" size={24} color="#8CE05A" />
        </View>
        <Text className="text-text text-4xl font-bold uppercase tracking-wide">Remory</Text>
        <Text className="text-textMuted text-base text-center mt-3">
          Anılarını kaydet.{"\n"}Gelecekteki kendinle buluştur.
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        className="bg-accent rounded-button py-4 items-center"
        onPress={() => router.replace("/(tabs)")}
      >
        <Text className="text-bg text-base font-semibold">İleri</Text>
      </Pressable>
    </View>
  );
}
