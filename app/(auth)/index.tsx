import { theme } from "@/lib/theme";
import { useState, useEffect } from "react";
import { View, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Image } from "expo-image";
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
  const [emailFocused, setEmailFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Eğer doluysa, e-posta gönderilmiş ve doğrulama kodu bekleniyor demektir
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeFocused, setCodeFocused] = useState(false);
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
        shouldCreateUser: true, // Yeni ise hesap oluşturur
      },
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

    const { error } = await supabase.auth.verifyOtp({
      email: verifyEmail,
      token: cleanCode,
      type: "email",
    });

    setLoading(false);

    if (error) {
      captureError(error, { where: "auth.verifyOtp" });
      setErrorMsg(authErrorMessage(error));
      return;
    }
    // Başarılı giriş layout'taki auth listener tarafından algılanıp yönlendirilecek.
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
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        enableOnAndroid={true}
        keyboardOpeningTime={0}
        extraScrollHeight={Platform.OS === "ios" ? 40 : 20}
        className="flex-1 bg-bg relative"
      >
        <Image 
          source={{ uri: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80" }} 
          style={[StyleSheet.absoluteFill, { opacity: 0.10 }]} 
          contentFit="cover" 
        />
        <View className="flex-1 px-6 pb-8" style={{ paddingTop: screen.insets.top + 40, paddingBottom: screen.insets.bottom + 20 }}>
          
          <View className="items-center mb-auto mt-4">
            <Image source={require('@/assets/images/icon.png')} style={{ width: 64, height: 64, borderRadius: 18, overflow: 'hidden' }} contentFit="cover" />
            <Text className="text-white text-[32px] font-bold mt-2 tracking-widest uppercase">MORPH</Text>
          </View>

          <View className="w-full mt-auto">
            <Text className="text-white text-3xl font-bold mb-3">E-postanı kontrol et</Text>
            <Text className="text-textMuted text-sm mb-8 leading-6">
              <Text className="text-white font-medium">{verifyEmail}</Text> adresine 6 haneli bir kod gönderdik. Giriş yapmak için kodu gir.
            </Text>

            {infoMsg ? (
              <View className="bg-accentSoft border border-accent rounded-2xl px-4 py-3 mb-4 flex-row items-start gap-3">
                <Feather name="info" size={15} color={theme.colors.accent} style={{ marginTop: 1 }} />
                <Text className="text-text text-sm flex-1 leading-5" accessibilityRole="alert">
                  {infoMsg}
                </Text>
              </View>
            ) : null}

            <Text className="text-[#666] text-xs font-medium uppercase tracking-wider mb-2">Doğrulama Kodu</Text>
            <View className={`bg-[#1a1a1a] border rounded-[20px] h-14 flex-row items-center px-4 mb-2 ${codeFocused ? "border-accent" : "border-white/20"}`}>
              <Feather name="key" size={20} color={codeFocused ? theme.colors.accent : theme.colors.textFaint} />
              <TextInput
                value={code}
                onChangeText={setCode}
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
                keyboardType="number-pad"
                placeholder="123456"
                placeholderTextColor={theme.colors.textFaint}
                accessibilityLabel="Doğrulama kodu"
                maxLength={10}
                className="flex-1 text-white text-lg ml-3 bg-transparent border-0 tracking-[8px]"
                style={{ height: '100%', outlineStyle: 'none' as any }}
              />
            </View>

            {errorMsg ? (
              <Text className="text-danger text-sm mb-2" accessibilityRole="alert">
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
              className="bg-accent rounded-full h-[52px] flex-row items-center justify-center mt-6 shadow-lg shadow-accent/20"
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.bg} />
              ) : (
                <>
                  <Text className="text-black text-base font-bold mr-2">Giriş Yap</Text>
                  <Feather name="log-in" size={20} color="black" />
                </>
              )}
            </PressableFade>

            <PressableFade
              onPress={handleResendCode}
              disabled={loading || resendTimer > 0}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Kodu tekrar gönder"
              dim={0.7}
              className="items-center py-4 mt-2"
            >
              <Text className={`text-sm font-medium ${resendTimer > 0 ? "text-[#666]" : "text-accent"}`}>
                {resendTimer > 0 ? `Tekrar göndermek için ${resendTimer}s` : "Kodu tekrar gönder"}
              </Text>
            </PressableFade>

            <View className="border-t border-white/5 pt-4 mt-2">
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
                <Text className="text-[#666] text-sm">
                  Yanlış adres mi? <Text className="text-accent font-medium">Geri dön</Text>
                </Text>
              </PressableFade>
            </View>

            <View className="flex-row items-center justify-between mt-8 mb-4">
              <View className="flex-row items-center">
                <View className="w-[2px] h-8 bg-accent mr-3 opacity-80" />
                <Text className="text-[#666] text-[10px] tracking-[0.2em] uppercase leading-4">DAHA İYİ BİR{"\n"}SEN MÜMKÜN.</Text>
              </View>
              <Text className="text-accent text-xs tracking-[0.3em] opacity-80">{"////"}</Text>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    );
  }

  /* ---------------- E-POSTA İSTEYEN ANA EKRAN ---------------- */

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      enableOnAndroid={true}
      keyboardOpeningTime={0}
      extraScrollHeight={Platform.OS === "ios" ? 40 : 20}
      className="flex-1 bg-bg relative"
    >
      <Image 
        source={{ uri: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80" }} 
        style={[StyleSheet.absoluteFill, { opacity: 0.15 }]} 
        contentFit="cover" 
      />
      
      <View className="flex-1 px-6 pb-8" style={{ paddingTop: screen.insets.top + 40, paddingBottom: screen.insets.bottom + 20 }}>
        
        {/* Top Logo */}
        <View className="items-center mb-auto mt-4">
          <Image source={require('@/assets/images/icon.png')} style={{ width: 64, height: 64, borderRadius: 18, overflow: 'hidden' }} contentFit="cover" />
          <Text className="text-white text-[32px] font-bold mt-3 tracking-[0.1em] uppercase">MORPH</Text>
          <Text className="text-textMuted text-[10px] tracking-[0.25em] uppercase mt-2">SEE HOW YOU CHANGE</Text>
        </View>

        {/* Main Content Card Area */}
        <View className="w-full mt-auto">
          <View className="flex-row items-center mb-3">
            <Text className="text-white text-[28px] font-bold">Giriş Yap </Text>
            <Text className="text-[#444] text-[28px] font-light">/ </Text>
            <Text className="text-accent text-[28px] font-bold">Kayıt Ol</Text>
          </View>
          <Text className="text-textMuted text-sm mb-8 leading-6">
            Devam etmek için e-posta adresini gir. Sana şifre yerine geçecek tek seferlik bir kod göndereceğiz.
          </Text>

          {infoMsg ? (
            <View className="bg-accentSoft border border-accent rounded-2xl px-4 py-3 mb-4 flex-row items-start gap-3">
              <Feather name="info" size={15} color={theme.colors.accent} style={{ marginTop: 1 }} />
              <Text className="text-text text-sm flex-1 leading-5" accessibilityRole="alert">
                {infoMsg}
              </Text>
            </View>
          ) : null}

          <Text className="text-[#666] text-[11px] font-semibold uppercase tracking-wider mb-2">E-posta</Text>
          <View className={`border rounded-[20px] h-[56px] flex-row items-center px-4 mb-2 bg-[#1a1a1a] ${emailFocused ? "border-accent" : "border-white/20"}`}>
            <Feather name="mail" size={20} color={emailFocused ? theme.colors.accent : theme.colors.textFaint} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="sen@ornek.com"
              placeholderTextColor={theme.colors.textFaint}
              accessibilityLabel="E-posta"
              className="flex-1 text-white text-base ml-3 bg-transparent border-0"
              style={{ height: '100%', outlineStyle: 'none' as any }}
            />
          </View>

          {errorMsg ? (
            <View className="mb-2 mt-2">
              <Text className="text-danger text-sm" accessibilityRole="alert">
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
            className="bg-accent rounded-full h-[52px] flex-row items-center justify-center mt-6 shadow-lg shadow-accent/20"
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <>
                <Text className="text-black text-base font-bold mr-2">Devam Et</Text>
                <Feather name="arrow-right" size={20} color="black" />
              </>
            )}
          </PressableFade>

          <Text className="text-[#666] text-[11px] mt-6 leading-5">
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

          {/* Decorative Footer */}
          <View className="flex-row items-center justify-between mt-12 mb-2">
            <View className="flex-row items-center">
              <View className="w-[2px] h-8 bg-accent mr-3 opacity-80" />
              <Text className="text-[#666] text-[10px] tracking-[0.2em] uppercase leading-4">DAHA İYİ BİR{"\n"}SEN MÜMKÜN.</Text>
            </View>
            <Text className="text-accent text-xs tracking-[0.3em] opacity-80">{"////"}</Text>
          </View>
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}
