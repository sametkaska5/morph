import { View, Pressable } from "react-native";
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      className="flex-row items-center gap-3 px-4 py-4 rounded-button bg-surface border border-border"
    >
      <View className="w-9 h-9 rounded-full bg-accentSoft items-center justify-center">
        <Feather name={icon} size={17} color="#8CE05A" />
      </View>
      <Text className="text-text text-base font-semibold">{label}</Text>
    </Pressable>
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
      <Text className="text-text text-xl font-bold mb-1">Anı ekle</Text>
      <Text className="text-textMuted text-base mb-5">Fotoğrafı nereden eklemek istersin?</Text>
      <View className="gap-3">
        <CaptureOption icon="camera" label="Fotoğraf çek" onPress={captureFromCamera} />
        <CaptureOption icon="image" label="Galeriden seç" onPress={captureFromLibrary} />
      </View>
    </DraggableSheet>
  );
}
