import { Component, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/Typography";
import { captureError } from "@/lib/monitoring";

/**
 * Uygulama genelinde render hatalarını yakalayan sınır.
 *
 * Bu olmadan herhangi bir ekranda fırlayan bir render hatası tüm uygulamayı
 * kapatıyordu (RN'de yakalanmayan hata = kırmızı ekran / sessiz çökme).
 * Offline-first bir günlük uygulamasında bu özellikle kötü: kullanıcı
 * senkronize edilmemiş verisi varken çökme yaşadığını sanıyor.
 *
 * Hata Sentry'ye captureError üzerinden gider (DSN yoksa yalnızca console),
 * kullanıcıya ise tasarım sistemine uygun bir kurtarma ekranı gösterilir.
 * "Tekrar dene" state'i sıfırlayıp alttaki ağacı yeniden mount eder — geçici
 * hatalarda (örn. cache'ten beklenmedik veri şekli) uygulamayı yeniden
 * başlatmadan kurtarır.
 */

type Props = { children: ReactNode };
type State = { error: unknown | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    captureError(error, {
      where: "ErrorBoundary",
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error !== null) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  // Pressable'a fonksiyon-form style vermiyoruz (bu projede statik layout
  // özelliklerinin sessizce uygulanmadığı üç kez doğrulandı) — basılma
  // geri bildirimi manuel onPressIn/onPressOut state'iyle veriliyor.
  const [pressed, setPressed] = useState(false);

  return (
    <View className="flex-1 items-center justify-center bg-bg px-5">
      <View className="items-center">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-surfaceMuted">
          <Ionicons name="alert-circle-outline" size={48} color="#8B8A82" />
        </View>
        <Text className="mb-2 text-center text-xl font-bold text-text">Bir şeyler ters gitti</Text>
        <Text className="mb-8 text-center text-base text-textMuted">
          Beklenmedik bir hata oluştu. Verilerin güvende — tekrar denemek genellikle sorunu çözer.
        </Text>
        <Pressable
          onPress={onRetry}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          className="h-14 w-full items-center justify-center rounded-button bg-accent px-8"
          style={{ opacity: pressed ? 0.7 : 1 }}
          accessibilityRole="button"
          accessibilityLabel="Tekrar dene"
        >
          <Text className="text-base font-semibold text-bg">Tekrar dene</Text>
        </Pressable>
      </View>
    </View>
  );
}
