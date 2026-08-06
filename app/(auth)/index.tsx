import { useState } from "react";
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TextInput } from "@/components/Typography";
import Feather from "@expo/vector-icons/Feather";
import { Redirect, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authErrorMessage, isInvalidCredentials } from "@/lib/errors";
import { checkAccountExists } from "@/lib/accountLookup";
import { captureError } from "@/lib/monitoring";

/** Üstteki Giriş / Kayıt sekmesi. Seçili olan dolu accent, diğeri boş. */
function ModeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} sekmesi`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}
      className={`items-center rounded-button py-3 ${active ? "bg-accent" : ""}`}
    >
      <Text className={`text-base font-semibold ${active ? "text-bg" : "text-textMuted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AuthScreen() {
  const { session, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Giriş "e-posta veya şifre hatalı" ile döndü mü — çıkış yollarını göstermek için. */
  const [showAccountHint, setShowAccountHint] = useState(false);
  /** Hata değil, yönlendirme bilgisi (örn. kayıt kipine alındın). */
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!authLoading && session) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSubmit() {
    setErrorMsg(null);
    setShowAccountHint(false);
    setInfoMsg(null);

    // Telefon klavyeleri otomatik tamamlamadan sonra sona boşluk ekliyor,
    // kopyala-yapıştır da öyle. Boşluklu e-posta Supabase'de BAŞKA bir kimlik:
    // kullanıcı doğru adresi ve şifreyi yazdığı hâlde "e-posta veya şifre
    // hatalı" alıyor ve neyin yanlış olduğunu anlaması imkânsız oluyor.
    // Şifre BİLEREK trim edilmiyor — baştaki/sondaki boşluk şifrenin parçası olabilir.
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setErrorMsg("E-posta ve şifre gerekli.");
      return;
    }

    setLoading(true);

    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        : await supabase.auth.signUp({ email: cleanEmail, password });

    setLoading(false);

    if (error) {
      // Kullanıcı anlaşılır Türkçe metni görür; teknik ayrıntı Sentry'ye gider.
      captureError(error, { where: mode === "login" ? "auth.signIn" : "auth.signUp" });

      // "Geçersiz kimlik" hatası iki durumu birden kapsıyor: hesap yok, ya da
      // şifre yanlış. Supabase hangisi olduğunu söylemediği için kendi
      // kontrolümüzü soruyoruz (bkz. lib/accountLookup.ts) — kullanıcının
      // "e-postamı mı yanlış yazdım, şifremi mi" diye takılmasını engelliyor.
      if (mode === "login" && isInvalidCredentials(error)) {
        const found = await checkAccountExists(cleanEmail);
        if (found === "missing") {
          // Kullanıcıyı bir bağlantıya tıklamaya bırakmıyoruz: hesabı olmadığı
          // KESİN olduğuna göre doğrudan kayıt kipine alıyoruz. E-posta ve şifre
          // yazdıkları yerde duruyor, tek yapması gereken "Kayıt ol"a basmak.
          setMode("signup");
          setInfoMsg("Bu e-postayla kayıtlı bir hesap yok — seni kayıt ekranına aldık.");
          setShowAccountHint(false);
          return;
        }
        if (found === "exists") {
          setErrorMsg("Şifre hatalı. Şifreni unuttuysan sıfırlayabilirsin.");
          setShowAccountHint(false);
          return;
        }
        // "unknown": kontrol yapılamadı (ağ hatası ya da fonksiyon henüz
        // migrate edilmemiş). Hangisi olduğunu UYDURMUYORUZ — genel mesajı
        // gösterip iki çıkış yolunu da sunuyoruz. Kısayolun asıl yeri burası.
        setErrorMsg(authErrorMessage(error));
        setShowAccountHint(true);
        return;
      }

      setErrorMsg(authErrorMessage(error));
      setShowAccountHint(false);
    }
    // Başarılıysa useAuth hook'u session değişikliğini otomatik yakalayıp yönlendirir
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg"
    >
      <View className="flex-1 justify-center px-6">
        {/* Hangi kipte olunduğu ekranın en üstünde, HER ZAMAN görünür.
            Eskiden tek ayırt edici şey başlık ve buton metniydi; ikisi de
            ekranın farklı yerlerinde kaldığı için iki sayfa birbirine
            karışıyordu. Seçili sekme dolu accent, diğeri boş. */}
        <View className="flex-row bg-surface border border-border rounded-button p-1 mb-8">
          <ModeTab
            label="Giriş"
            active={mode === "login"}
            onPress={() => {
              setMode("login");
              setErrorMsg(null);
              setInfoMsg(null);
              setShowAccountHint(false);
            }}
          />
          <ModeTab
            label="Kayıt"
            active={mode === "signup"}
            onPress={() => {
              setMode("signup");
              setErrorMsg(null);
              setInfoMsg(null);
              setShowAccountHint(false);
            }}
          />
        </View>

        <Text className="text-text text-3xl font-bold mb-1">
          {mode === "login" ? "Tekrar hoş geldin" : "Hesap oluştur"}
        </Text>
        <Text className="text-textMuted text-base mb-8">
          {mode === "login" ? "Anılarına devam et." : "Anılarını kaydetmeye başla."}
        </Text>

        {infoMsg ? (
          <View className="bg-accentSoft border border-accent rounded-button px-4 py-3 mb-4 flex-row items-start gap-3">
            <Feather name="info" size={15} color="#8CE05A" style={{ marginTop: 1 }} />
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
          placeholderTextColor="#8B8A82"
          accessibilityLabel="E-posta"
          style={{ height: 52, textAlignVertical: "center" }}
          className="bg-surface border border-border rounded-button px-4 text-text text-base mb-4"
        />

        <Text className="text-textMuted text-sm mb-2">
          {mode === "login" ? "Şifre" : "Şifre belirle (en az 6 karakter)"}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#8B8A82"
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

        {errorMsg ? (
          <View className="mb-2">
            <Text className="text-danger text-base" accessibilityRole="alert">
              {errorMsg}
            </Text>
            {/* Giriş "geçersiz kimlik" ile döndüğünde hesabın olmaması da,
                şifrenin yanlış olması da aynı hatayı üretiyor — Supabase
                hangisi olduğunu BİLEREK söylemiyor (aksi halde bu ekran
                "bu e-posta kayıtlı mı" taraması için kullanılabilirdi).
                Hangisi olduğunu uyduramayacağımıza göre, kullanıcıyı iki
                çıkış yoluna da tek dokunuşla götürüyoruz. */}
            {showAccountHint ? (
              <View className="mt-2">
                <Text className="text-textMuted text-sm leading-5">
                  E-postayı yanlış yazmış olabilirsin — kontrol et, ya da bu adresle yeni bir hesap
                  oluştur.
                </Text>
                <Pressable
                  onPress={() => {
                    // E-posta korunuyor: kullanıcı yeniden yazmak zorunda kalmasın.
                    setMode("signup");
                    setErrorMsg(null);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Bu e-postayla hesap oluştur"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  className="mt-2 py-1"
                >
                  <Text className="text-accent text-sm font-medium">
                    Bu e-postayla hesap oluştur
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

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
              {mode === "login" ? "Giriş yap" : "Hesabı oluştur"}
            </Text>
          )}
        </Pressable>

        {/* Alttaki kip bağlantısı kaldırıldı: üstteki sekmeler zaten hem
            geçişi sağlıyor hem hangi kipte olunduğunu sürekli gösteriyor.
            İkisi bir arada olunca aynı iş için iki ayrı yer oluyordu. */}

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
