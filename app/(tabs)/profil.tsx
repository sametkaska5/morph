import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, ActionSheetIOS, Alert } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { fetchProfileStats } from "@/lib/profileStats";
import { useUnitPreference, useSetUnitPreference, displayUnit, toDisplayValue } from "@/lib/units";

function useProfileStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", "stats", user?.id],
    queryFn: () => fetchProfileStats(user!.id),
    enabled: !!user,
  });
}

function StatChip({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Feather name={icon} size={15} color="#8CE05A" />
      <View>
        <Text className="text-textFaint text-xs">{label}</Text>
        <Text className="text-text text-sm font-semibold">{value}</Text>
      </View>
    </View>
  );
}

function SettingsRow({ icon, label, value, danger, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className="flex-row items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
    >
      <Feather name={icon} size={16} color={danger ? "#D9705A" : "#8CE05A"} />
      <Text className={`flex-1 text-base ${danger ? "text-danger" : "text-text"}`}>{label}</Text>
      {value ? <Text className="text-textMuted text-sm mr-1">{value}</Text> : null}
      {!danger && <Feather name="chevron-right" size={15} color="#5C5A50" />}
    </Pressable>
  );
}

export default function Profil() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useProfileStats();
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const setUnitMutation = useSetUnitPreference(user?.id);

  const weightUnit = displayUnit("kg", unitPref);
  const displayWeightDiff = stats?.weightDiff != null ? toDisplayValue(stats.weightDiff, "kg", unitPref) : null;
  const unitsLabel = unitPref === "imperial" ? "lb, in" : "kg, cm";

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  function handleUnitsPress() {
    const options = ["İptal", "Metrik (kg, cm)", "Emperyal (lb, in)"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 0 }, (index) => {
        if (index === 1) setUnitMutation.mutate("metric");
        if (index === 2) setUnitMutation.mutate("imperial");
      });
    } else {
      Alert.alert("Birimler", "Hangi birim sistemini kullanmak istersin?", [
        { text: "İptal", style: "cancel" },
        { text: "Metrik (kg, cm)", onPress: () => setUnitMutation.mutate("metric") },
        { text: "Emperyal (lb, in)", onPress: () => setUnitMutation.mutate("imperial") },
      ]);
    }
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 32 }}>
      <Text className="text-text text-3xl font-bold px-4 pb-4">Profil</Text>

      <View className="px-4 pb-4 flex-row items-center gap-4">
        <View className="w-16 h-16 rounded-full bg-surface border-[1.5px] border-accent items-center justify-center">
          <Feather name="user" size={24} color="#8CE05A" />
        </View>
        <View>
          <Text className="text-text text-base font-semibold">{user?.email?.split("@")[0] ?? "Kullanıcı"}</Text>
          <Text className="text-textMuted text-xs mt-0.5">
            {stats?.firstDate
              ? `${new Date(stats.firstDate).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}'den beri remory'de`
              : "Henüz ilk anını eklemedin"}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-2" />
      ) : (
        <>
          <View className="px-4 pb-4 flex-row justify-between">
            <StatChip
              icon="calendar"
              label="Başlangıç"
              value={stats?.firstDate ? new Date(stats.firstDate).toLocaleDateString("tr-TR") : "—"}
            />
            <StatChip icon="camera" label="Toplam Anı" value={String(stats?.totalMemories ?? 0)} />
            <StatChip icon="zap" label="En Uzun Seri" value={`${stats?.longest ?? 0} gün`} />
          </View>

          {stats?.monthsSinceFirst != null && stats.monthsSinceFirst > 0 ? (
            <View className="mx-4 mb-4 rounded-card bg-surface border border-border p-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Feather name="clock" size={15} color="#F5F3EC" />
                <Text className="text-text text-sm font-semibold">
                  {stats.monthsSinceFirst >= 12
                    ? `${Math.floor(stats.monthsSinceFirst / 12)} yıl ${stats.monthsSinceFirst % 12} aydır`
                    : `${stats.monthsSinceFirst} aydır`}
                </Text>
              </View>
              <Text className="text-accent text-sm font-semibold mb-2 leading-5">
                gelecekteki kendin için anılar biriktiriyorsun.
              </Text>
              {displayWeightDiff != null ? (
                <Text className="text-textMuted text-xs leading-5">
                  Bugün baktığında ilk fotoğrafından{" "}
                  <Text className="text-accent font-semibold">
                    {displayWeightDiff <= 0
                      ? `${Math.abs(displayWeightDiff)} ${weightUnit} daha hafifsin.`
                      : `${displayWeightDiff} ${weightUnit} daha ağırsın.`}
                  </Text>
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      <View className="px-4 mb-2">
        <Text className="text-textFaint text-xs font-semibold uppercase tracking-wide mb-2">Ayarlar</Text>
        <View className="bg-surface border border-border rounded-card overflow-hidden">
          <SettingsRow icon="bell" label="Bildirimler" onPress={() => router.push("/settings/notifications")} />
          <SettingsRow
            icon="activity"
            label="Takip edilen ölçümler"
            onPress={() => router.push("/settings/measurements")}
          />
          <SettingsRow icon="sliders" label="Birimler" value={unitsLabel} onPress={handleUnitsPress} />
          <SettingsRow icon="help-circle" label="Yardım & Destek" onPress={() => router.push("/settings/help")} />
          <SettingsRow icon="log-out" label="Çıkış yap" danger onPress={handleSignOut} />
        </View>
      </View>
    </ScrollView>
  );
}
