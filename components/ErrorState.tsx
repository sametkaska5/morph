import { useState } from "react";
import { View, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/components/Typography";
import { describeError, type ErrorKind } from "@/lib/errors";

/**
 * Veri yüklenemediğinde gösterilen ortak hata durumu.
 *
 * Eskiden dört ekran hatayı tek satır kırmızı ham metin olarak basıyordu
 * (`{(error as Error).message}`) ve hiçbirinde yeniden deneme yolu yoktu —
 * kullanıcının tek seçeneği ekrandan çıkıp geri gelmekti. Artık hata anlaşılır
 * bir başlık + ne yapılacağını söyleyen bir açıklama + "Tekrar dene" düğmesiyle
 * geliyor; dördü de aynı dili konuşuyor.
 *
 * ErrorBoundary (render çökmeleri) ile aynı görsel dili paylaşır ama ondan
 * farklı: bu bileşen bir ekranın İÇİNDE, sadece veri alanında gösterilir.
 */

const ICON: Record<ErrorKind, keyof typeof Feather.glyphMap> = {
  offline: "wifi-off",
  auth: "log-in",
  permission: "lock",
  notFound: "search",
  unknown: "alert-circle",
};

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  // Pressable'a fonksiyon-form style vermiyoruz (bu projede statik layout
  // özelliklerinin sessizce uygulanmadığı defalarca doğrulandı) — basılma
  // geri bildirimi manuel onPressIn/onPressOut state'iyle.
  const [pressed, setPressed] = useState(false);
  const { kind, title, message } = describeError(error);

  return (
    <View className="items-center px-8 py-6">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-border bg-surfaceMuted">
        <Feather name={ICON[kind]} size={26} color="#8B8A82" />
      </View>

      {/* Başlık ve açıklama TEK bir erişilebilirlik düğümü: ekran okuyucu ikisini
          bir arada, tek bir duyuru olarak okur. `accessible` olmadan
          accessibilityRole tek başına sorgulanabilir/duyurulabilir olmuyor;
          liveRegion ise Android tarafında "bu metin değişti, oku" sinyali.
          Sarmalayıcı bilerek yalnızca metinleri kapsıyor — "Tekrar dene"
          düğmesi dışarıda kalmalı ki ayrı bir odak hedefi olarak erişilebilsin. */}
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="items-center"
      >
        <Text className="mb-2 text-center text-xl font-semibold text-text">{title}</Text>
        <Text className="mb-6 max-w-[280px] text-center text-base leading-6 text-textMuted">
          {message}
        </Text>
      </View>

      {onRetry ? (
        <Pressable
          onPress={onRetry}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          accessibilityRole="button"
          accessibilityLabel="Tekrar dene"
          // İkincil buton ölçüsü (48h / 14r) — ekranın asıl eylemi değil,
          // kurtarma yolu.
          className="h-12 flex-row items-center justify-center gap-2 rounded-[14px] bg-accent px-6"
          style={{ opacity: pressed ? 0.75 : 1 }}
        >
          <Feather name="refresh-cw" size={16} color="#0B0D0A" />
          <Text className="text-base font-semibold text-bg">Tekrar dene</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
