import { useRef, useState } from "react";
import {
  View,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  type TextInput as RNTextInput,
} from "react-native";
import { Text, TextInput } from "@/components/Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { alertError } from "@/lib/alerts";
import {
  useMeasurementTypes,
  useAddMeasurementType,
  useDeleteMeasurementType,
  type TargetDirection,
} from "@/lib/measurementTypes";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";

const ACCENT = "#8CE05A";

export default function MeasurementSettingsScreen() {
  const { user } = useAuth();
  const { data: types, isLoading } = useMeasurementTypes(user?.id);
  const addMutation = useAddMeasurementType(user?.id);
  const deleteMutation = useDeleteMeasurementType(user?.id);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [direction, setDirection] = useState<TargetDirection>("decrease_is_good");
  // "Yeni ölçüm ekle" formu listenin en altında — klavye açıkken alanlar arası
  // geçerken alt alan klavyenin altında kalabiliyordu.
  const nameRef = useRef<RNTextInput | null>(null);
  const unitRef = useRef<RNTextInput | null>(null);
  const { scrollRef, onScroll, revealField, keyboardPadding } = useKeyboardFocus();

  const defaults = types?.filter((t) => t.is_default) ?? [];
  const custom = types?.filter((t) => !t.is_default) ?? [];

  function handleAdd() {
    if (!name.trim() || !unit.trim()) {
      Alert.alert("Eksik bilgi", "İsim ve birim alanları boş bırakılamaz.");
      return;
    }
    addMutation.mutate(
      { name: name.trim(), unit: unit.trim(), target_direction: direction },
      {
        onSuccess: () => {
          setName("");
          setUnit("");
          setDirection("decrease_is_good");
        },
        onError: (err) => alertError("Eklenemedi", err, "measurements.add"),
      }
    );
  }

  function handleDelete(id: string, label: string) {
    Alert.alert("Ölçümü sil", `"${label}" ölçüm tipini silmek istediğine emin misin? Geçmiş değerleri de kaybolur.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () =>
          deleteMutation.mutate(id, {
            onError: (err) => alertError("Silinemedi", err, "measurements.delete"),
          }),
      },
    ]);
  }

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      className="flex-1 bg-bg pt-14 px-4"
      contentContainerStyle={{ paddingBottom: 32 + keyboardPadding }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">Takip Edilen Ölçümler</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={ACCENT} className="mt-10" />
      ) : (
        <>
          <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">SİSTEM ÖLÇÜMLERİ</Text>
          <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
            {defaults.map((t, i) => (
              <View
                key={t.id}
                className={`flex-row items-center justify-between px-4 py-3 ${
                  i < defaults.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <Text className="text-text text-base capitalize">{t.name}</Text>
                <Text className="text-textMuted text-sm">{t.unit}</Text>
              </View>
            ))}
          </View>

          <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">YENİ ÖLÇÜMLERİN</Text>
          <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
            {custom.length === 0 ? (
              <Text className="text-textMuted text-sm px-4 py-3">Henüz yeni ölçüm eklemedin.</Text>
            ) : (
              custom.map((t, i) => (
                <View
                  key={t.id}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    i < custom.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <View>
                    <Text className="text-text text-base capitalize">{t.name}</Text>
                    <Text className="text-textFaint text-sm mt-0.5">
                      {t.target_direction === "decrease_is_good" ? "azalması iyi" : "artması iyi"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-textMuted text-sm">{t.unit}</Text>
                    <Pressable
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.name} ölçümünü sil`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                      onPress={() => handleDelete(t.id, t.name)}
                    >
                      <Feather name="trash-2" size={16} color="#D9705A" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">YENİ ÖLÇÜM EKLE</Text>
          <View className="bg-surface border border-border rounded-card p-4 mb-6">
            <TextInput
              ref={nameRef}
              value={name}
              onChangeText={setName}
              placeholder="İsim (örn. Kol Çevresi)"
              placeholderTextColor="#8B8A82"
              onFocus={() => revealField(nameRef.current)}
              className="text-text text-base bg-bg rounded-lg px-3 py-3 mb-3"
            />
            <TextInput
              ref={unitRef}
              value={unit}
              onChangeText={setUnit}
              placeholder="Birim (örn. cm)"
              placeholderTextColor="#8B8A82"
              onFocus={() => revealField(unitRef.current)}
              className="text-text text-base bg-bg rounded-lg px-3 py-3 mb-3"
            />

            <View className="flex-row gap-2 mb-3">
              <Pressable
                onPress={() => setDirection("decrease_is_good")}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                className={`flex-1 py-3 rounded-lg items-center border ${
                  direction === "decrease_is_good" ? "bg-accent border-accent" : "bg-white/5 border-white/15"
                }`}
              >
                <Text className={`text-sm font-semibold ${direction === "decrease_is_good" ? "text-bg" : "text-text"}`}>
                  Azalması İyi
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDirection("increase_is_good")}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                className={`flex-1 py-3 rounded-lg items-center border ${
                  direction === "increase_is_good" ? "bg-accent border-accent" : "bg-white/5 border-white/15"
                }`}
              >
                <Text className={`text-sm font-semibold ${direction === "increase_is_good" ? "text-bg" : "text-text"}`}>
                  Artması İyi
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleAdd}
              disabled={addMutation.isPending}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : addMutation.isPending ? 0.7 : 1 })}
              className="bg-accent rounded-lg py-3 items-center"
            >
              {addMutation.isPending ? (
                <ActivityIndicator color="#0B0D0A" size="small" />
              ) : (
                <Text className="text-bg text-sm font-semibold">Ekle</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}
