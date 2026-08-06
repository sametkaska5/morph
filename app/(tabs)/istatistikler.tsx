import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Image, Modal, RefreshControl } from "react-native";
import { showAlert } from "@/lib/appAlert";
import { Text } from "@/components/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type * as MediaLibraryType from "expo-media-library";
import { useAuth } from "@/lib/useAuth";
import { scheduleStreakRiskNotification } from "@/lib/notifications";
import { useNotificationSettings } from "@/lib/notificationSettings";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useUnitPreference, displayUnit, toDisplayValue } from "@/lib/units";
import { formatWeekRange } from "@/lib/date";
import { dayRoute, type DayRouteInput } from "@/lib/dayRoute";
import { ErrorState } from "@/components/ErrorState";
import {
  useMeasurementSeries,
  useWeek,
  useShareablePhotoEntries,
  computeWeekStreak,
  computeTrend,
  invalidateStatsQueries,
} from "@/lib/stats";
import { alertError } from "@/lib/alerts";
import { MeasurementChart, VISIBLE_POINTS } from "@/components/MeasurementChart";

let MediaLibrary: typeof MediaLibraryType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo Go'da native modül eksik; statik import her koşulda evaluate edilirdi
  MediaLibrary = require("expo-media-library");
} catch {
  MediaLibrary = null;
}

/** Karttaki satır içi grafiğin yüksekliği (büyütme modalı 280 kullanıyor). */
const CHART_H = 110;

