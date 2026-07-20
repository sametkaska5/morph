import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

export function LegalScreen({
  title,
  updatedAt,
  sections,
}: {
  title: string;
  updatedAt: string;
  sections: { heading: string; body: string }[];
}) {
  return (
    <ScrollView className="flex-1 bg-bg pt-14 px-4" contentContainerStyle={{ paddingBottom: 32 }}>
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
