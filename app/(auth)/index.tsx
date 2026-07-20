import { useState } from "react";
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TextInput } from "@/components/Typography";
import { Redirect, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";

export default function AuthScreen() {
  const { session, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!authLoading && session) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSubmit() {
    setErrorMsg(null);

    if (!email || !password) {
      setErrorMsg("E-posta ve şifre gerekli.");
      return;
    }

    setLoading(true);

    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    }
    // Başarılıysa useAuth hook'u session değişikliğini otomatik yakalayıp yönlendirir
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg"
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-text text-3xl font-bold mb-1">
          {mode === "login" ? "Tekrar hoş geldin" : "Hesap oluştur"}
        </Text>
        <Text className="text-textMuted text-base mb-8">
          {mode === "login" ? "Anılarına devam et." : "Anılarını kaydetmeye başla."}
        </Text>

        <Text className="text-textMuted text-sm mb-2">E-posta</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="sen@ornek.com"
          placeholderTextColor="#5C5A50"
          accessibilityLabel="E-posta"
          style={{ height: 52, textAlignVertical: "center" }}
          className="bg-surface border border-border rounded-button px-4 text-text text-base mb-4"
        />

        <Text className="text-textMuted text-sm mb-2">Şifre</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#5C5A50"
          accessibilityLabel="Şifre"
          style={{ height: 52, textAlignVertical: "center" }}
          className="bg-surface border border-border rounded-button px-4 text-text text-base mb-2"
        />

        {mode === "login" ? (
          <Pressable
            onPress={() => router.push("/forgot-password")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="items-end mb-2 py-1"
          >
            <Text className="text-accent text-sm font-medium">Şifremi unuttum</Text>
          </Pressable>
        ) : null}

        {errorMsg ? <Text className="text-danger text-base mb-2">{errorMsg}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : loading ? 0.7 : 1 })}
          className="bg-accent rounded-button py-4 items-center mt-4"
        >
          {loading ? (
            <ActivityIndicator color="#0B0D0A" />
          ) : (
            <Text className="text-bg text-base font-semibold">
              {mode === "login" ? "Giriş yap" : "Kayıt ol"}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => setMode(mode === "login" ? "signup" : "login")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="mt-5 items-center py-2"
        >
          <Text className="text-textMuted text-sm">
            {mode === "login" ? "Hesabın yok mu? " : "Zaten hesabın var mı? "}
            <Text className="text-accent font-medium">
              {mode === "login" ? "Kayıt ol" : "Giriş yap"}
            </Text>
          </Text>
        </Pressable>

        {mode === "signup" ? (
          <Text className="text-textFaint text-xs text-center mt-5 leading-5">
            Kayıt olarak{" "}
            <Text className="text-accent" onPress={() => router.push("/terms")}>
              Kullanım Şartları
            </Text>{" "}
            ve{" "}
            <Text className="text-accent" onPress={() => router.push("/privacy-policy")}>
              Gizlilik Politikası
            </Text>
            'nı kabul etmiş olursun.
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
