import { View, Pressable, ScrollView } from "react-native";
import { Text } from "./Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useScreenInsets } from "@/lib/useScreenInsets";

export function LegalScreen({
  title,
  updatedAt,
  sections,
}: {
  title: string;
  updatedAt: string;
  sections: { heading: string; body: string }[];
}) {
  const screen = useScreenInsets();

  return (
    <ScrollView
      className="flex-1 bg-bg px-4"
      style={{ paddingTop: screen.top }}
      contentContainerStyle={{ paddingBottom: screen.bottom }}
    >
      <View className="flex-row items-center gap-3 mb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">{title}</Text>
      </View>
      <Text className="text-textFaint text-xs mb-6">Son güncelleme: {updatedAt}</Text>

      {sections.map((s) => (
        <View key={s.heading} className="mb-5">
          <Text className="text-text text-base font-semibold mb-1.5">{s.heading}</Text>
          <Text className="text-textMuted text-base leading-6">{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
