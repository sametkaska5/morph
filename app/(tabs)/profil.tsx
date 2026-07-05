import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { fetchProfileStats } from "@/lib/profileStats";

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
    <View className="flex-row items-center gap-1.5">
      <Feather name={icon} size={13} color="#8CE05A" />
      <View>
        <Text className="text-textFaint text-[9px]">{label}</Text>
        <Text className="text-text text-xs font-semibold">{value}</Text>
      </View>
    </View>
  );
}

function SettingsRow({ icon, label, value, danger, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3 border-b border-border last:border-b-0"
    >
      <Feather name={icon} size={16} color={danger ? "#D9705A" : "#8CE05A"} />
      <Text className={`flex-1 text-sm ${danger ? "text-danger" : "text-text"}`}>{label}</Text>
      {value ? <Text className="text-textMuted text-xs mr-1">{value}</Text> : null}
      {!danger && <Feather name="chevron-right" size={15} color="#5C5A50" />}
    </Pressable>
  );
}

export default function Profil() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useProfileStats();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 30 }}>
      <View className="flex-row justify-between items-center px-4 pb-3.5">
        <Text className="text-text text-lg font-semibold">Profil</Text>
        <Feather name="settings" size={19} color="#8CE05A" />
      </View>

      <View className="px-4 pb-3.5 flex-row items-center gap-3.5">
        <View className="w-14 h-14 rounded-full bg-surface border-[1.5px] border-accent items-center justify-center">
          <Feather name="user" size={22} color="#8CE05A" />
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
              <Text className="text-accent text-[13px] font-semibold mb-2 leading-5">
                gelecekteki kendin için anılar biriktiriyorsun.
              </Text>
              {stats.weightDiff != null ? (
                <Text className="text-textMuted text-xs leading-5">
                  Bugün baktığında ilk fotoğrafından{" "}
                  <Text className="text-accent font-semibold">
                    {stats.weightDiff <= 0
                      ? `${Math.abs(stats.weightDiff)} kg daha hafifsin.`
                      : `${stats.weightDiff} kg daha ağırsın.`}
                  </Text>
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      <View className="px-4 mb-1.5">
        <Text className="text-text text-sm font-semibold mb-2">Ayarlar</Text>
        <View className="bg-surface border border-border rounded-card overflow-hidden">
          <SettingsRow icon="bell" label="Bildirimler" />
          <SettingsRow icon="ruler" label="Takip edilen ölçümler" />
          <SettingsRow icon="sliders" label="Birimler" value="kg, cm" />
          <SettingsRow icon="help-circle" label="Yardım & Destek" />
          <SettingsRow icon="log-out" label="Çıkış yap" danger onPress={handleSignOut} />
        </View>
      </View>
    </ScrollView>
  );
}
