import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Alert, Image, Modal } from "react-native";
import { Text } from "@/components/Typography";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type * as MediaLibraryType from "expo-media-library";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey, getMondayOfWeek, weekdayLetter } from "@/lib/date";
import { scheduleStreakRiskNotification } from "@/lib/notifications";
import { useNotificationSettings } from "@/lib/notificationSettings";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useUnitPreference, displayUnit, toDisplayValue } from "@/lib/units";
import { getPhotoUrls } from "@/lib/storage";

let MediaLibrary: typeof MediaLibraryType | null = null;
try {
  MediaLibrary = require("expo-media-library");
} catch {
  MediaLibrary = null;
}

const CHART_W = 300;
const CHART_H = 110;

function useMeasurementSeries(userId: string | undefined, typeId: string | undefined) {
  return useQuery({
    // userId anahtarda yoksa, aynı cihazda hesap değiştirildiğinde önceki
    // kullanıcının grafiği cache'ten okunabiliyordu.
    queryKey: ["measurement_series", userId, typeId],
    enabled: !!userId && !!typeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_values")
        .select("value, entries!inner(date, type, user_id)")
        .eq("measurement_type_id", typeId)
        .eq("entries.user_id", userId)
        .eq("entries.type", "log")
        .order("date", { foreignTable: "entries", ascending: true });
      if (error) throw error;
      return (data ?? []).map((d: any) => ({ date: d.entries.date, value: d.value }));
    },
  });
}

function useCurrentWeek(userId: string | undefined) {
  return useQuery({
    queryKey: ["currentWeek", userId],
    enabled: !!userId,
    queryFn: async () => {
      const todayKey = toLocalDateKey(new Date());
      const monday = getMondayOfWeek(new Date());

      const days: { date: string; label: string; isFuture: boolean; isToday: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateKey = toLocalDateKey(d);
        days.push({
          date: dateKey,
          label: weekdayLetter(d),
          isFuture: dateKey > todayKey,
          isToday: dateKey === todayKey,
        });
      }

      const { data, error } = await supabase
        .from("entries")
        .select("id, date, type")
        .eq("user_id", userId)
        .gte("date", days[0].date)
        .lte("date", days[days.length - 1].date);
      if (error) throw error;

      const byDate = new Map((data ?? []).map((e) => [e.date, { id: e.id, type: e.type }]));
      return days.map((d) => ({
        ...d,
        id: byDate.get(d.date)?.id ?? null,
        type: byDate.get(d.date)?.type ?? null,
      }));
    },
  });
}

function useShareablePhotoEntries(userId: string | undefined) {
  return useQuery({
    queryKey: ["shareablePhotos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, photos!cover_photo_id(storage_path)")
        .eq("user_id", userId)
        .eq("type", "log")
        .not("cover_photo_id", "is", null)
        .order("date", { ascending: false })
        .limit(12);
      if (error) throw error;

      const paths = (data ?? [])
        .map((entry: any) => entry.photos?.storage_path)
        .filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? [])
        .map((entry: any) => ({
          id: entry.id,
          date: entry.date,
          photoUrl: entry.photos?.storage_path ? urlMap.get(entry.photos.storage_path) ?? null : null,
          photoPath: entry.photos?.storage_path ?? null,
        }))
        .filter((entry) => entry.photoUrl);
    },
  });
}

