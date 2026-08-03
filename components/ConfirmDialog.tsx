import { View, Pressable, Modal } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/components/Typography";

/**
 * Uygulamanın kendi temalı onay/bilgi kutusu.
 *
 * Neden native `Alert.alert` değil: Alert sistemin kendi penceresi — açık gri
 * zemin, sistem tipografisi, iOS/Android'de bambaşka görünüm. Koyu temalı bir
 * ekranın ortasında beyaz bir kutu belirdiğinde uygulamadan çıkılmış gibi
 * hissettiriyor. Bu kutu ekranın geri kalanıyla aynı yüzey, kenarlık, yazı tipi
 * ve buton ölçülerini kullanıyor.
 *
 * Desen ilk olarak kayıt detayındaki "Bu anıyı sil?" modalında yazılmıştı;
 * ikinci bir kullanım çıkınca kopyalamak yerine buraya alındı.
 *
 * İki kip:
 *  - onConfirm VARSA onay kutusu (Vazgeç + eylem butonu)
 *  - onConfirm YOKSA bilgi kutusu (tek "Tamam" butonu)
 */
export function ConfirmDialog({
  visible,
  icon,
  title,
  message,
  confirmLabel,
  cancelLabel = "Vazgeç",
  danger,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Dışarı dokununca kapanır; içteki Pressable dokunmayı yutuyor ki
          kutunun üstüne basmak kapatmasın. */}
      <Pressable onPress={onClose} className="flex-1 bg-black/60 items-center justify-center px-8">
        <Pressable
          onPress={() => {}}
          // Ekran okuyucu kutuyu tek bir duyuru olarak okusun: başlık ve
          // açıklama ayrı ayrı gezilecek metinler değil, tek bir soru.
          accessibilityViewIsModal
          className="w-full bg-bg border border-border rounded-card p-5 items-center"
        >
          <View
            className={`w-14 h-14 rounded-full items-center justify-center mb-4 ${
              danger ? "bg-danger/15" : "bg-accentSoft"
            }`}
          >
            <Feather name={icon} size={24} color={danger ? "#D9705A" : "#8CE05A"} />
          </View>
          <Text className="text-text text-xl font-bold mb-2 text-center">{title}</Text>
          <Text className="text-textMuted text-sm text-center mb-6">{message}</Text>

          <View className="flex-row gap-3 w-full">
            {onConfirm ? (
              <>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  className="flex-1 py-4 rounded-button items-center bg-surface border border-border"
                >
                  <Text className="text-text text-base font-semibold">{cancelLabel}</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirm}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  className={`flex-1 py-4 rounded-button items-center ${danger ? "bg-danger" : "bg-accent"}`}
                >
                  <Text className="text-bg text-base font-semibold">{confirmLabel}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                className="flex-1 py-4 rounded-button items-center bg-surface border border-border"
              >
                <Text className="text-text text-base font-semibold">Tamam</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
