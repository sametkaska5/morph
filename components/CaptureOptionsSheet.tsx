import { theme } from "@/lib/theme";
import { View } from "react-native";
import { PressableFade } from "./PressableFade";
import { router } from "expo-router";
import { Text } from "./Typography";
import Feather from "@expo/vector-icons/Feather";
import { useCaptureSheetStore } from "@/lib/captureSheetStore";
import { captureFromCamera, captureFromLibrary } from "@/lib/capture";
import { DraggableSheet } from "@/components/DraggableSheet";

function CaptureOption({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableFade
      onPress={onPress}
      accessibilityRole="button"
      dim={0.8}
      className="flex-row items-center gap-3 px-4 py-4 rounded-button bg-surface border border-border"
    >
      <View className="w-9 h-9 rounded-full bg-accentSoft items-center justify-center">
        <Feather name={icon} size={17} color={theme.colors.accent} />
      </View>
      <Text className="text-text text-base font-semibold">{label}</Text>
    </PressableFade>
  );
}

/**
 * Anı ekleme (fotoğraf çek / galeriden seç) seçeneklerini gösteren temalı bottom
 * sheet. app/_layout.tsx'te bir kere, global olarak render edilir — tab bar'daki +
 * butonu ve her ekrandaki boş-durum CTA'sı lib/capture.ts'teki openCapturePicker()
 * ile sadece görünürlüğünü açıyor (bkz. lib/captureSheetStore.ts).
 */
export function CaptureOptionsSheet() {
  const visible = useCaptureSheetStore((s) => s.visible);
  const hide = useCaptureSheetStore((s) => s.hide);

  return (
    <DraggableSheet visible={visible} onClose={hide}>
      <Text className="text-text text-xl font-bold mb-1">Gün ekle</Text>
      <Text className="text-textMuted text-base mb-5">Bugün için ne eklemek istersin?</Text>
      <View className="gap-3">
        <CaptureOption icon="camera" label="Fotoğraf çek" onPress={captureFromCamera} />
        <CaptureOption icon="image" label="Galeriden seç" onPress={captureFromLibrary} />
        {/* Fotoğrafsız gün: ölçüm ve/veya o günün spor programını foto olmadan
            girmek için. Sheet'i kapatıp workout ekranına geçiyoruz. */}
        <CaptureOption
          icon="activity"
          label="Fotoğrafsız gün (ölçüm & program)"
          onPress={() => {
            hide();
            router.push("/entry/workout");
          }}
        />
      </View>
    </DraggableSheet>
  );
}
