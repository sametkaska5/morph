import { useRef, useState } from "react";
import {
  View,
  Pressable,
  ActivityIndicator,
  ScrollView,
  type TextInput as RNTextInput,
} from "react-native";
import { showAlert } from "@/lib/appAlert";
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
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useScreenInsets } from "@/lib/useScreenInsets";

const ACCENT = "#8CE05A";

export default function MeasurementSettingsScreen() {
  const screen = useScreenInsets();
  const { user } = useAuth();
  const { data: types, isLoading, error, refetch } = useMeasurementTypes(user?.id);
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
      showAlert("Eksik bilgi", "İsim ve birim alanları boş bırakılamaz.");
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

  // Silme onayı native Alert'ten temalı kutuya taşındı: Alert sistemin kendi
  // penceresi, koyu temanın ortasında beyaz bir kutu olarak beliriyordu.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);

  function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    deleteMutation.mutate(target.id, {
      onError: (err) => alertError("Silinemedi", err, "measurements.delete"),
    });
  }

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      className="flex-1 bg-bg px-4"
      style={{ paddingTop: screen.top }}
      contentContainerStyle={{ paddingBottom: screen.bottom + keyboardPadding }}
      keyboardShouldPersistTaps="handled"
    >
      <ConfirmDialog
        visible={pendingDelete !== null}
        icon="trash-2"
        danger
        title="Ölçümü sil?"
        message={`"${pendingDelete?.label ?? ""}" ölçüm tipi silinecek ve geçmiş değerleri de kaybolacak. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
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
      ) : error ? (
        // Liste çekilemediğinde ekran bomboş "yeni ölçüm ekle" formuna
        // düşüyordu: kullanıcı ölçümlerinin silindiğini sanıp yeniden ekler,
        // istek geri gelince mükerrer kayıtla karşılaşırdı.
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">SİSTEM ÖLÇÜMLERİ</Text>
          <View className="bg-surface border border-border rounded-card overflow-hidden mb-5">
            {defaults.map((t, i) => (
              <View
                key={t.id}
                // İsim ve birim ayrı düğümler: "Kilo" ve "kg" ilişkisiz iki
                // parça olarak okunuyordu. Tek duyuru hâline getiriyoruz.
                accessible
                accessibilityLabel={`${t.name}, ${t.unit}`}
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
                  {/* Sil düğmesi ayrı bir odak hedefi olarak kalmalı, o yüzden
                      SATIRIN tamamını değil yalnızca metin kısmını grupluyoruz.
                      Birim de bu etikete giriyor ve kendi düğümü gizleniyor —
                      aksi halde aynı bilgi iki kez okunurdu. */}
                  <View
                    accessible
                    accessibilityLabel={`${t.name}, ${t.unit}, ${
                      t.target_direction === "decrease_is_good" ? "azalması iyi" : "artması iyi"
                    }`}
                  >
                    <Text className="text-text text-base capitalize">{t.name}</Text>
                    <Text className="text-textFaint text-sm mt-0.5">
                      {t.target_direction === "decrease_is_good" ? "azalması iyi" : "artması iyi"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <Text
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      className="text-textMuted text-sm"
                    >
                      {t.unit}
                    </Text>
                    <Pressable
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.name} ölçümünü sil`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                      onPress={() => setPendingDelete({ id: t.id, label: t.name })}
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
            {/* Etiket placeholder'a bırakılmıyor: yazmaya başlanınca placeholder
                kayboluyor ve alanın erişilebilir adı da onunla gidiyor. */}
            <TextInput
              ref={nameRef}
              value={name}
              onChangeText={setName}
              placeholder="İsim (örn. Kol Çevresi)"
              placeholderTextColor="#8B8A82"
              accessibilityLabel="Ölçüm ismi"
              onFocus={() => revealField(nameRef.current)}
              className="text-text text-base bg-bg rounded-lg px-3 py-3 mb-3"
            />
            <TextInput
              ref={unitRef}
              value={unit}
              onChangeText={setUnit}
              placeholder="Birim (örn. cm)"
              placeholderTextColor="#8B8A82"
              accessibilityLabel="Ölçüm birimi"
              onFocus={() => revealField(unitRef.current)}
              className="text-text text-base bg-bg rounded-lg px-3 py-3 mb-3"
            />

            {/* İki seçenekli bir radyo grubu. Hangisinin SEÇİLİ olduğu yalnızca
                renkle anlatılıyordu — ekran okuyucu ikisini de aynı okuyor,
                kullanıcı hangisinin etkin olduğunu anlayamıyordu. */}
            <View accessibilityRole="radiogroup" className="flex-row gap-2 mb-3">
              <Pressable
                onPress={() => setDirection("decrease_is_good")}
                accessibilityRole="radio"
                accessibilityState={{ selected: direction === "decrease_is_good" }}
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
                accessibilityRole="radio"
                accessibilityState={{ selected: direction === "increase_is_good" }}
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

            {/* Etiket sabit: eklerken metin ActivityIndicator'a dönüşüyor ve
                düğmenin erişilebilir adı kayboluyordu. */}
            <Pressable
              onPress={handleAdd}
              disabled={addMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Ölçüm ekle"
              accessibilityState={{ disabled: addMutation.isPending, busy: addMutation.isPending }}
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
