import { theme } from "@/lib/theme";
import { useState, useEffect } from "react";
import { View, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text, TextInput } from "@/components/Typography";
import Feather from "@expo/vector-icons/Feather";
import { Redirect, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authErrorMessage } from "@/lib/errors";
import { captureError } from "@/lib/monitoring";
import { useScreenInsets } from "@/lib/useScreenInsets";

export default function AuthScreen() {
  const screen = useScreenInsets();
  const { session, loading: authLoading } = useAuth();
  
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  
  // Eğer doluysa, e-posta gönderilmiş ve doğrulama kodu bekleniyor demektir
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  // Geri sayım için effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  if (!authLoading && session) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSubmit() {
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim();

    // Basit e-posta doğrulaması
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMsg("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }

    setLoading(true);

    // signInWithOtp, hem giriş hem de yeni kayıtlar için çalışır.
    const { error } = await supabase.auth.signInWithOtp({ 
      email: cleanEmail,
      options: {
        shouldCreateUser: true // (Zaten varsayılan budur) Yeni ise hesap oluşturur
      }
    });

    setLoading(false);

    if (error) {
      captureError(error, { where: "auth.signInWithOtp" });
      setErrorMsg(authErrorMessage(error));
      return;
    }

    // Hata yoksa e-posta başarıyla gönderilmiş demektir, kod ekranına geçiyoruz.
    setVerifyEmail(cleanEmail);
    setInfoMsg(null);
  }

  async function handleVerify() {
    setErrorMsg(null);
    setInfoMsg(null);
    
    const cleanCode = code.trim();
    if (!cleanCode || !verifyEmail) {
      setErrorMsg("Doğrulama kodu gerekli.");
      return;
    }

    setLoading(true);
    
    // OTP girişleri için type "email" olmalıdır.
    const { error } = await supabase.auth.verifyOtp({
      email: verifyEmail,
      token: cleanCode,
      type: "email",
    });
    
    setLoading(false);

    if (error) {
      setErrorMsg(authErrorMessage(error));
      captureError(error, { where: "auth.verifyOtpEmail" });
      return;
    }
    // Başarılıysa session oluşacak ve useAuth otomatik yönlendirecek.
  }

  async function handleResendCode() {
    if (!verifyEmail || resendTimer > 0) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: verifyEmail });
    
    setLoading(false);

    if (otpError) {
      setErrorMsg(authErrorMessage(otpError));
      captureError(otpError, { where: "auth.resendOtpEmail" });
      return;
    }
    setInfoMsg("Yeni bir kod gönderdik.");
    setResendTimer(60); // 60 saniyelik limit başlat
  }

  /* ---------------- E-POSTA DOĞRULAMA ADIMI ---------------- */

  if (verifyEmail) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-bg"
        style={{ paddingTop: screen.insets.top, paddingBottom: screen.insets.bottom }}
      >
        <View className="flex-1 px-6">
          <View className="flex-1 justify-center">
            <View className="w-14 h-14 rounded-full bg-accentSoft border border-accent items-center justify-center mb-5">
              <Feather name="mail" size={24} color={theme.colors.accent} />
            </View>

            <Text className="text-text text-3xl font-bold mb-1">E-postanı kontrol et</Text>
            <Text className="text-textMuted text-base mb-8 leading-6">
              <Text className="text-text font-semibold">{verifyEmail}</Text> adresine 6 haneli bir
              kod gönderdik. Giriş yapmak için kodu gir.
            </Text>

            {infoMsg ? (
              <View className="bg-accentSoft border border-accent rounded-button px-4 py-3 mb-4 flex-row items-start gap-3">
                <Feather
                  name="info"
                  size={15}
                  color={theme.colors.accent}
                  style={{ marginTop: 1 }}
                />
                <Text className="text-text text-sm flex-1 leading-5" accessibilityRole="alert">
                  {infoMsg}
                </Text>
              </View>
            ) : null}

            <Text className="text-textMuted text-sm mb-2">Doğrulama kodu</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={theme.colors.textFaint}
              accessibilityLabel="Doğrulama kodu"
              maxLength={10}
              style={{ height: 52, textAlignVertical: "center" }}
              className="bg-surface border border-border rounded-button px-4 text-text text-base mb-2 tracking-[4px]"
            />

            {errorMsg ? (
              <Text className="text-danger text-base mb-2" accessibilityRole="alert">
                {errorMsg}
              </Text>
            ) : null}

            <PressableFade
              onPress={handleVerify}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Kodu doğrula"
              dim={0.85}
              baseOpacity={loading ? 0.7 : 1}
              className="bg-accent rounded-button py-4 items-center mt-4"
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.bg} />
              ) : (
                <Text className="text-bg text-base font-semibold">Giriş Yap</Text>
              )}
            </PressableFade>

            <PressableFade
              onPress={handleResendCode}
              disabled={loading || resendTimer > 0}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Kodu tekrar gönder"
              dim={0.7}
              className="items-center py-3 mt-2"
            >
              <Text className={`text-sm font-medium ${resendTimer > 0 ? "text-textFaint" : "text-accent"}`}>
                {resendTimer > 0 ? `Tekrar göndermek için ${resendTimer}s` : "Kodu tekrar gönder"}
              </Text>
            </PressableFade>
          </View>

          <View className="border-t border-border pt-4 pb-6">
            <PressableFade
              onPress={() => {
                setVerifyEmail(null);
                setCode("");
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Farklı e-posta ile dene"
              dim={0.7}
              className="items-center py-2"
            >
              <Text className="text-textMuted text-sm">
                Yanlış adres mi? <Text className="text-accent font-semibold">Geri dön</Text>
              </Text>
            </PressableFade>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ---------------- E-POSTA İSTEYEN ANA EKRAN ---------------- */

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg"
      style={{ paddingTop: screen.insets.top, paddingBottom: screen.insets.bottom }}
    >
      <View className="flex-1 px-6">
        <View className="flex-1 justify-center">
          <Text className="text-text text-3xl font-bold mb-1">
            Giriş Yap / Kayıt Ol
          </Text>
          <Text className="text-textMuted text-base mb-8">
            Devam etmek için e-posta adresini gir. Sana şifre yerine geçecek tek seferlik bir kod göndereceğiz.
          </Text>

          {infoMsg ? (
            <View className="bg-accentSoft border border-accent rounded-button px-4 py-3 mb-4 flex-row items-start gap-3">
              <Feather name="info" size={15} color={theme.colors.accent} style={{ marginTop: 1 }} />
              <Text className="text-text text-sm flex-1 leading-5" accessibilityRole="alert">
                {infoMsg}
              </Text>
            </View>
          ) : null}

          <Text className="text-textMuted text-sm mb-2">E-posta</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="sen@ornek.com"
            placeholderTextColor={theme.colors.textFaint}
            accessibilityLabel="E-posta"
            style={{ height: 52, textAlignVertical: "center" }}
            className="bg-surface border border-border rounded-button px-4 text-text text-base mb-2"
          />

          {errorMsg ? (
            <View className="mb-2 mt-2">
              <Text className="text-danger text-base" accessibilityRole="alert">
                {errorMsg}
              </Text>
            </View>
          ) : null}

          <PressableFade
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Devam Et"
            accessibilityState={{ disabled: loading, busy: loading }}
            dim={0.85}
            baseOpacity={loading ? 0.7 : 1}
            className="bg-accent rounded-button py-4 items-center mt-4"
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <Text className="text-bg text-base font-semibold">
                Devam Et
              </Text>
            )}
          </PressableFade>
          
          <Text className="text-textFaint text-xs text-center mt-5 leading-5">
            Devam ederek{" "}
            <Text className="text-accent" onPress={() => router.push("/terms")}>
              Kullanım Şartları
            </Text>{" "}
            ve{" "}
            <Text className="text-accent" onPress={() => router.push("/privacy-policy")}>
              Gizlilik Politikası
            </Text>
            'nı kabul etmiş olursun.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
