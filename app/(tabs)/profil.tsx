import { theme } from "@/lib/theme";
import { useRef, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { deleteAccount } from "@/lib/account";
import { useProfileStats } from "@/lib/profileStats";
import { useProfile } from "@/lib/profile";
import { useUnitPreference, useSetUnitPreference } from "@/lib/units";
import { DraggableSheet } from "@/components/DraggableSheet";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { alertError } from "@/lib/alerts";
import { showAlert } from "@/lib/appAlert";
import { useScreenInsets } from "@/lib/useScreenInsets";
import { formatDateKey } from "@/lib/date";
import { exportUserData } from "@/lib/exportData";

/** Feather ikon adları — yanlış yazılmış bir ad artık derlemede yakalanıyor. */
type FeatherIcon = keyof typeof Feather.glyphMap;

function StatChip({ icon, label, value }: { icon: FeatherIcon; label: string; value: string }) {
  return (
    <View className="items-start gap-1">
      <View className="flex-row items-center gap-1.5">
        <Feather name={icon} size={18} color={theme.colors.accent} />
        <Text className="text-text text-lg font-semibold">{value}</Text>
      </View>
      <Text className="text-textFaint text-base">{label}</Text>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: FeatherIcon;
  label: string;
  /** Satırın sağında gösterilen ikincil metin (örn. seçili birim). */
  value?: string;
  /** Silme gibi yıkıcı işlemler: kırmızı renk + chevron gizlenir. */
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableFade
      onPress={onPress}
      accessibilityRole="button"
      // Etiketsizken ekran okuyucu satırları yalnızca içlerindeki metinden
      // okuyordu ve sağdaki ikincil değer (örn. "kg, cm") ayrı bir düğüm olarak
      // geliyordu: "Birimler" ve "kg, cm" ilişkisiz iki parça gibi duyuluyordu.
      accessibilityLabel={value ? `${label}, ${value}` : label}
      className="flex-row items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
    >
      <Feather name={icon} size={16} color={danger ? "#D9705A" : "#8CE05A"} />
      <Text className={`flex-1 text-base ${danger ? "text-danger" : "text-text"}`}>{label}</Text>
      {value ? <Text className="text-textMuted text-sm mr-1">{value}</Text> : null}
      {!danger && <Feather name="chevron-right" size={15} color={theme.colors.textFaint} />}
    </PressableFade>
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
    // Hangi birim sisteminin seçili olduğu yalnızca renk + tik ikonuyla
    // anlatılıyordu; ekran okuyucu ikisini de aynı okuyordu.
    <PressableFade
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${label}, ${sublabel}`}
      accessibilityState={{ selected }}
      dim={0.8}
      className={`flex-row items-center justify-between px-4 py-4 rounded-button border ${
        selected ? "bg-accentSoft border-accent" : "bg-surface border-border"
      }`}
    >
      <View>
        <Text className={`text-base font-semibold ${selected ? "text-accent" : "text-text"}`}>
          {label}
        </Text>
        <Text className="text-textMuted text-xs mt-0.5">{sublabel}</Text>
      </View>
      {selected ? <Feather name="check" size={18} color={theme.colors.accent} /> : null}
    </PressableFade>
  );
}

export default function Profil() {
  const screen = useScreenInsets();
  const { user } = useAuth();
  const {
    data: stats,
    isLoading,
    error: statsError,
    refetch: refetchStats,
  } = useProfileStats(user?.id);
  const { data: profile } = useProfile(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const setUnitMutation = useSetUnitPreference(user?.id);
  const [showUnitSheet, setShowUnitSheet] = useState(false);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const skipNextPress = useRef(false);

  const displayName = profile?.name || user?.email?.split("@")[0] || "Kullanıcı";

  const unitsLabel = unitPref === "imperial" ? "lb, in" : "kg, cm";

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(user!.id),
    onSuccess: () => {
      // signOut zaten auth ekranına yönlendiriyor (bkz. useAuth), ama kullanıcının
      // hesabının gerçekten silindigini açıkça bilmesi gerekiyor — yoksa "arayüz
      // dondu mu, silindi mi?" belirsizliği kalıyor.
      showAlert("Hesabın silindi", "Tüm verilerinin kopyaları kalıcı olarak silindi.");
    },
    onError: (err) => alertError("Hesap silinemedi", err, "profile.deleteAccount"),
  });

  async function handleSignOut() {
    // signOut, AĞ hatasında oturumu YERELDE de temizlemiyor: supabase-js yalnızca
    // 401/403/404'ü yutup devam ediyor, diğer hatalarda `_removeSession()`a hiç
    // gelmeden erken dönüyor. Yani kullanıcı "Çıkış yap"a basıyor, oturum yerinde
    // kalıyor ve hiçbir şey söylenmiyordu — uygulama donmuş gibi görünüyor.
    const { error } = await supabase.auth.signOut();
    if (error) alertError("Çıkış yapılamadı", error, "profile.signOut");
  }

  function handleSelectUnit(pref: "metric" | "imperial") {
    // onError şart: yazma patlarsa sheet kapanıyor, seçim eski birimde kalıyor ve
    // kullanıcıya hiçbir şey söylenmiyordu — tercihi kaydedilmiş sanıyordu.
    setUnitMutation.mutate(pref, {
      onError: (err) => alertError("Birim değiştirilemedi", err, "profile.setUnitPref"),
    });
    setShowUnitSheet(false);
  }

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportUserData();
    } catch (error) {
      alertError("Dışa aktarma başarısız", error, "profile.exportUserData");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerStyle={{ paddingTop: screen.top, paddingBottom: 32 }}
      >
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
              <Image
                source={{ uri: profile.avatarUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Feather name="user" size={40} color={theme.colors.accent} />
            )}
          </View>
          <Text className="text-text text-2xl font-semibold">{displayName}</Text>
          {profile?.createdAt ? (
            <Text className="text-textMuted text-sm mt-1">
              {new Date(profile.createdAt).toLocaleDateString("tr-TR", {
                month: "long",
                year: "numeric",
              })}
              'den beri remory'de
            </Text>
          ) : null}
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color={theme.colors.accent} className="mt-2" />
        ) : statsError ? (
          // Hatasızken rakamlar "0 anı, 0 gün seri" olarak görünüyordu — kullanıcı
          // için verisi silinmiş gibi okunan, gerçekte sadece başarısız bir istek.
          <ErrorState error={statsError} onRetry={() => refetchStats()} />
        ) : (
          <>
            <View className="px-4 pb-4 flex-row justify-between">
              <StatChip
                icon="calendar"
                label="Başlangıç"
                value={stats?.firstDate ? formatDateKey(stats.firstDate) : "—"}
              />
              <StatChip
                icon="camera"
                label="Toplam Anı"
                value={String(stats?.totalMemories ?? 0)}
              />
              <StatChip icon="zap" label="En Uzun Seri" value={`${stats?.longest ?? 0} gün`} />
            </View>

            {stats?.monthsSinceFirst != null && stats.monthsSinceFirst > 0 ? (
              <View className="mx-4 mb-4 rounded-card bg-surface border border-border p-4">
                <View className="flex-row items-center gap-2 mb-2">
                  <Feather name="clock" size={15} color={theme.colors.text} />
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
          <Text className="text-textFaint text-sm font-semibold uppercase tracking-wide mb-2">
            Ayarlar
          </Text>
          <View className="bg-surface border border-border rounded-card overflow-hidden">
            <SettingsRow
              icon="bell"
              label="Bildirimler"
              onPress={() => router.push("/settings/notifications")}
            />
            <SettingsRow
              icon="activity"
              label="Takip edilen ölçümler"
              onPress={() => router.push("/settings/measurements")}
            />
            <SettingsRow
              icon="calendar"
              label="Geçmiş Antrenmanlarım"
              onPress={() => router.push("/workouts")}
            />
            <SettingsRow
              icon="sliders"
              label="Birimler"
              value={unitsLabel}
              onPress={() => setShowUnitSheet(true)}
            />
            <SettingsRow
              icon="help-circle"
              label="Yardım & Destek"
              onPress={() => router.push("/settings/help")}
            />
            <SettingsRow
              icon="download-cloud"
              label={isExporting ? "Dışa aktarılıyor..." : "Verileri dışa aktar"}
              onPress={handleExport}
            />
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
        <Text className="text-textMuted text-base mb-5">
          Hangi birim sistemini kullanmak istersin?
        </Text>
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
          accessibilityRole="button"
          accessibilityLabel="Profil fotoğrafı önizlemesini kapat"
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

      <ConfirmDialog
        visible={showDeleteAccountConfirm}
        icon="trash-2"
        danger
        title="Hesabını sil?"
        message="Bu işlem geri alınamaz. Tüm fotoğrafların, ölçümlerin ve anıların kalıcı olarak silinir, hesabına bir daha giriş yapamazsın."
        confirmLabel="Hesabı sil"
        // Silme uzun sürüyor (depo taranıp temizleniyor); bitmeden kutu kapanmasın
        // ki kullanıcı yarıda kaldı sanıp tekrar başlatmasın.
        pending={deleteAccountMutation.isPending}
        onConfirm={() => deleteAccountMutation.mutate()}
        onClose={() => setShowDeleteAccountConfirm(false)}
      />
    </>
  );
}
