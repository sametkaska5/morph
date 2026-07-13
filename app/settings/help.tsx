import { View, Text, Pressable, Linking, ScrollView } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import Feather from "@expo/vector-icons/Feather";

const ACCENT = "#8CE05A";
const SUPPORT_EMAIL = "sametkaska5@gmail.com";

const FAQ = [
  {
    q: "Günde birden fazla kayıt ekleyebilir miyim?",
    a: "Hayır, her gün için tek bir kayıt tutulur. Aynı günü tekrar düzenlemek istersen Zaman Kapsülü veya İstatistik ekranından o güne dokunup düzenleyebilirsin.",
  },
  {
    q: "İnternetim yokken kayıt ekleyebilir miyim?",
    a: "Evet — kaydettiğin anı hemen Ana Ekran'da görünür, internet geldiğinde otomatik olarak sunucuya senkronize edilir.",
  },
  {
    q: "Fotoğraflarımı kim görebilir?",
    a: "Fotoğrafların yalnızca senin hesabınla ilişkilendirilmiş şekilde saklanır, başka hiçbir kullanıcı erişemez.",
  },
];

export default function HelpScreen() {
  const version = Constants.expoConfig?.version ?? "—";

  function sendFeedback() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Remory Geri Bildirim")}`);
  }

  return (
    <ScrollView className="flex-1 bg-bg pt-16 px-4" contentContainerStyle={{ paddingBottom: 30 }}>
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-lg font-bold">Yardım & Destek</Text>
      </View>

      <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
        {FAQ.map((item, i) => (
          <View
            key={item.q}
            className={`px-3.5 py-3 ${i < FAQ.length - 1 ? "border-b border-border" : ""}`}
          >
            <Text className="text-text text-sm font-semibold mb-1">{item.q}</Text>
            <Text className="text-textMuted text-xs leading-5">{item.a}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={sendFeedback}
        className="bg-surface border border-border rounded-card px-3.5 py-3.5 flex-row items-center gap-3 mb-5"
      >
        <Feather name="mail" size={16} color={ACCENT} />
        <Text className="text-text text-sm flex-1">Geri bildirim gönder</Text>
        <Feather name="chevron-right" size={15} color="#5C5A50" />
      </Pressable>

      <Text className="text-textFaint text-[11px] text-center">Remory v{version}</Text>
    </ScrollView>
  );
}
