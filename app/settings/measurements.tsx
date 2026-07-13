import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import {
  useMeasurementTypes,
  useAddMeasurementType,
  useDeleteMeasurementType,
  type TargetDirection,
} from "@/lib/measurementTypes";

const ACCENT = "#8CE05A";

export default function MeasurementSettingsScreen() {
  const { user } = useAuth();
  const { data: types, isLoading } = useMeasurementTypes(user?.id);
  const addMutation = useAddMeasurementType(user?.id);
  const deleteMutation = useDeleteMeasurementType(user?.id);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [direction, setDirection] = useState<TargetDirection>("decrease_is_good");

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
        onError: (err) => Alert.alert("Eklenemedi", (err as Error).message),
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
            onError: (err) => Alert.alert("Silinemedi", (err as Error).message),
          }),
      },
    ]);
  }

  return (
    <View className="flex-1 bg-bg pt-16 px-4">
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-lg font-bold">Takip Edilen Ölçümler</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={ACCENT} className="mt-10" />
      ) : (
        <>
          <Text className="text-textFaint text-[11px] font-semibold mb-2 tracking-wide">SİSTEM ÖLÇÜMLERİ</Text>
          <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
            {defaults.map((t, i) => (
              <View
                key={t.id}
                className={`flex-row items-center justify-between px-3.5 py-3 ${
                  i < defaults.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <Text className="text-text text-sm">{t.name}</Text>
                <Text className="text-textMuted text-xs">{t.unit}</Text>
              </View>
            ))}
          </View>

          <Text className="text-textFaint text-[11px] font-semibold mb-2 tracking-wide">ÖZEL ÖLÇÜMLERİN</Text>
          <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
            {custom.length === 0 ? (
              <Text className="text-textMuted text-xs px-3.5 py-3">Henüz özel ölçüm eklemedin.</Text>
            ) : (
              custom.map((t, i) => (
                <View
                  key={t.id}
                  className={`flex-row items-center justify-between px-3.5 py-3 ${
                    i < custom.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <View>
                    <Text className="text-text text-sm">{t.name}</Text>
                    <Text className="text-textFaint text-[10px] mt-0.5">
                      {t.target_direction === "decrease_is_good" ? "azalması iyi" : "artması iyi"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-textMuted text-xs">{t.unit}</Text>
                    <Pressable hitSlop={8} onPress={() => handleDelete(t.id, t.name)}>
                      <Feather name="trash-2" size={15} color="#D9705A" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text className="text-textFaint text-[11px] font-semibold mb-2 tracking-wide">YENİ ÖLÇÜM EKLE</Text>
          <View className="bg-surface border border-border rounded-card p-3.5 mb-6">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="isim (örn. kol çevresi)"
              placeholderTextColor="#5C5A50"
              className="text-text text-sm bg-bg rounded-lg px-3 py-2.5 mb-2.5"
            />
            <TextInput
              value={unit}
              onChangeText={setUnit}
              placeholder="birim (örn. cm)"
              placeholderTextColor="#5C5A50"
              className="text-text text-sm bg-bg rounded-lg px-3 py-2.5 mb-2.5"
            />

            <View className="flex-row gap-2 mb-3">
              <Pressable
                onPress={() => setDirection("decrease_is_good")}
                className={`flex-1 py-2 rounded-lg items-center ${
                  direction === "decrease_is_good" ? "bg-accent" : "bg-bg border border-border"
                }`}
              >
                <Text className={`text-xs font-semibold ${direction === "decrease_is_good" ? "text-bg" : "text-textMuted"}`}>
                  azalması iyi
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDirection("increase_is_good")}
                className={`flex-1 py-2 rounded-lg items-center ${
                  direction === "increase_is_good" ? "bg-accent" : "bg-bg border border-border"
                }`}
              >
                <Text className={`text-xs font-semibold ${direction === "increase_is_good" ? "text-bg" : "text-textMuted"}`}>
                  artması iyi
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleAdd}
              disabled={addMutation.isPending}
              className="bg-accent rounded-lg py-2.5 items-center"
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
    </View>
  );
}
