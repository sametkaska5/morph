import { useState } from "react";
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TextInput } from "@/components/Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authErrorMessage, isInvalidCredentials } from "@/lib/errors";
import { captureError } from "@/lib/monitoring";
import { showAlert } from "@/lib/appAlert";

/** Kayıt ekranındaki kuralla aynı — iki yerde farklı olursa kullanıcı çelişki görür. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Giriş yapmış kullanıcının şifresini değiştirmesi.
 *
 * `forgot-password.tsx`'ten ayrı: orada kullanıcı şifresini BİLMİYOR ve kimliğini
 * e-postasına gelen kodla kanıtlıyor. Burada zaten oturum açık, kanıt olarak
 * mevcut şifresi isteniyor.
 *
 * Mevcut şifre neden şart: Supabase'in `updateUser({ password })` çağrısı eski
 * şifreyi SORMUYOR, açık oturum yeterli. Yani kilidi açık bir telefonu eline
 * geçiren biri şifreyi değiştirip hesabın asıl sahibini kilitleyebilirdi.
 * Değiştirmeden önce `signInWithPassword` ile mevcut şifreyi doğruluyoruz.
 * Bu çağrı aynı kullanıcı için yeni bir oturum açıyor (SIGNED_OUT tetiklemiyor),
 * dolayısıyla önbellek temizlenmiyor ve kullanıcı ekranda kalmaya devam ediyor.
 */
export default function ChangePasswordScreen() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMsg(null);

    const email = user?.email;
    if (!email) {
      // Oturum var ama e-posta yok: yeniden kimlik doğrulaması yapılamaz.
      setErrorMsg("Oturum bilgin okunamadı. Çıkış yapıp tekrar giriş yapar mısın?");
      return;
    }

    // Şifreler BİLEREK trim edilmiyor — baştaki/sondaki boşluk şifrenin parçası
    // olabilir (bkz. (auth)/index.tsx'teki aynı gerekçe).
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg("Üç alanı da doldurman gerekiyor.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`Yeni şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
      return;
    }
    if (newPassword === currentPassword) {
      // Supabase de reddediyor ama ağa çıkmadan söylemek hem daha hızlı hem daha net.
      setErrorMsg("Yeni şifre eskisinden farklı olmalı.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Yeni şifreler birbiriyle eşleşmiyor.");
      return;
    }

    setLoading(true);

    // 1) Kimliği mevcut şifreyle doğrula.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      setLoading(false);
      // Genel eşleme burada yanıltıcı olurdu: "E-posta veya şifre hatalı"
      // diyor ama bu ekranda e-posta zaten sorgulanmıyor, kullanıcı boşuna
      // e-postasını kontrol etmeye kalkardı.
      setErrorMsg(
        isInvalidCredentials(signInError)
          ? "Mevcut şifren hatalı."
          : authErrorMessage(signInError)
      );
      captureError(signInError, { where: "password.reauth" });
      return;
    }

    // 2) Şifreyi değiştir.
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setErrorMsg(authErrorMessage(updateError));
      captureError(updateError, { where: "password.update" });
      return;
    }

    // Ekranı kapatmadan önce onay: şifre değişikliği geri bildirimsiz bırakılırsa
    // kullanıcı gerçekten değişip değişmediğinden emin olamaz.
    showAlert("Şifren değişti", "Bir dahaki girişinde yeni şifreni kullan.");
    router.back();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg"
    >
      <View className="flex-1 px-4 pt-14">
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
          <Text className="text-text text-xl font-bold">Şifre değiştir</Text>
        </View>

        <Text className="text-textMuted text-base mb-8 leading-6">
          Güvenliğin için önce mevcut şifreni doğrulamamız gerekiyor.
        </Text>

        <Text className="text-textMuted text-sm mb-2">Mevcut şifre</Text>
        <TextInput
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="••••••••"
          placeholderTextColor="#8B8A82"
          accessibilityLabel="Mevcut şifre"
          style={{ height: 52, textAlignVertical: "center" }}
          className="bg-surface border border-border rounded-button px-4 text-text text-base mb-4"
        />

        <Text className="text-textMuted text-sm mb-2">
          Yeni şifre (en az {MIN_PASSWORD_LENGTH} karakter)
        </Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="••••••••"
          placeholderTextColor="#8B8A82"
          accessibilityLabel="Yeni şifre"
          style={{ height: 52, textAlignVertical: "center" }}
          className="bg-surface border border-border rounded-button px-4 text-text text-base mb-4"
        />

        <Text className="text-textMuted text-sm mb-2">Yeni şifre (tekrar)</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="••••••••"
          placeholderTextColor="#8B8A82"
          accessibilityLabel="Yeni şifre tekrar"
          style={{ height: 52, textAlignVertical: "center" }}
          className="bg-surface border border-border rounded-button px-4 text-text text-base mb-2"
        />

        {errorMsg ? (
          <Text className="text-danger text-base mb-2" accessibilityRole="alert">
            {errorMsg}
          </Text>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Şifreyi güncelle"
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : loading ? 0.7 : 1 })}
          className="bg-accent rounded-button py-4 items-center mt-4"
        >
          {loading ? (
            <ActivityIndicator color="#0B0D0A" />
          ) : (
            <Text className="text-bg text-base font-semibold">Şifreyi güncelle</Text>
          )}
        </Pressable>

        {/* Şifresini HATIRLAMAYAN kullanıcı bu ekranda ilerleyemez — mevcut
            şifre zorunlu. Onu çıkmazda bırakmamak için e-posta yolunu burada
            da açık tutuyoruz. */}
        <Pressable
          onPress={() => router.replace("/forgot-password")}
          disabled={loading}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Mevcut şifremi hatırlamıyorum"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="items-center py-3 mt-2"
        >
          <Text className="text-accent text-sm font-medium">Mevcut şifremi hatırlamıyorum</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
