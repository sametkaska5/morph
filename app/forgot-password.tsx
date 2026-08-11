import { useState } from "react";
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text, TextInput } from "@/components/Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/errors";
import { captureError } from "@/lib/monitoring";
import { useScreenInsets } from "@/lib/useScreenInsets";

export default function ForgotPasswordScreen() {
  const screen = useScreenInsets();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  async function handleSendCode() {
    setErrorMsg(null);
    // Boşluklu e-posta Supabase'de başka bir kimlik — kod hiç gelmez ve
    // kullanıcı neden gelmediğini anlayamaz (bkz. (auth)/index.tsx).
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg("E-posta gerekli.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    setLoading(false);
    if (error) {
      setErrorMsg(authErrorMessage(error));
      captureError(error, { where: "auth.resetPasswordForEmail" });
      return;
    }
    setInfoMsg(`${cleanEmail} adresine bir doğrulama kodu gönderdik.`);
    setStep("reset");
  }

  async function handleResetPassword() {
    setErrorMsg(null);
    // Kod çoğunlukla e-postadan kopyalanıyor ve yanında boşluk geliyor;
    // boşluklu kod "Kod hatalı" hatası veriyordu.
    const cleanCode = code.trim();
    const cleanEmail = email.trim();
    if (!cleanCode || !password) {
      setErrorMsg("Kod ve yeni şifre gerekli.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Şifre en az 6 karakter olmalı.");
      return;
    }
    setLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanCode,
      type: "recovery",
    });
    if (verifyError) {
      setLoading(false);
      setErrorMsg(authErrorMessage(verifyError));
      captureError(verifyError, { where: "auth.verifyOtp" });
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setErrorMsg(authErrorMessage(updateError));
      captureError(updateError, { where: "auth.updateUser" });
      return;
    }

    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg"
      style={{ paddingBottom: screen.insets.bottom }}
    >
      {/* Konum sarmalayıcı View'de, düğmenin kendi style'ında DEĞİL: bu projede
          fonksiyon-form style'a konan yerleşim özellikleri üç ayrı yerde
          sessizce uygulanmadı. Basma sönümü artık PressableFade'in işi, düğme
          hiç style almıyor. Üst konum da sabit 56px değil güvenli alandan. */}
      <View style={{ position: "absolute", top: screen.top, left: 24, zIndex: 10 }}>
        <PressableFade
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          dim={0.7}
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </PressableFade>
      </View>

      <View className="flex-1 justify-center px-6">
        <Text className="text-text text-3xl font-bold mb-1">Şifreni sıfırla</Text>
        <Text className="text-textMuted text-base mb-8">
          {step === "request"
            ? "Kayıtlı e-posta adresini gir, sana bir doğrulama kodu gönderelim."
            : "E-postana gelen kodu ve yeni şifreni gir."}
        </Text>

        <Text className="text-textMuted text-sm mb-2">E-posta</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          editable={step === "request"}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="sen@ornek.com"
          placeholderTextColor="#8B8A82"
          accessibilityLabel="E-posta"
          style={{ height: 52, textAlignVertical: "center" }}
          className={`bg-surface border border-border rounded-button px-4 text-text text-base mb-4 ${
            step !== "request" ? "opacity-60" : ""
          }`}
        />

        {step === "reset" ? (
          <>
            <Text className="text-textMuted text-sm mb-2">Doğrulama kodu</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="8 haneli kod"
              placeholderTextColor="#8B8A82"
              accessibilityLabel="Doğrulama kodu"
              style={{ height: 52, textAlignVertical: "center" }}
              className="bg-surface border border-border rounded-button px-4 text-text text-base mb-4"
            />

            <Text className="text-textMuted text-sm mb-2">Yeni şifre</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#8B8A82"
              accessibilityLabel="Yeni şifre"
              style={{ height: 52, textAlignVertical: "center" }}
              className="bg-surface border border-border rounded-button px-4 text-text text-base mb-2"
            />
          </>
        ) : null}

        {infoMsg && step === "reset" ? <Text className="text-accent text-sm mb-2">{infoMsg}</Text> : null}
        {errorMsg ? <Text className="text-danger text-base mb-2">{errorMsg}</Text> : null}

        {/* Etiket sabit: yüklenirken metin ActivityIndicator'a dönüşüyor. */}
        <Pressable
          onPress={step === "request" ? handleSendCode : handleResetPassword}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={step === "request" ? "Kod gönder" : "Şifreyi güncelle"}
          accessibilityState={{ disabled: loading, busy: loading }}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : loading ? 0.7 : 1 })}
          className="bg-accent rounded-button py-4 items-center mt-4"
        >
          {loading ? (
            <ActivityIndicator color="#0B0D0A" />
          ) : (
            <Text className="text-bg text-base font-semibold">
              {step === "request" ? "Kod gönder" : "Şifreyi güncelle"}
            </Text>
          )}
        </Pressable>

        {step === "reset" ? (
          <Pressable
            onPress={handleSendCode}
            disabled={loading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="mt-5 items-center py-2"
          >
            <Text className="text-textMuted text-sm">Kodu tekrar gönder</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