export default function Istatistikler() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: types } = useMeasurementTypes(user?.id);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  /** Grafikte dokunulan nokta. null = seçim yok, başlıkta son değer gösterilir. */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  /** Büyütme modalı açık mı + orada seçili nokta (satır içinden bağımsız). */
  const [chartExpanded, setChartExpanded] = useState(false);
  const [modalSelectedIndex, setModalSelectedIndex] = useState<number | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedSharePhotoId, setSelectedSharePhotoId] = useState<string | null>(null);
  const [sharePendingAction, setSharePendingAction] = useState<"save" | "share" | null>(null);
  const shareCardRef = useRef<View>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Hafta şeridinde gezinilen hafta: 0 = bu hafta, -1 = önceki hafta... */
  const [weekOffset, setWeekOffset] = useState(0);

  // Aşağı çekince yenile: bu ekrandaki tüm sorguları geçersiz kılıp yeniden
  // çekiyoruz. Özellikle measurement_series önemli — bir kaydın ölçümünü başka
  // ekrandan (düzenleme) değiştirince grafik cache'ten eski değeri gösterebiliyor;
  // bu, kullanıcının onu elle tazeleyebilmesini sağlıyor.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await invalidateStatsQueries(queryClient);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  function dayAccessibilityLabel(day: { date: string; type: string | null; isFuture: boolean; isToday: boolean }) {
    const dateLabel = new Date(day.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
    if (day.isFuture) return `${dateLabel}, henüz gelmedi`;
    const statusLabel =
      day.type === "log"
        ? "fotoğraflı kayıt var, açmak için dokun"
        : day.type === "off_day"
        ? "off day olarak işaretli, düzenlemek için dokun"
        : day.type === "workout"
        ? "antrenman günü, düzenlemek için dokun"
        : "boş, ölçüm veya program eklemek için dokun";
    return `${dateLabel}${day.isToday ? ", bugün" : ""}, ${statusLabel}`;
  }

  // Hangi güne dokununca nereye gidileceği lib/dayRoute.ts'te — yıllık takvim
  // de aynı kuralı kullanıyor, ikisi ayrışmasın.
  function handleDayPress(day: DayRouteInput) {
    const route = dayRoute(day);
    if (route) router.push(route);
  }

  const currentTypeId = activeTypeId ?? types?.[0]?.id;
  const activeType = types?.find((t) => t.id === currentTypeId);

  const {
    data: series,
    isLoading: seriesLoading,
    error: seriesError,
    refetch: refetchSeries,
  } = useMeasurementSeries(user?.id, currentTypeId);
  // Şeritte gezinilen hafta ile seriyi besleyen hafta ayrı: seri HER ZAMAN
  // içinde bulunulan haftadan hesaplanır, yoksa kullanıcı geçmişe gidince
  // karttaki "X gün üst üste" o eski haftanın serisini gösterirdi (ve streak
  // bildirimi yanlış veriyle yeniden kurulurdu). weekOffset 0 iken iki çağrı
  // aynı sorgu anahtarına düştüğü için tek istek atılıyor.
  const { data: week, isLoading: weekLoading, error: weekError, refetch: refetchWeek } = useWeek(user?.id, weekOffset);
  const { data: currentWeek } = useWeek(user?.id, 0);
  const {
    data: shareablePhotos,
    isLoading: sharePhotosLoading,
    error: sharePhotosError,
    refetch: refetchSharePhotos,
  } = useShareablePhotoEntries(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  // Kimliği sabit values dizisi: her render'da yeni dizi üretmek
  // MeasurementChart'taki path memo'sunu boşa düşürürdü (her nokta seçiminde
  // path yeniden kurulurdu).
  const values = useMemo(
    () =>
      activeType
        ? (series?.map((s) => toDisplayValue(s.value, activeType.unit, unitPref)) ?? [])
        : (series?.map((s) => s.value) ?? []),
    [series, activeType, unitPref]
  );
  const unitLabel = activeType ? displayUnit(activeType.unit, unitPref) : "";

  // Seçili nokta ölçüm tipi değişince geçersizleşiyor (yeni serinin uzunluğu
  // farklı olabilir) — sınır dışıysa yok sayıyoruz.
  const activeIndex = selectedIndex != null && selectedIndex < values.length ? selectedIndex : null;

  // Başlıktaki büyük değer: bir nokta seçiliyse o günün değeri, yoksa sonuncusu.
  const currentValue = activeIndex != null ? values[activeIndex] : values[values.length - 1];
  const previousValue = activeIndex != null ? values[activeIndex - 1] : values[values.length - 2];

  // Büyütme modalı kendi seçimini bağımsız tutar (satır içi grafikle çakışmasın).
  const modalActiveIndex =
    modalSelectedIndex != null && modalSelectedIndex < values.length ? modalSelectedIndex : null;
  const modalCurrentValue =
    modalActiveIndex != null ? values[modalActiveIndex] : values[values.length - 1];
  const modalPreviousValue =
    modalActiveIndex != null ? values[modalActiveIndex - 1] : values[values.length - 2];
  const { delta: modalDelta, isGood: modalIsGoodDelta } = computeTrend(
    modalCurrentValue,
    modalPreviousValue,
    activeType?.target_direction
  );
  // Seçili gün etiketi (yoksa "Son değer").
  const modalSelectedDate =
    modalActiveIndex != null ? series?.[modalActiveIndex]?.date ?? null : null;

  // Başka bir ölçüme geçilince önceki serinin seçili noktası anlamsız kalıyor.
  // Effect yerine render sırasında senkronize ediyoruz — fazladan bir commit'lenmiş
  // render turu olmadan (react.dev: you-might-not-need-an-effect).
  const [prevTypeId, setPrevTypeId] = useState(currentTypeId);
  if (prevTypeId !== currentTypeId) {
    setPrevTypeId(currentTypeId);
    setSelectedIndex(null);
  }
  const { delta, isGood: isGoodDelta } = computeTrend(
    currentValue,
    previousValue,
    activeType?.target_direction
  );

  const currentStreak = currentWeek ? computeWeekStreak(currentWeek) : 0;
  const weekRangeLabel = week?.length ? formatWeekRange(week[0].date, week[week.length - 1].date) : "";

  // Türetilmiş seçim: state'teki id listede yoksa (kayıt silindi / liste
  // yenilendi) ilk fotoğrafa düşer. Eskiden bunu bir useEffect state'i
  // düzelterek yapıyordu — ızgaradaki vurgu selectedSharePhoto.id'den okunduğu
  // sürece ayrıca senkronize edilecek bir state kalmıyor.
  const selectedSharePhoto = shareablePhotos?.find((photo) => photo.id === selectedSharePhotoId) ?? shareablePhotos?.[0] ?? null;

  const { data: notifSettings } = useNotificationSettings(user?.id);

  async function handleShareCard(kind: "save" | "share") {
    if (!shareCardRef.current) {
      showAlert("Ön izleme hazır değil", "Kart henüz oluşturulmadı, lütfen tekrar dene.");
      return;
    }

    setSharePendingAction(kind);
    try {
      const uri = await captureRef(shareCardRef, { format: "png", quality: 1 });
      if (kind === "save") {
        if (!MediaLibrary) {
          showAlert(
            "Bu özellik Expo Go'da desteklenmiyor",
            "Galeriye kaydetmek için development build gerekiyor. Bu arada 'Paylaş' ile görseli doğrudan gönderebilirsin."
          );
          return;
        }
        // writeOnly=true: sadece galeriye yazıyoruz, tüm galeriye okuma izni gerekmiyor
        // (compare/index.tsx ile aynı yaklaşım — iOS "Yalnızca Fotoğraf Ekle").
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status !== "granted") {
          showAlert("İzin gerekli", "Galeriye kaydetmek için fotoğraf erişim izni vermelisin.");
          return;
        }
        // SDK 57: saveToLibraryAsync kaldırıldı, yerine Asset.create
        // (compare/index.tsx ile aynı düzeltme).
        await MediaLibrary.Asset.create(uri);
        showAlert("Kaydedildi", "Paylaşım kartı galerine kaydedildi.");
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          showAlert("Paylaşım desteklenmiyor", "Bu cihazda paylaşım özelliği kullanılamıyor.");
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch (err) {
      alertError(
        kind === "save" ? "Kaydetme başarısız" : "Paylaşım başarısız",
        err,
        `stats.shareCard.${kind}`
      );
    } finally {
      setSharePendingAction(null);
    }
  }

  useEffect(() => {
    if (!currentWeek || !notifSettings?.streak_enabled) return;
    const today = currentWeek.find((d) => d.isToday);
    scheduleStreakRiskNotification(currentStreak, !!today?.type);
  }, [currentWeek, currentStreak, notifSettings?.streak_enabled]);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: 56, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#8CE05A"
          colors={["#8CE05A"]}
        />
      }
    >
      <Text className="text-text text-3xl font-bold px-4 mb-4" accessibilityRole="header">
        İstatistikler
      </Text>

      {/* Antrenman sırasında hızlı erişim için ayrı kısayol: bugünün programını
          (set logger) doğrudan açar. Tarih vermiyoruz → varsayılan bugün. */}
      <Pressable
        onPress={() => router.push("/entry/program")}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        accessibilityRole="button"
        accessibilityLabel="Bugünün antrenman programını aç"
        className="mx-4 mb-4 bg-accentSoft border border-accent rounded-card p-4 flex-row items-center gap-3"
      >
        <View className="w-10 h-10 rounded-lg bg-accent/20 items-center justify-center">
          <Feather name="clipboard" size={20} color="#8CE05A" />
        </View>
        <View className="flex-1">
          <Text className="text-text text-base font-semibold">Bugünün antrenmanı</Text>
          <Text className="text-textFaint text-sm">Programı yaz — hareket ve setleri ekle</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#8CE05A" />
      </Pressable>

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
        ) : seriesError ? (
          // Hatasız hâlde "Bu ölçüm için henüz veri yok." yazıyordu: kullanıcı
          // aylardır girdiği ölçümlerin kaybolduğunu sanırdı.
          <ErrorState error={seriesError} onRetry={() => refetchSeries()} />
        ) : values.length === 0 ? (
          <Text className="text-textMuted text-base">Bu ölçüm için henüz veri yok.</Text>
        ) : (
          <>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-baseline gap-2">
                <Text className="text-text text-3xl font-bold">
                  {currentValue}{" "}
                  <Text className="text-base font-medium text-textMuted">{unitLabel}</Text>
                </Text>
                {delta != null ? (
                  <Text className={`text-sm font-semibold ${isGoodDelta ? "text-accent" : "text-danger"}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "•"} {Math.abs(delta)} {unitLabel}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => {
                  setModalSelectedIndex(selectedIndex);
                  setChartExpanded(true);
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Grafiği büyüt"
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="maximize-2" size={18} color="#8B8A82" />
              </Pressable>
            </View>

            <MeasurementChart
              values={values}
              series={series}
              unitLabel={unitLabel}
              height={CHART_H}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
          </>
        )}
      </View>

      {/* Büyütme modalı: aynı grafiği tam ekran, çok daha büyük çiziyor.
          Ekranda en fazla ~7 nokta görünür, gerisi yatay kaydırmayla gelir. */}
      <Modal
        visible={chartExpanded}
        transparent
        animationType="fade"
        onRequestClose={() => setChartExpanded(false)}
      >
        <View className="flex-1 bg-bg px-5 pt-16 pb-8">
          {/* Başlık: ölçüm adı + tarih aralığı, sağda kapat butonu */}
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-text text-2xl font-bold capitalize">{activeType?.name ?? ""}</Text>
              {series && series.length > 0 ? (
                <Text className="text-textFaint text-sm mt-1">
                  {new Date(series[0].date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  {" – "}
                  {new Date(series[series.length - 1].date).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setChartExpanded(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              className="w-10 h-10 rounded-full bg-surface items-center justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name="x" size={22} color="#F5F3EC" />
            </Pressable>
          </View>

          {/* Büyük değer + trend + hangi güne ait */}
          <View className="mt-8">
            <View className="flex-row items-baseline gap-3">
              <Text className="text-text text-5xl font-bold">
                {modalCurrentValue}
                <Text className="text-xl font-medium text-textMuted"> {unitLabel}</Text>
              </Text>
              {modalDelta != null ? (
                <Text className={`text-base font-semibold ${modalIsGoodDelta ? "text-accent" : "text-danger"}`}>
                  {modalDelta > 0 ? "↑" : modalDelta < 0 ? "↓" : "•"} {Math.abs(modalDelta)} {unitLabel}
                </Text>
              ) : null}
            </View>
            <Text className="text-textFaint text-sm mt-1">
              {modalSelectedDate
                ? new Date(modalSelectedDate).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Son değer"}
            </Text>
          </View>

          {/* Grafik: dikeyde ortalanmış, ince bir yüzey çerçevesi içinde */}
          <View className="flex-1 justify-center">
            <View className="bg-surface border border-border rounded-card py-5 px-1">
              <MeasurementChart
                values={values}
                series={series}
                unitLabel={unitLabel}
                height={280}
                selectedIndex={modalSelectedIndex}
                onSelect={setModalSelectedIndex}
                scrollable
              />
            </View>
            {values.length > VISIBLE_POINTS ? (
              <Text className="text-textFaint text-xs text-center mt-3">
                ‹ tüm günleri görmek için kaydır ›
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>

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

        {/* Hafta gezinmesi — geçmiş bir günü işaretlemenin (off day dahil) tek
            yolu buradan o güne dokunmak; şerit bu haftaya kilitliyken geçmişe
            dönük kayıt hiçbir ekrandan yapılamıyordu. İleri yön bu haftada
            duruyor: gelecek günler zaten dokunulamaz. */}
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            onPress={() => setWeekOffset((o) => o - 1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Önceki hafta"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="w-8 h-8 items-center justify-center"
          >
            <Feather name="chevron-left" size={18} color="#8B8A82" />
          </Pressable>

          <Pressable
            onPress={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={
              weekOffset === 0 ? `${weekRangeLabel}, bu hafta` : `${weekRangeLabel}, bu haftaya dön`
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="flex-row items-center gap-1.5 px-2 py-1"
          >
            <Text className={`text-sm ${weekOffset === 0 ? "text-textFaint" : "text-text font-medium"}`}>
              {weekRangeLabel}
            </Text>
            {weekOffset !== 0 ? <Feather name="rotate-ccw" size={13} color="#8CE05A" /> : null}
          </Pressable>

          <Pressable
            onPress={() => setWeekOffset((o) => Math.min(0, o + 1))}
            disabled={weekOffset === 0}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Sonraki hafta"
            accessibilityState={{ disabled: weekOffset === 0 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="w-8 h-8 items-center justify-center"
          >
            <Feather name="chevron-right" size={18} color={weekOffset === 0 ? "#3A3A34" : "#8B8A82"} />
          </Pressable>
        </View>

        {weekLoading ? (
          <ActivityIndicator color="#8CE05A" />
        ) : weekError ? (
          // Hatasızken şerit yedi boş kutu çiziyordu — o haftanın kayıtları
          // silinmiş gibi. Seri sayacı da sessizce 0'a düşüyordu.
          <ErrorState error={weekError} onRetry={() => refetchWeek()} />
        ) : (
          <View className="flex-row justify-between">
            {week?.map((day) => {
              return (
                <Pressable
                  key={day.date}
                  onPress={() => handleDayPress(day)}
                  disabled={day.isFuture}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={dayAccessibilityLabel(day)}
                  accessibilityState={{ disabled: day.isFuture }}
                  style={({ pressed }) => ({ opacity: pressed && !day.isFuture ? 0.7 : 1 })}
                  className="items-center gap-1"
                >
                  <View
                    className={`w-8 h-8 rounded-md items-center justify-center ${
                      day.type === "log"
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
                    {day.type === "log" ? (
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
              {/* Yalnızca ikon — metin çocuğu olmadığı için etiket ŞART,
                  yoksa ekran okuyucu "düğme" deyip geçiyor. */}
              <Pressable
                onPress={() => setShareModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Paylaşımı kapat"
              >
                <Feather name="x" size={20} color="#F5F3EC" />
              </Pressable>
            </View>

            {sharePhotosLoading ? (
              <ActivityIndicator color="#8CE05A" className="my-6" />
            ) : sharePhotosError ? (
              // Hatasızken "paylaşabileceğin fotoğraf yok" boş durumuna
              // düşüyordu — fotoğrafları olan kullanıcı için yanlış bilgi.
              <ErrorState error={sharePhotosError} onRetry={() => refetchSharePhotos()} />
            ) : shareablePhotos && shareablePhotos.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <View className="mb-4">
                  <Text className="text-text text-sm font-semibold mb-2">Fotoğraf seç</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {shareablePhotos.map((photo) => {
                      const isActive = selectedSharePhoto?.id === photo.id;
                      return (
                        // Hangi fotoğrafın seçili olduğu yalnızca KENARLIK
                        // RENGİYLE anlatılıyordu — ekran okuyucu ve renk körü
                        // kullanıcı için görünmez bir bilgi. `selected` durumu
                        // bunu sözle taşıyor.
                        <Pressable
                          key={photo.id}
                          onPress={() => setSelectedSharePhotoId(photo.id)}
                          accessibilityRole="radio"
                          accessibilityLabel={`${new Date(photo.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} tarihli fotoğraf`}
                          accessibilityState={{ selected: isActive }}
                          className={`rounded-[16px] overflow-hidden border ${isActive ? "border-accent" : "border-border"}`}
                        >
                          <Image source={{ uri: photo.photoUrl! }} style={{ width: 90, height: 90 }} resizeMode="cover" />
                          <View className="px-2 py-1 bg-surface">
                            <Text className="text-textFaint text-xs">{new Date(photo.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</Text>
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
                  {/* Etiketler sabit: işlem sürerken metin ActivityIndicator'a
                      dönüşüyor ve düğmelerin erişilebilir adı kayboluyordu. */}
                  <Pressable
                    onPress={() => handleShareCard("save")}
                    disabled={sharePendingAction !== null}
                    accessibilityRole="button"
                    accessibilityLabel="Kartı galeriye indir"
                    accessibilityState={{
                      disabled: sharePendingAction !== null,
                      busy: sharePendingAction === "save",
                    }}
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
                    accessibilityRole="button"
                    accessibilityLabel="Kartı paylaş"
                    accessibilityState={{
                      disabled: sharePendingAction !== null,
                      busy: sharePendingAction === "share",
                    }}
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