function buildChartPath(values: number[]) {
  if (values.length === 0) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? CHART_W / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = CHART_H - ((v - min) / range) * (CHART_H - 20) - 10;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${CHART_H} L0,${CHART_H} Z`;

  return { line, area, lastPoint: points[points.length - 1] };
}

// Gün kutusuna basınca dönen 3 durumlu döngü: boş → off day (bilinçli dinlenme) →
// antrenman (spor yapıldı ama foto çekilmedi — off day sayılmasın istendi) → boş.
// "log" (fotoğraflı gerçek kayıt) bu döngünün dışında, ayrı bir akıştan (kayıt ekranı) gelir.
function nextOffDayState(current: string | null): "off_day" | "workout" | null {
  if (current === "off_day") return "workout";
  if (current === "workout") return null;
  return "off_day";
}

export default function Istatistikler() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: types } = useMeasurementTypes(user?.id);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedSharePhotoId, setSelectedSharePhotoId] = useState<string | null>(null);
  const [sharePendingAction, setSharePendingAction] = useState<"save" | "share" | null>(null);
  const shareCardRef = useRef<View>(null);
  // Hangi günlerin şu an sunucuya yazılmakta olduğunu izler. toggleOffDayMutation.isPending
  // TEK bir mutation nesnesine ait olduğu için tüm haftayı birden kilitlerdi — biri
  // işlemdeyken başka bir güne basmak sessizce yok sayılıyordu. Bunun yerine sadece
  // işlemdeki günü kilitliyoruz, diğer günlere aynı anda basılabilsin.
  const [pendingDates, setPendingDates] = useState<Set<string>>(new Set());

  const toggleOffDayMutation = useMutation({
    mutationFn: async ({ date, currentType }: { date: string; currentType: string | null }) => {
      if (!user) throw new Error("Giriş yapılmamış");
      const next = nextOffDayState(currentType);

      if (next === null) {
        // entryId'ye göre değil (user_id, date) eşleşmesine göre siliyoruz: optimistic
        // güncelleme gerçek id'yi cache'e henüz yazmadan (refetch tamamlanmadan) kullanıcı
        // tekrar basarsa entryId hâlâ null oluyordu ve id'ye bağlı silme sessizce
        // hiçbir şey yapmıyordu — off day sunucudan değişmeden geri geliyordu.
        const { error } = await supabase
          .from("entries")
          .delete()
          .eq("user_id", user.id)
          .eq("date", date)
          .in("type", ["off_day", "workout"]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("entries")
          .upsert({ user_id: user.id, date, type: next, note: null }, { onConflict: "user_id,date" });
        if (error) throw error;
      }
    },
    onMutate: async ({ date, currentType }) => {
      await queryClient.cancelQueries({ queryKey: ["currentWeek", user?.id] });
      const next = nextOffDayState(currentType);
      queryClient.setQueryData<any[]>(["currentWeek", user?.id], (old) =>
        old?.map((d) => (d.date === date ? { ...d, type: next } : d))
      );
    },
    onError: (err, variables) => {
      // Sadece hata veren günü eski haline döndürüyoruz — tüm haftanın eski kopyasını
      // geri yüklemek, aynı anda başarıyla işlenmiş BAŞKA bir günün optimistic
      // güncellemesini de silip yanlış günün değişmiş gibi görünmesine yol açıyordu.
      queryClient.setQueryData<any[]>(["currentWeek", user?.id], (old) =>
        old?.map((d) => (d.date === variables.date ? { ...d, type: variables.currentType } : d))
      );
      Alert.alert("İşlem başarısız", (err as Error).message);
    },
    onSettled: (_data, _error, variables) => {
      // toggleOffDayMutation tüm günler arasında TEK bir useMutation örneği —
      // kilidi burada (hook seviyesi onSettled) açıyoruz çünkü bu callback her
      // mutate() çağrısı için variables ile birlikte güvenilir şekilde çalışır.
      // .mutate(vars, { onSettled }) şeklinde per-call verilen callback'ler ise
      // React Query içinde aynı mutation nesnesinde üzerine yazılıyor — art arda
      // farklı günlere hızlı basılınca önceki günün kilidi hiç açılmıyor, o gün
      // sonsuza kadar kilitli kalıyordu.
      queryClient.invalidateQueries({ queryKey: ["currentWeek"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setPendingDates((prev) => {
        const next = new Set(prev);
        next.delete(variables.date);
        return next;
      });
    },
  });

  function dayAccessibilityLabel(day: { date: string; type: string | null; isFuture: boolean; isToday: boolean }) {
    const dateLabel = new Date(day.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
    if (day.isFuture) return `${dateLabel}, henüz gelmedi`;
    const statusLabel =
      day.type === "log"
        ? "kayıt var, açmak için dokun"
        : day.type === "off_day"
        ? "off day olarak işaretli, antrenman yapmak için dokun"
        : day.type === "workout"
        ? "antrenman olarak işaretli, işareti kaldırmak için dokun"
        : "boş, off day olarak işaretlemek için dokun";
    return `${dateLabel}${day.isToday ? ", bugün" : ""}, ${statusLabel}`;
  }

  function handleDayPress(day: { date: string; id: string | null; type: string | null; isFuture: boolean }) {
    if (day.isFuture) return;
    if (day.type === "log" && day.id) {
      router.push(`/entry/${day.id}`);
      return;
    }
    if (pendingDates.has(day.date)) return; // aynı güne art arda basmayı engelle
    setPendingDates((prev) => new Set(prev).add(day.date));
    toggleOffDayMutation.mutate({ date: day.date, currentType: day.type });
  }

  const currentTypeId = activeTypeId ?? types?.[0]?.id;
  const activeType = types?.find((t) => t.id === currentTypeId);

  const { data: series, isLoading: seriesLoading } = useMeasurementSeries(user?.id, currentTypeId);
  const { data: week, isLoading: weekLoading } = useCurrentWeek(user?.id);
  const { data: shareablePhotos, isLoading: sharePhotosLoading } = useShareablePhotoEntries(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  const values = activeType
    ? (series?.map((s) => toDisplayValue(s.value, activeType.unit, unitPref)) ?? [])
    : series?.map((s) => s.value) ?? [];
  const { line, area, lastPoint } = buildChartPath(values);
  const currentValue = values[values.length - 1];
  const previousValue = values[values.length - 2];
  const delta = currentValue != null && previousValue != null ? Number((currentValue - previousValue).toFixed(1)) : null;
  const isGoodDelta =
    delta != null && activeType
      ? activeType.target_direction === "decrease_is_good"
        ? delta <= 0
        : delta >= 0
      : true;

  const currentStreak = (() => {
    if (!week) return 0;
    let streak = 0;
    for (let i = week.length - 1; i >= 0; i--) {
      if (week[i].isFuture) continue;
      if (week[i].type) streak++;
      else break;
    }
    return streak;
  })();

  const selectedSharePhoto = shareablePhotos?.find((photo) => photo.id === selectedSharePhotoId) ?? shareablePhotos?.[0] ?? null;

  useEffect(() => {
    if (shareablePhotos && shareablePhotos.length > 0) {
      const hasSelected = shareablePhotos.some((photo) => photo.id === selectedSharePhotoId);
      if (!hasSelected) {
        setSelectedSharePhotoId(shareablePhotos[0].id);
      }
    } else {
      setSelectedSharePhotoId(null);
    }
  }, [shareablePhotos, selectedSharePhotoId]);

  const { data: notifSettings } = useNotificationSettings(user?.id);

  async function handleShareCard(kind: "save" | "share") {
    if (!shareCardRef.current) {
      Alert.alert("Ön izleme hazır değil", "Kart henüz oluşturulmadı, lütfen tekrar dene.");
      return;
    }

    setSharePendingAction(kind);
    try {
      const uri = await captureRef(shareCardRef, { format: "png", quality: 1 });
      if (kind === "save") {
        if (!MediaLibrary) {
          Alert.alert(
            "Bu özellik Expo Go'da desteklenmiyor",
            "Galeriye kaydetmek için development build gerekiyor. Bu arada 'Paylaş' ile görseli doğrudan gönderebilirsin."
          );
          return;
        }
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("İzin gerekli", "Galeriye kaydetmek için fotoğraf erişim izni vermelisin.");
          return;
        }
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert("Kaydedildi", "Paylaşım kartı galerine kaydedildi.");
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          Alert.alert("Paylaşım desteklenmiyor", "Bu cihazda paylaşım özelliği kullanılamıyor.");
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch (err) {
      Alert.alert(kind === "save" ? "Kaydetme başarısız" : "Paylaşım başarısız", (err as Error).message);
    } finally {
      setSharePendingAction(null);
    }
  }

  useEffect(() => {
    if (!week || !notifSettings?.streak_enabled) return;
    const today = week.find((d) => d.isToday);
    scheduleStreakRiskNotification(currentStreak, !!today?.type);
  }, [week, currentStreak, notifSettings?.streak_enabled]);

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 32 }}>
      <Text className="text-text text-3xl font-bold px-4 mb-4" accessibilityRole="header">
        İstatistikler
      </Text>

      <View className="flex-row gap-2 px-4 mb-4">
        {types?.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setActiveTypeId(t.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: t.id === currentTypeId }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className={`px-4 py-3 rounded-pill ${t.id === currentTypeId ? "bg-accent" : "bg-surface"}`}
          >
            <Text className={`text-sm font-semibold capitalize ${t.id === currentTypeId ? "text-bg" : "text-textMuted"}`}>
              {t.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mx-4 mb-4 bg-surface border border-border rounded-card p-4">
        {seriesLoading ? (
          <ActivityIndicator color="#8CE05A" />
        ) : values.length === 0 ? (
          <Text className="text-textMuted text-base">Bu ölçüm için henüz veri yok.</Text>
        ) : (
          <>
            <View className="flex-row items-baseline gap-2 mb-3">
              <Text className="text-text text-3xl font-bold">
                {currentValue}{" "}
                <Text className="text-base font-medium text-textMuted">
                  {activeType ? displayUnit(activeType.unit, unitPref) : ""}
                </Text>
              </Text>
              {delta != null ? (
                <Text className={`text-sm font-semibold ${isGoodDelta ? "text-accent" : "text-danger"}`}>
                  {delta > 0 ? "↑" : delta < 0 ? "↓" : "•"} {Math.abs(delta)}{" "}
                  {activeType ? displayUnit(activeType.unit, unitPref) : ""}
                </Text>
              ) : null}
            </View>

            <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
              <Defs>
                <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#8CE05A" stopOpacity={0.35} />
                  <Stop offset="100%" stopColor="#8CE05A" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={area} fill="url(#areaGrad)" />
              <Path d={line} fill="none" stroke="#8CE05A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {lastPoint ? <Circle cx={lastPoint.x} cy={lastPoint.y} r={4.5} fill="#0B0D0A" stroke="#8CE05A" strokeWidth={2.5} /> : null}
            </Svg>
          </>
        )}
      </View>

      <View className="mx-4 bg-surface border border-border rounded-card p-4">
        {/* Sol blok flex-1 + shrink: metinler taşmak yerine kısalsın. Sağdaki iki
            aksiyon eskiden tek satıra sığmıyordu (ikon + "X gün üst üste" + "Paylaş"
            + "Yıla göre gör" ≈ 435px, telefon ise 360-390px) ve kartın düzenini
            bozuyordu — "Paylaş" artık yalnızca ikon, etiketi erişilebilirlik
            tarafında duruyor. */}
        <View className="flex-row items-center justify-between mb-3 gap-2">
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <View className="w-9 h-9 rounded-lg bg-stamp/15 items-center justify-center">
              <Feather name="zap" size={18} color="#FF7A3D" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-text text-base font-semibold" numberOfLines={1}>
                {currentStreak} gün üst üste
              </Text>
              <Text className="text-textFaint text-xs capitalize">bu hafta</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1 shrink-0">
            <Pressable
              onPress={() => setShareModalVisible(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Paylaşım kartı oluştur"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="w-9 h-9 items-center justify-center"
            >
              <Feather name="share-2" size={17} color="#8CE05A" />
            </Pressable>
            <Pressable
              onPress={() => router.push("/calendar-year")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Yıla göre gör"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="flex-row items-center gap-1 py-2 pl-1"
            >
              <Text className="text-accent text-sm font-medium capitalize">Yıla göre gör</Text>
              <Feather name="chevron-right" size={15} color="#8CE05A" />
            </Pressable>
          </View>
        </View>

        {weekLoading ? (
          <ActivityIndicator color="#8CE05A" />
        ) : (
          <View className="flex-row justify-between">
            {week?.map((day) => {
              const isPending = pendingDates.has(day.date);
              return (
                <Pressable
                  key={day.date}
                  onPress={() => handleDayPress(day)}
                  disabled={isPending || day.isFuture}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={isPending ? "işleniyor" : dayAccessibilityLabel(day)}
                  accessibilityState={{ disabled: isPending || day.isFuture }}
                  style={({ pressed }) => ({ opacity: pressed && !day.isFuture ? 0.7 : 1 })}
                  className="items-center gap-1"
                >
                  <View
                    className={`w-8 h-8 rounded-md items-center justify-center ${
                      isPending
                        ? "bg-white/5 border border-border"
                        : day.type === "log"
                        ? "bg-accent"
                        : day.type === "off_day"
                        ? "bg-offDaySoft border border-offDay"
                        : day.type === "workout"
                        ? "bg-accentSoft border border-accent"
                        : day.isFuture
                        ? "bg-transparent"
                        : day.isToday
                        ? "bg-accentSoft border border-dashed border-accent"
                        : "bg-white/5 border border-dashed border-white/20"
                    }`}
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color="#8CE05A" />
                    ) : day.type === "log" ? (
                      <Feather name="zap" size={14} color="#0B0D0A" />
                    ) : day.type === "off_day" ? (
                      <Feather name="moon" size={14} color="#B8C0E0" />
                    ) : day.type === "workout" ? (
                      <Feather name="check" size={14} color="#8CE05A" />
                    ) : null}
                  </View>
                  <Text className={`text-xs ${day.isFuture ? "text-textFaint/40" : "text-textFaint"}`}>
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <Modal transparent visible={shareModalVisible} animationType="slide" onRequestClose={() => setShareModalVisible(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-bg rounded-t-[28px] border-t border-border p-4 max-h-[92%]">
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-text text-lg font-semibold">Remory serisini paylaş</Text>
                <Text className="text-textFaint text-sm mt-1">
                  Bir fotoğraf seç — serin karta otomatik eklenir, indirip paylaşabilirsin.
                </Text>
              </View>
              <Pressable onPress={() => setShareModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color="#F5F3EC" />
              </Pressable>
            </View>

            {sharePhotosLoading ? (
              <ActivityIndicator color="#8CE05A" className="my-6" />
            ) : shareablePhotos && shareablePhotos.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <View className="mb-4">
                  <Text className="text-text text-sm font-semibold mb-2">Fotoğraf seç</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {shareablePhotos.map((photo) => {
                      const isActive = selectedSharePhotoId === photo.id;
                      return (
                        <Pressable
                          key={photo.id}
                          onPress={() => setSelectedSharePhotoId(photo.id)}
                          className={`rounded-[16px] overflow-hidden border ${isActive ? "border-accent" : "border-border"}`}
                        >
                          <Image source={{ uri: photo.photoUrl! }} style={{ width: 90, height: 90 }} resizeMode="cover" />
                          <View className="px-2 py-1 bg-surface">
                            <Text className="text-textFaint text-[11px]">{new Date(photo.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View className="mb-4 rounded-card border border-border bg-surface p-3">
                  <View ref={shareCardRef} collapsable={false} className="rounded-[24px] overflow-hidden bg-[#0B0D0A]" style={{ minHeight: 420 }}>
                    <View className="absolute inset-0">
                      {selectedSharePhoto?.photoUrl ? (
                        <Image source={{ uri: selectedSharePhoto.photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      ) : (
                        <View className="w-full h-full bg-white/10 items-center justify-center">
                          <Text className="text-textMuted text-sm">Fotoğraf yok</Text>
                        </View>
                      )}
                      <View className="absolute inset-0 bg-black/35" />
                    </View>

                    <View className="absolute inset-x-0 bottom-0 p-5 items-center">
                      {/* Seri rozetini yalnızca gerçekten devam eden bir seri varsa göster.
                          Önceden Math.max(1, ...) ile taban 1'e sabitlenmişti; serisi olmayan
                          kullanıcı için bile "1 gün üst üste" yazıyor, yani dışarıya paylaşılan
                          görselde var olmayan bir seri iddia ediliyordu. */}
                      {currentStreak > 0 ? (
                        <View className="rounded-full border border-white/20 bg-black/55 px-4 py-2 mb-3">
                          <Text className="text-white text-xl font-bold text-center">{currentStreak} gün üst üste</Text>
                        </View>
                      ) : null}
                      <View className="flex-row items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2">
                        <View className="w-8 h-8 rounded-full bg-accent/20 items-center justify-center border border-accent/30">
                          <Text className="text-accent font-bold text-sm">R</Text>
                        </View>
                        <Text className="text-white text-sm font-semibold">remory</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => handleShareCard("save")}
                    disabled={sharePendingAction !== null}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    className="flex-1 flex-row items-center justify-center gap-2 border border-border rounded-[12px] py-3 bg-surface"
                  >
                    {sharePendingAction === "save" ? (
                      <ActivityIndicator size="small" color="#F5F3EC" />
                    ) : (
                      <>
                        <Feather name="download" size={16} color="#F5F3EC" />
                        <Text className="text-text text-sm font-semibold">İndir</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => handleShareCard("share")}
                    disabled={sharePendingAction !== null}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    className="flex-1 flex-row items-center justify-center gap-2 border border-accent rounded-[12px] py-3 bg-accentSoft"
                  >
                    {sharePendingAction === "share" ? (
                      <ActivityIndicator size="small" color="#8CE05A" />
                    ) : (
                      <>
                        <Feather name="share-2" size={16} color="#8CE05A" />
                        <Text className="text-accent text-sm font-semibold">Paylaş</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <View className="py-6">
                <Text className="text-textMuted text-base text-center">
                  Henüz paylaşılacak fotoğraf yok. Önce bir kayıt fotoğrafı ekle.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
