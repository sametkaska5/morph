import { useRef, useState } from "react";
import { View, Image, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { Text } from "@/components/Typography";
import { router, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { captureRef } from "react-native-view-shot";
import type * as MediaLibraryType from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useComparison, type ComparisonData } from "@/lib/comparison";
import { useAuth } from "@/lib/useAuth";
import { useUnitPreference, displayUnit, toDisplayValue } from "@/lib/units";

// Expo Go'nun bazı derlemelerinde expo-media-library'nin native modülü mevcut değil;
// paket import edilir edilmez throw ediyor. Statik import Babel tarafından her koşulda
// çalıştırıldığı için, modülü try/catch'li require ile yüklüyoruz — eksikse "Kaydet"
// özelliği sessizce devre dışı kalıyor, "Paylaş" (expo-sharing, ayrı native modül) etkilenmiyor.
let MediaLibrary: typeof MediaLibraryType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo Go'da native modül eksik; statik import her koşulda evaluate edilirdi
  MediaLibrary = require("expo-media-library");
} catch {
  MediaLibrary = null;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function Compare() {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const { data, isLoading, error } = useComparison(a, b);

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: 56, paddingBottom: 30 }}>
      <View className="flex-row items-center justify-between px-4 mb-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <View className="items-center">
          <Text className="text-text text-xl font-bold">Karşılaştırma</Text>
          <Text className="text-textFaint text-xs">Değişimini gör</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color="#8CE05A" className="mt-10" />
      ) : error ? (
        <Text className="text-danger text-base text-center mt-6 px-6">{(error as Error).message}</Text>
      ) : !data ? (
        <Text className="text-textMuted text-base text-center mt-10 px-8">
          Karşılaştırma yüklenemedi.
        </Text>
      ) : (
        <ComparisonBody data={data} />
      )}

      <View className="px-4 mt-2">
        <Pressable
          onPress={() => router.replace("/compare/pick")}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="border border-accent rounded-[14px] py-3 items-center"
        >
          <Text className="text-accent text-base font-semibold">Başka Fotoğraf Seç</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ComparisonBody({ data }: { data: ComparisonData }) {
  const { start, end, daysBetween, types } = data;
  const photoBlockRef = useRef<View>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "share" | null>(null);

  async function capturePhotoBlock() {
    return captureRef(photoBlockRef, { format: "png", quality: 1 });
  }

  async function handleSave() {
    if (!MediaLibrary) {
      Alert.alert(
        "Bu özellik Expo Go'da desteklenmiyor",
        "Galeriye kaydetmek için development build gerekiyor. Bu arada 'Paylaş' ile görseli doğrudan gönderebilirsin."
      );
      return;
    }
    setPendingAction("save");
    try {
      // writeOnly=true: sadece galeriye kaydediyoruz, tüm galeriye erişim izni istemeye gerek yok
      // (iOS'ta "Yalnızca Fotoğraf Ekle", Android'de medya-okuma iznini atlar)
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== "granted") {
        Alert.alert("İzin gerekli", "Galeriye kaydetmek için fotoğraf erişim izni vermelisin.");
        return;
      }
      const uri = await capturePhotoBlock();
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Kaydedildi", "Karşılaştırma görseli galerine kaydedildi.");
    } catch (err) {
      Alert.alert("Kaydetme başarısız", (err as Error).message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleShare() {
    setPendingAction("share");
    try {
      const uri = await capturePhotoBlock();
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Paylaşım desteklenmiyor", "Bu cihazda paylaşım özelliği kullanılamıyor.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (err) {
      Alert.alert("Paylaşım başarısız", (err as Error).message);
    } finally {
      setPendingAction(null);
    }
  }

  const { user } = useAuth();
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  const rows = types
    .map((t) => {
      const rawStart = start.measurements[t.id];
      const rawEnd = end.measurements[t.id];
      if (rawStart == null && rawEnd == null) return null;
      const startVal = rawStart != null ? toDisplayValue(rawStart, t.unit, unitPref) : null;
      const endVal = rawEnd != null ? toDisplayValue(rawEnd, t.unit, unitPref) : null;
      const delta = startVal != null && endVal != null ? Number((endVal - startVal).toFixed(1)) : null;
      const isGood =
        delta == null ? true : t.targetDirection === "decrease_is_good" ? delta <= 0 : delta >= 0;
      return { ...t, unit: displayUnit(t.unit, unitPref), startVal, endVal, delta, isGood };
    })
    // Tip koruyucu (type predicate): `filter(Boolean)` TypeScript'e null'ların
    // elendiğini anlatamadığı için eskiden `as any[]` ile susturuluyordu.
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <View className="mt-3">
      <View ref={photoBlockRef} collapsable={false} className="mx-4 rounded-card overflow-hidden flex-row h-72 mb-4">
        <View className="flex-1 bg-surface relative">
          {start.photoUrl ? (
            <Image source={{ uri: start.photoUrl }} style={{ flex: 1 }} resizeMode="cover" />
          ) : null}
          <View className="absolute top-2.5 left-2.5 bg-black/75 rounded-md px-2 py-1">
            <Text className="text-text text-xs font-semibold">{fmtDate(start.date)}</Text>
          </View>
        </View>
        <View style={{ width: 1 }} className="bg-white/15" />
        <View className="flex-1 bg-surface relative">
          {end.photoUrl ? (
            <Image source={{ uri: end.photoUrl }} style={{ flex: 1 }} resizeMode="cover" />
          ) : null}
          <View className="absolute top-2.5 right-2.5 bg-black/75 border border-accent rounded-md px-2 py-1">
            <Text className="text-text text-xs font-semibold">{fmtDate(end.date)}</Text>
          </View>
        </View>
      </View>

      <View className="mx-4 mb-4 flex-row gap-2">
        <Pressable
          onPress={handleSave}
          disabled={pendingAction !== null}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="flex-1 flex-row items-center justify-center gap-2 border border-border rounded-[12px] py-3 bg-surface"
        >
          {pendingAction === "save" ? (
            <ActivityIndicator size="small" color="#F5F3EC" />
          ) : (
            <>
              <Feather name="download" size={16} color="#F5F3EC" />
              <Text className="text-text text-sm font-semibold">Kaydet</Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={handleShare}
          disabled={pendingAction !== null}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="flex-1 flex-row items-center justify-center gap-2 border border-accent rounded-[12px] py-3 bg-accentSoft"
        >
          {pendingAction === "share" ? (
            <ActivityIndicator size="small" color="#8CE05A" />
          ) : (
            <>
              <Feather name="share-2" size={16} color="#8CE05A" />
              <Text className="text-accent text-sm font-semibold">Paylaş</Text>
            </>
          )}
        </Pressable>
      </View>

      {rows.length > 0 ? (
        <View className="mx-4 mb-4 bg-surface border border-border rounded-card p-4">
          <View className="flex-row items-center gap-2 mb-3">
            <Feather name="trending-up" size={15} color="#8CE05A" />
            <Text className="text-text text-sm font-semibold">Değişim Özeti</Text>
          </View>
          {rows.map((r, i) => (
            <View
              key={r.id}
              className={`flex-row items-center justify-between py-2 ${
                i < rows.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <Text className="text-textMuted text-sm capitalize">{r.name}</Text>
              <View className="flex-row items-center gap-3">
                <Text className="text-textMuted text-sm">{r.startVal ?? "—"}</Text>
                <Text className="text-text text-sm font-semibold">{r.endVal ?? "—"}</Text>
                {r.delta != null ? (
                  <Text
                    className={`text-xs font-semibold w-16 text-right ${
                      r.isGood ? "text-accent" : "text-danger"
                    }`}
                  >
                    {r.delta > 0 ? "↑" : r.delta < 0 ? "↓" : "•"} {Math.abs(r.delta)} {r.unit}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mx-4 bg-surface border border-border rounded-card p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <Feather name="calendar" size={15} color="#8CE05A" />
            <Text className="text-text text-sm font-semibold">Zaman Aralığı</Text>
          </View>
          <Text className="text-accent text-sm font-bold">{daysBetween} gün</Text>
        </View>
        <View className="h-1 bg-white/10 rounded-full mb-2 mx-0.5">
          <View className="h-1 bg-accent rounded-full" style={{ width: "100%" }} />
        </View>
        <View className="flex-row justify-between">
          <Text className="text-textFaint text-sm">{fmtDate(start.date)}</Text>
          <Text className="text-textFaint text-sm">{fmtDate(end.date)}</Text>
        </View>
      </View>
    </View>
  );
}
