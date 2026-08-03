import { useState } from "react";
import { View, Pressable, ActivityIndicator, Image } from "react-native";
import { Text, TextInput } from "@/components/Typography";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { useProfile, useUpdateProfile } from "@/lib/profile";
import { uploadAvatar } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { alertError } from "@/lib/alerts";
import { ErrorState } from "@/components/ErrorState";

export default function EditProfileScreen() {
  const { user } = useAuth();
  const { data: profile, isLoading, error, refetch } = useProfile(user?.id);
  const updateMutation = useUpdateProfile(user?.id);

  const [name, setName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form alanlarını profil verisiyle doldur. Effect'te setState yapmak veri
  // geldikten sonra fazladan bir tam render turu demekti; render sırasında
  // "önceki değerle karşılaştır" kalıbı aynı işi commit öncesinde yapıyor
  // (react.dev: you-might-not-need-an-effect).
  const [prevProfile, setPrevProfile] = useState<typeof profile>(undefined);
  if (profile && profile !== prevProfile) {
    setPrevProfile(profile);
    setName(profile.name ?? "");
    setAvatarPath(profile.avatarPath);
    setDisplayUri(profile.avatarUrl);
  }

  async function pickAvatar() {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploading(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 400 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const previousPath = avatarPath;
      const path = await uploadAvatar(user.id, manipulated.base64!);
      // Eski profil fotoğrafını depoda öksüz bırakmamak için siliyoruz.
      if (previousPath) {
        await supabase.storage.from("photos").remove([previousPath]);
      }
      setAvatarPath(path);
      setDisplayUri(manipulated.uri);
    } catch (err) {
      alertError("Fotoğraf yüklenemedi", err, "profile.pickAvatar");
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    updateMutation.mutate(
      { name: name.trim() || null, avatar_path: avatarPath },
      {
        onSuccess: () => router.back(),
        onError: (err) => alertError("Kaydedilemedi", err, "profile.update"),
      }
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#8CE05A" />
      </View>
    );
  }

  // Profil okunamadıysa form boş isimle açılırdı; "Kaydet" adı siler.
  if (error) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ErrorState error={error} onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-bg px-5 pt-14"
      enableOnAndroid
      extraScrollHeight={30}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
        >
          <Feather name="chevron-left" size={22} color="#F5F3EC" />
        </Pressable>
        <Text className="text-text text-xl font-bold">Profili Düzenle</Text>
      </View>

      <View className="items-center mb-8">
        <Pressable
          onPress={pickAvatar}
          accessibilityRole="button"
          accessibilityLabel="Profil fotoğrafını değiştir"
          style={{ position: "relative" }}
        >
          <View className="w-24 h-24 rounded-full bg-surface border-[1.5px] border-accent items-center justify-center overflow-hidden">
            {displayUri ? (
              <Image source={{ uri: displayUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <Feather name="user" size={36} color="#8CE05A" />
            )}
          </View>
          <View
            style={{ position: "absolute", bottom: 0, right: 0 }}
            className="w-8 h-8 rounded-full bg-accent border-2 border-bg items-center justify-center"
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#0B0D0A" />
            ) : (
              <Feather name="camera" size={14} color="#0B0D0A" />
            )}
          </View>
        </Pressable>
        <Text className="text-textFaint text-sm mt-3">Fotoğrafı değiştirmek için dokun</Text>
      </View>

      <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">İSİM</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="İsmini yaz"
        placeholderTextColor="#8B8A82"
        accessibilityLabel="İsim"
        style={{ height: 52, textAlignVertical: "center" }}
        className="bg-surface border border-border rounded-button px-4 text-text text-base mb-6"
      />

      <Pressable
        onPress={handleSave}
        disabled={updateMutation.isPending || uploading}
        style={{ opacity: updateMutation.isPending || uploading ? 0.7 : 1 }}
        className="bg-accent rounded-button py-4 items-center mb-8"
      >
        {updateMutation.isPending ? (
          <ActivityIndicator color="#0B0D0A" />
        ) : (
          <Text className="text-bg text-base font-semibold">Kaydet</Text>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}
