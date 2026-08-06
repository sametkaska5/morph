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
  /**
   * Kayıt yapıldı, e-posta doğrulaması bekleniyor — dolu olduğunda ekran kod
   * adımına geçiyor. E-postanın gerçekten kullanıcıya ait olduğunu ancak
   * adrese gönderilen kodu geri yazabilmesiyle anlayabiliyoruz.
   */
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");

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

    const { data, error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        : await supabase.auth.signUp({ email: cleanEmail, password });

    setLoading(false);

    // Kayıt başarılı ama OTURUM YOK demek: Supabase e-posta doğrulaması
    // bekliyor. Kullanıcıyı kod ekranına alıyoruz — e-postadaki linke
    // tıklatmak onu uygulamadan çıkarır ve mobilde çoğu kişi geri dönmez.
    // Doğrulama kapalıysa `session` doluyor ve bu adım hiç çalışmıyor.
    if (!error && mode === "signup" && !data.session) {
      setVerifyEmail(cleanEmail);
      setInfoMsg(null);
      return;
    }

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

  async function handleVerify() {
    setErrorMsg(null);
    setInfoMsg(null);
    // Kod e-postadan kopyalanıyor ve yanında boşluk geliyor (bkz. forgot-password).
    const cleanCode = code.trim();
    if (!cleanCode || !verifyEmail) {
      setErrorMsg("Doğrulama kodu gerekli.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: verifyEmail,
      token: cleanCode,
      type: "signup",
    });
    setLoading(false);

    if (error) {
      setErrorMsg(authErrorMessage(error));
      captureError(error, { where: "auth.verifySignup" });
      return;
    }
    // Doğrulama başarılıysa oturum açılıyor; useAuth bunu yakalayıp yönlendiriyor.
  }

  async function handleResendCode() {
    if (!verifyEmail) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: verifyEmail });
    setLoading(false);

    if (error) {
      setErrorMsg(authErrorMessage(error));
      captureError(error, { where: "auth.resendSignup" });
      return;
    }
    setInfoMsg("Yeni bir kod gönderdik.");
  }

  /* ---------------- E-POSTA DOĞRULAMA ADIMI ---------------- */

  if (verifyEmail) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-bg"
      >
        <View className="flex-1 px-6">
          <View className="flex-1 justify-center">
            <View className="w-14 h-14 rounded-full bg-accentSoft border border-accent items-center justify-center mb-5">
              <Feather name="mail" size={24} color="#8CE05A" />
            </View>

            <Text className="text-text text-3xl font-bold mb-1">E-postanı doğrula</Text>
            <Text className="text-textMuted text-base mb-8 leading-6">
              <Text className="text-text font-semibold">{verifyEmail}</Text> adresine 6 haneli bir
              kod gönderdik. Hesabın, kodu girdikten sonra açılacak.
            </Text>

            {infoMsg ? (
              <View className="bg-accentSoft border border-accent rounded-button px-4 py-3 mb-4 flex-row items-start gap-3">
                <Feather name="info" size={15} color="#8CE05A" style={{ marginTop: 1 }} />
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
              placeholderTextColor="#8B8A82"
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

            <Pressable
              onPress={handleVerify}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Kodu doğrula"
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : loading ? 0.7 : 1 })}
              className="bg-accent rounded-button py-4 items-center mt-4"
            >
              {loading ? (
                <ActivityIndicator color="#0B0D0A" />
              ) : (
                <Text className="text-bg text-base font-semibold">Doğrula</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleResendCode}
              disabled={loading}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Kodu tekrar gönder"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="items-center py-3 mt-2"
            >
              <Text className="text-accent text-sm font-medium">Kodu tekrar gönder</Text>
            </Pressable>
          </View>

          {/* Yanlış adres yazılmış olabilir — dönüş yolu hep açık. */}
          <View className="border-t border-border pt-4 pb-6">
            <Pressable
              onPress={() => {
                setVerifyEmail(null);
                setCode("");
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Farklı e-posta ile dene"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="items-center py-2"
            >
              <Text className="text-textMuted text-sm">
                Yanlış adres mi? <Text className="text-accent font-semibold">Geri dön</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg"
    >
      {/* Instagram/Facebook deseni: form dikeyde ortalanmış, kip değiştirme
          bağlantısı ekranın EN ALTINA sabit ve üstünde ince bir ayraçla
          formdan ayrılmış. Sekmeli düzenden vazgeçildi — bu ekrana oturmadı. */}
      <View className="flex-1 px-6">
        <View className="flex-1 justify-center">
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

        {/* Ekranın en altına sabit kip değiştirici. Üstündeki ayraç onu
            formdan görsel olarak koparıyor: "asıl iş yukarıda, bu ayrı bir
            yol" mesajı. Instagram/Facebook'ta da bu bant ekranın dibinde
            durur ve formla karışmaz. */}
        <View className="border-t border-border pt-4 pb-6">
          <Pressable
            onPress={() => {
              setMode(mode === "login" ? "signup" : "login");
              setErrorMsg(null);
              setInfoMsg(null);
              setShowAccountHint(false);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={mode === "login" ? "Kayıt ekranına geç" : "Giriş ekranına geç"}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="items-center py-2"
          >
            <Text className="text-textMuted text-sm">
              {mode === "login" ? "Hesabın yok mu? " : "Zaten hesabın var mı? "}
              <Text className="text-accent font-semibold">
                {mode === "login" ? "Kayıt ol" : "Giriş yap"}
              </Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
