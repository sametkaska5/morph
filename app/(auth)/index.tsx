import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Redirect } from "expo-router";
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
        <Text className="text-text text-2xl font-semibold mb-1">
          {mode === "login" ? "Tekrar hoş geldin" : "Hesap oluştur"}
        </Text>
        <Text className="text-textMuted text-sm mb-8">
          {mode === "login" ? "Anılarına devam et." : "Anılarını kaydetmeye başla."}
        </Text>

        <Text className="text-textMuted text-xs mb-1.5">E-posta</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="sen@ornek.com"
          placeholderTextColor="#5C5A50"
          className="bg-surface border border-border rounded-card px-4 py-3.5 text-text mb-4"
        />

        <Text className="text-textMuted text-xs mb-1.5">Şifre</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#5C5A50"
          className="bg-surface border border-border rounded-card px-4 py-3.5 text-text mb-2"
        />

        {errorMsg ? <Text className="text-danger text-xs mb-2">{errorMsg}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          className="bg-accent rounded-card py-4 items-center mt-4"
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
          className="mt-5 items-center"
        >
          <Text className="text-textMuted text-xs">
            {mode === "login" ? "Hesabın yok mu? " : "Zaten hesabın var mı? "}
            <Text className="text-accent font-medium">
              {mode === "login" ? "Kayıt ol" : "Giriş yap"}
            </Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
