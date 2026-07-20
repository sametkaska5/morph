import { useRef, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Modal, Alert } from "react-native";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { deleteAccount } from "@/lib/account";
import { fetchProfileStats } from "@/lib/profileStats";
import { useProfile } from "@/lib/profile";
import { useUnitPreference, useSetUnitPreference } from "@/lib/units";
import { DraggableSheet } from "@/components/DraggableSheet";

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
    <View className="items-start gap-1">
      <View className="flex-row items-center gap-1.5">
        <Feather name={icon} size={18} color="#8CE05A" />
        <Text className="text-text text-lg font-semibold">{value}</Text>
      </View>
      <Text className="text-textFaint text-base">{label}</Text>
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
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const skipNextPress = useRef(false);

  const displayName = profile?.name || user?.email?.split("@")[0] || "Kullanıcı";

  const unitsLabel = unitPref === "imperial" ? "lb, in" : "kg, cm";

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(user!.id),
    onError: (err) => Alert.alert("Hesap silinemedi", (err as Error).message),
  });

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
      <Text className="text-text text-3xl font-bold px-4 pb-4" accessibilityRole="header">
        Profil
      </Text>

      <Pressable
        onPress={() => {
          if (skipNextPress.current) {
            skipNextPress.current = false;
            return;
          }
          router.push("/profile/edit");
        }}
        onLongPress={() => {
          if (!profile?.avatarUrl) return;
          skipNextPress.current = true;
          setShowPhotoPreview(true);
        }}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, profili düzenle`}
        className="px-4 pb-5 items-center"
      >
        <View className="w-28 h-28 rounded-full bg-surface border-2 border-accent items-center justify-center overflow-hidden mb-3">
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <Feather name="user" size={40} color="#8CE05A" />
          )}
        </View>
        <Text className="text-text text-2xl font-semibold">{displayName}</Text>
        {profile?.createdAt ? (
          <Text className="text-textMuted text-sm mt-1">
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
              value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("tr-TR") : "—"}
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
              <Text className="text-accent text-base font-semibold leading-6">
                gelecekteki kendin için anılar biriktiriyorsun.
              </Text>
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

      <View className="px-4">
        <View className="bg-surface border border-border rounded-card overflow-hidden">
          <SettingsRow
            icon="trash-2"
            label="Hesabı sil"
            danger
            onPress={() => setShowDeleteAccountConfirm(true)}
          />
        </View>
      </View>
    </ScrollView>

    <DraggableSheet visible={showUnitSheet} onClose={() => setShowUnitSheet(false)}>
      <Text className="text-text text-xl font-bold mb-1">Birimler</Text>
      <Text className="text-textMuted text-base mb-5">Hangi birim sistemini kullanmak istersin?</Text>
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
    </DraggableSheet>

    <Modal
      visible={showPhotoPreview}
      transparent
      animationType="fade"
      onRequestClose={() => setShowPhotoPreview(false)}
    >
      <Pressable
        onPress={() => setShowPhotoPreview(false)}
        className="flex-1 bg-black/90 items-center justify-center"
      >
        {profile?.avatarUrl ? (
          <Image
            source={{ uri: profile.avatarUrl }}
            style={{ width: 288, height: 288, borderRadius: 144 }}
            contentFit="cover"
          />
        ) : null}
      </Pressable>
    </Modal>

    <Modal
      visible={showDeleteAccountConfirm}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!deleteAccountMutation.isPending) setShowDeleteAccountConfirm(false);
      }}
    >
      <Pressable
        onPress={() => {
          if (!deleteAccountMutation.isPending) setShowDeleteAccountConfirm(false);
        }}
        className="flex-1 bg-black/60 items-center justify-center px-8"
      >
        <Pressable onPress={() => {}} className="w-full bg-bg border border-border rounded-card p-5 items-center">
          <View className="w-14 h-14 rounded-full bg-danger/15 items-center justify-center mb-4">
            <Feather name="trash-2" size={24} color="#D9705A" />
          </View>
          <Text className="text-text text-xl font-bold mb-2 text-center">Hesabını sil?</Text>
          <Text className="text-textMuted text-sm text-center mb-6">
            Bu işlem geri alınamaz. Tüm fotoğrafların, ölçümlerin ve anıların kalıcı olarak silinir,
            hesabına bir daha giriş yapamazsın.
          </Text>
          <View className="flex-row gap-3 w-full">
            <Pressable
              onPress={() => setShowDeleteAccountConfirm(false)}
              disabled={deleteAccountMutation.isPending}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              className="flex-1 py-4 rounded-button items-center bg-surface border border-border"
            >
              <Text className="text-text text-base font-semibold">Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={() => deleteAccountMutation.mutate()}
              disabled={deleteAccountMutation.isPending}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : deleteAccountMutation.isPending ? 0.7 : 1 })}
              className="flex-1 py-4 rounded-button items-center bg-danger"
            >
              {deleteAccountMutation.isPending ? (
                <ActivityIndicator color="#0B0D0A" />
              ) : (
                <Text className="text-bg text-base font-semibold">Hesabı sil</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}
