import { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { fetchProfileStats } from "@/lib/profileStats";
import { useProfile } from "@/lib/profile";
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

function UnitOption({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      className={`flex-row items-center justify-between px-4 py-4 rounded-button border ${
        selected ? "bg-accentSoft border-accent" : "bg-surface border-border"
      }`}
    >
      <View>
        <Text className={`text-base font-semibold ${selected ? "text-accent" : "text-text"}`}>{label}</Text>
        <Text className="text-textMuted text-xs mt-0.5">{sublabel}</Text>
      </View>
      {selected ? <Feather name="check" size={18} color="#8CE05A" /> : null}
    </Pressable>
  );
}

export default function Profil() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useProfileStats();
  const { data: profile } = useProfile(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const setUnitMutation = useSetUnitPreference(user?.id);
  const [showUnitSheet, setShowUnitSheet] = useState(false);

  const displayName = profile?.name || user?.email?.split("@")[0] || "Kullanıcı";

  const weightUnit = displayUnit("kg", unitPref);
  const displayWeightDiff = stats?.weightDiff != null ? toDisplayValue(stats.weightDiff, "kg", unitPref) : null;
  const unitsLabel = unitPref === "imperial" ? "lb, in" : "kg, cm";

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  function handleSelectUnit(pref: "metric" | "imperial") {
    setUnitMutation.mutate(pref);
    setShowUnitSheet(false);
  }

  return (
    <>
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 32 }}>
      <Text className="text-text text-3xl font-bold px-4 pb-4">Profil</Text>

      <Pressable onPress={() => router.push("/profile/edit")} className="px-4 pb-5 items-center">
        <View className="w-24 h-24 rounded-full bg-surface border-2 border-accent items-center justify-center overflow-hidden mb-3">
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <Feather name="user" size={34} color="#8CE05A" />
          )}
        </View>
        <Text className="text-text text-xl font-semibold">{displayName}</Text>
        {profile?.createdAt ? (
          <Text className="text-textMuted text-xs mt-1">
            {new Date(profile.createdAt).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}'den beri
            remory'de
          </Text>
        ) : null}
      </Pressable>

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
          <SettingsRow icon="sliders" label="Birimler" value={unitsLabel} onPress={() => setShowUnitSheet(true)} />
          <SettingsRow icon="help-circle" label="Yardım & Destek" onPress={() => router.push("/settings/help")} />
          <SettingsRow icon="log-out" label="Çıkış yap" danger onPress={handleSignOut} />
        </View>
      </View>
    </ScrollView>

    <Modal visible={showUnitSheet} transparent animationType="fade" onRequestClose={() => setShowUnitSheet(false)}>
      <Pressable
        onPress={() => setShowUnitSheet(false)}
        className="flex-1 bg-black/60 justify-end"
      >
        <Pressable
          onPress={() => {}}
          className="bg-bg border-t border-border rounded-t-[24px] px-5 pt-5 pb-10"
        >
          <View className="w-10 h-1 rounded-full bg-white/20 self-center mb-5" />
          <Text className="text-text text-xl font-bold mb-1">Birimler</Text>
          <Text className="text-textMuted text-sm mb-5">Hangi birim sistemini kullanmak istersin?</Text>
          <View className="gap-3">
            <UnitOption
              label="Metrik"
              sublabel="kg, cm"
              selected={unitPref === "metric"}
              onPress={() => handleSelectUnit("metric")}
            />
            <UnitOption
              label="Emperyal"
              sublabel="lb, in"
              selected={unitPref === "imperial"}
              onPress={() => handleSelectUnit("imperial")}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}
