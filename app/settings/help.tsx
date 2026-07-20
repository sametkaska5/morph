import { View, Text, Pressable, Linking, ScrollView } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import Feather from "@expo/vector-icons/Feather";

const ACCENT = "#8CE05A";
const SUPPORT_EMAIL = "sametkaska5@gmail.com";

const FAQ = [
  {
    q: "Günde birden fazla kayıt ekleyebilir miyim?",
    a: "Hayır, her gün için tek bir kayıt tutulur. Aynı günü tekrar düzenlemek istersen Anı Akışı veya İstatistik ekranından o güne dokunup düzenleyebilirsin.",
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
    <ScrollView className="flex-1 bg-bg pt-14 px-4" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">Yardım & Destek</Text>
      </View>

      <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
        {FAQ.map((item, i) => (
          <View
            key={item.q}
            className={`px-4 py-3 ${i < FAQ.length - 1 ? "border-b border-border" : ""}`}
          >
            <Text className="text-text text-base font-semibold mb-1">{item.q}</Text>
            <Text className="text-textMuted text-base leading-6">{item.a}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={sendFeedback}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        className="bg-surface border border-border rounded-button px-4 py-4 flex-row items-center gap-3 mb-5"
      >
        <Feather name="mail" size={16} color={ACCENT} />
        <Text className="text-text text-base flex-1">Geri bildirim gönder</Text>
        <Feather name="chevron-right" size={15} color="#5C5A50" />
      </Pressable>

      <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
        <Pressable
          onPress={() => router.push("/privacy-policy")}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="flex-row items-center gap-3 px-4 py-3 border-b border-border"
        >
          <Feather name="shield" size={16} color={ACCENT} />
          <Text className="flex-1 text-text text-base">Gizlilik Politikası</Text>
          <Feather name="chevron-right" size={15} color="#5C5A50" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/terms")}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="flex-row items-center gap-3 px-4 py-3"
        >
          <Feather name="file-text" size={16} color={ACCENT} />
          <Text className="flex-1 text-text text-base">Kullanım Şartları</Text>
          <Feather name="chevron-right" size={15} color="#5C5A50" />
        </Pressable>
      </View>

      <Text className="text-textFaint text-xs text-center">Remory v{version}</Text>
    </ScrollView>
  );
}
