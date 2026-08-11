import { View, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { showAlert } from "@/lib/appAlert";
// expo-image (RN'in kendi Image'ı DEĞİL): anı akışı ve detay ekranı zaten
// expo-image kullanıyor ve aynı fotoğrafı cacheKey ile diskte tutuyor. RN Image
// AYRI bir cache kullandığı için buradaki fotoğraf her seferinde sıfırdan
// iniyordu — oysa aynı dosya zaten indirilmiş durumdaydı.
import { Image } from "expo-image";
import { Text, TextInput } from "@/components/Typography";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Feather from "@expo/vector-icons/Feather";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { uploadPhoto, uploadThumb, coverPhotoRow, photoCacheKey } from "@/lib/storage";
import { resizeAndCompress } from "@/lib/capture";
import { nextOrderIndex } from "@/lib/photos";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useUnitPreference, displayUnit, toDisplayValue, toMetricValue } from "@/lib/units";
import { validateMeasurementInput, measurementErrorText } from "@/lib/measurementInput";
import { useEditableEntry, useDeleteEntry } from "@/lib/entries";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { queryKeys } from "@/lib/queryKeys";
import { actionErrorMessage } from "@/lib/errors";
import { alertError } from "@/lib/alerts";
import { ErrorState } from "@/components/ErrorState";
import { useScreenInsets } from "@/lib/useScreenInsets";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";

/* ---------------- PAGE ---------------- */

export default function EditEntry() {
  const screen = useScreenInsets();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : String(params.id);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isPlaceholderData, error, refetch } = useEditableEntry(id);
  const { data: allTypes } = useMeasurementTypes(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  const [note, setNote] = useState("");
  // Yeni seçilen fotoğrafın SIKIŞTIRILMIŞ base64'ü — henüz storage'a YÜKLENMEDEN
  // burada bekliyor. Yükleme, Kaydet'e basılınca mutation'ın içinde yapılıyor.
  // Eskiden fotoğraf seçilir seçilmez yükleniyordu: kullanıcı kaydetmeden çıkarsa
  // (ya da üst üste birkaç foto seçerse) storage'da hiçbir kaydın işaret etmediği
  // yetim dosyalar kalıyordu. Yüklemeyi kayda ertelemek bu kaynağı tümüyle kapatır.
  const [pendingImage, setPendingImage] = useState<{ base64: string; thumbBase64: string } | null>(
    null,
  );
  // SADECE yeni seçilen fotoğrafın yerel uri'si (önizleme için). Kayıtlı fotoğrafın
  // linki artık sorgudan geliyor (bkz. useEntry) — state'te ayrıca tutup efektle
  // doldurmak gereksiz bir bekleme turu yaratıyordu.
  const [localUri, setLocalUri] = useState<string | null>(null);
  // measurement_type_id -> girilen değer (string, boş olabilir)
  const [values, setValues] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  /** Silme onay kutusu açık mı. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteEntry();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const noteRef = useRef<TextInput | null>(null);
  const { scrollRef, onScroll, revealField, keyboardPadding } = useKeyboardFocus();

  // Yeni fotoğraf seçildiyse onu, yoksa kayıtlı olanı göster.
  const displayUri = localUri ?? data?.photoUrl ?? null;
  // Kayıtlı fotoğrafı gösterirken cacheKey veriyoruz; akış/detay ekranlarıyla
  // aynı anahtar olduğu için disk cache'ten anında geliyor. Yeni seçilen yerel
  // dosyada cacheKey olmaz (henüz storage'da bir karşılığı yok).
  const displayCacheKey =
    !localUri && data?.photoPath ? photoCacheKey(data.photoPath, "full") : undefined;

  // Tam boy diskte yoksa gösterilecek anlık düşük çözünürlüklü kopya. Yeni
  // seçilen yerel fotoğrafta placeholder'a gerek yok (dosya zaten cihazda).
  const placeholderSource =
    !localUri && data?.thumbUrl
      ? {
          uri: data.thumbUrl,
          cacheKey: data.thumbPath ? photoCacheKey(data.thumbPath, "thumb") : undefined,
        }
      : undefined;

  /* INIT — form alanlarını sorgu verisiyle doldur.
     Effect'te setState yapmak veri geldikten sonra fazladan bir tam render
     turu (boş form → dolu form) demekti; render sırasında "önceki değerle
     karşılaştır" kalıbı aynı senkronizasyonu commit öncesinde yapıyor
     (react.dev: you-might-not-need-an-effect).

     Karşılaştırma artık `data` NESNE KİMLİĞİNE bakmıyor, `hydrationKey`'e bakıyor.
     Sebebi: React Query her yeniden çekmede yeni bir nesne üretiyor, yani eski
     kontrol arka planda bir refetch olduğunda (offline-first bir uygulamada
     refetchOnReconnect varsayılan olarak AÇIK) formu SIFIRLIYORDU — kullanıcı not
     yazarken yazdığı kayboluyordu. Anahtar sürüme değil kaydın kimliğine bağlı,
     yani ilk gerçek veride bir kez dolduruyor, sonra dokunmuyor.
     Kardeş ekranlar (entry/workout.tsx, entry/program.tsx) aynı kalıbı kullanıyor. */
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  /**
   * Form GÜVENİLİR mi?
   *
   * `useEditableEntry` başka ekranların cache'inden bir tohum (placeholderData)
   * veriyor ki fotoğraf anında görünsün. Ama o tohumda ölçümler ve fotoğraf
   * satırları YOK (`measurement_values: []`, `photos: []`). Tohum gösterilirken
   * form düzenlenebilir bırakılırsa Kaydet, olmayan verinin üstüne yazıyordu:
   * kapak fotoğrafı bulunamadığı için "değiştir" sessizce "ekle"ye dönüşüyordu.
   * Fotoğrafı göstermeye devam ediyoruz (tohumun asıl amacı bu), ama alanlar ve
   * Kaydet gerçek veri gelene kadar kapalı.
   */
  const formReady = !!data && !isPlaceholderData && !!allTypes;
  const hydrationKey = formReady ? `${id}:${unitPref}` : null;
  // `data &&` burada TypeScript için: formReady onu zaten garanti ediyor ama
  // boolean bir değişken tip daraltması yapmıyor.
  if (data && hydrationKey && hydratedKey !== hydrationKey) {
    setHydratedKey(hydrationKey);
    // `?? ""`: eskiden `if (data?.note)` idi, yani notu BOŞALTILMIŞ bir kayıtta
    // alan önceki değerinde kalıyordu.
    setNote(data.note ?? "");
    const initial: Record<string, string> = {};
    for (const mv of data.measurement_values ?? []) {
      const baseUnit = mv.measurement_types?.unit ?? "";
      initial[mv.measurement_type_id] = String(toDisplayValue(mv.value, baseUnit, unitPref));
    }
    setValues(initial);
  }

  /* ---------------- PICK IMAGE (kırp / kırpmadan seç) ---------------- */

  async function pickImage() {
    if (!user) return;

    // base64'ü picker'dan istemiyoruz: resizeAndCompress zaten uri'den çalışıp
    // küçültülmüş base64'ü üretiyor, ham dosyayı ayrıca belleğe almak gereksiz.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      // Fotoğrafı çekim akışıyla aynı şekilde küçültüp sıkıştırıyoruz ama HENÜZ
      // yüklemiyoruz — base64'ü state'te tutup asıl yüklemeyi Kaydet'e (mutation'a)
      // bırakıyoruz. Önizlemeyi yerel uri'den gösteriyoruz; kaydetmeden çıkılırsa
      // storage'a hiç dosya yazılmamış olur (yetim dosya oluşmaz).
      const { base64, thumbBase64 } = await resizeAndCompress(asset.uri);
      setPendingImage({ base64, thumbBase64 });
      setLocalUri(asset.uri);
    } catch (err) {
      // Bozuk/desteklenmeyen görsel ya da bellek yetersizliği. catch olmadan bu
      // yakalanmayan bir promise reddi oluyordu: spinner kapanıyor, önizleme
      // değişmiyor, kullanıcı neden hiçbir şey olmadığını anlamıyordu.
      // (lib/capture.ts aynı hatayı zaten böyle bildiriyor.)
      alertError("Fotoğraf işlenemedi", err, "editEntry.pickImage");
    } finally {
      setUploading(false);
    }
  }

  /* ---------------- SAVE ---------------- */

  const updateMutation = useMutation({
    mutationFn: async () => {
      const existingPhotoRow = coverPhotoRow<{
        id: string;
        storage_path: string;
        thumb_path?: string | null;
        order_index: number;
      }>(data);

      let coverPhotoId = data?.cover_photo_id ?? existingPhotoRow?.id ?? null;

      // Yeni fotoğraf yalnızca kullanıcı gerçekten seçtiyse (pendingImage dolu)
      // yüklenir — ve yükleme tam da BURADA, kayıt anında yapılır.
      if (pendingImage) {
        if (!user) throw new Error("Giriş yapılmamış");

        const storagePath = await uploadPhoto(user.id, id, pendingImage.base64);

        // Thumbnail opsiyonel — üretilemezse kayıt yine de tam boyla çalışır.
        let newThumbPath: string | null = null;
        try {
          newThumbPath = await uploadThumb(user.id, id, pendingImage.thumbBase64);
        } catch (err) {
          console.warn("thumbnail yüklenemedi, tam boy kullanılacak:", err);
        }

        // Yeni fotoğraf, YERİNİ ALDIĞI fotoğrafın sırasını devralıyor.
        //
        // Eskiden sabit `0` yazılıyordu. Bu ekran gün başına tek fotoğraf varken
        // yazılmıştı; artık bir güne birden fazla fotoğraf eklenebiliyor ve
        // kapak da ilk sırada olmak zorunda değil. Kapak 2. sıradaki fotoğrafsa,
        // onu silip yenisini 0'a yazmak mevcut 0'lı fotoğrafla çakışıyordu.
        // (order_index'te unique kısıt YOK — bkz. 0001_init.sql — yani çakışma
        // hata vermiyor, sessizce sıralamayı bozuyor: orderEntryPhotos eşitlikte
        // id'ye göre sıralıyor, yani şeritteki dizilim rastgeleye dönüyordu.)
        // Kapağı olmayan eski kayıtlarda mevcutların ardına ekliyoruz.
        const newOrderIndex =
          existingPhotoRow?.order_index ?? nextOrderIndex(data?.photos ?? []);

        const { data: newPhoto, error: photoError } = await supabase
          .from("photos")
          .insert({
            entry_id: id,
            storage_path: storagePath,
            thumb_path: newThumbPath,
            order_index: newOrderIndex,
          })
          .select()
          .single();
        if (photoError) throw photoError;

        coverPhotoId = newPhoto.id;

        if (existingPhotoRow) {
          // Eski kaydın thumbnail'ini de siliyoruz, yoksa storage'da yetim kalır.
          await supabase.storage
            .from("photos")
            .remove(
              [existingPhotoRow.storage_path, existingPhotoRow.thumb_path].filter(
                Boolean,
              ) as string[],
            );
          await supabase.from("photos").delete().eq("id", existingPhotoRow.id);
        }
      }

      const { error: entryError } = await supabase
        .from("entries")
        .update({ note: note || null, cover_photo_id: coverPhotoId })
        .eq("id", id);
      if (entryError) throw entryError;

      const measurementRows = Object.entries(values)
        .map(([typeId, v]) => {
          // Yalnızca geçerli (ok) değerler yazılır. Geçersiz/negatif/çok yüksek
          // girdiler zaten kaydetmeden önce handleUpdate'te engelleniyor; bu
          // filtre son bir güvenlik ağı.
          const baseUnit = allTypes?.find((t) => t.id === typeId)?.unit ?? "";
          const validation = validateMeasurementInput(v, displayUnit(baseUnit, unitPref));
          if (validation.status !== "ok") return null;
          return {
            entry_id: id,
            measurement_type_id: typeId,
            value: toMetricValue(validation.value, baseUnit, unitPref),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (measurementRows.length > 0) {
        const { error: valuesError } = await supabase
          .from("measurement_values")
          .upsert(measurementRows, { onConflict: "entry_id,measurement_type_id" });
        if (valuesError) throw valuesError;
      }

      // Kullanıcı bir ölçüm alanını boşaltarak sildiğinde, sadece dolu satırları
      // upsert etmek yetmiyordu: eski değer DB'de kalıp ekran yenilenince geri
      // geliyordu. Bu entry'de artık değeri olmayan tipleri açıkça siliyoruz.
      const clearedTypeIds = Object.entries(values)
        .filter(([, v]) => v.trim() === "")
        .map(([typeId]) => typeId);

      if (clearedTypeIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("measurement_values")
          .delete()
          .eq("entry_id", id)
          .in("measurement_type_id", clearedTypeIds);
        if (deleteError) throw deleteError;
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.entry.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.entry.edit(id) });
      // Ölçüm değeri değişmiş olabilir — istatistik grafiği (measurement_series)
      // cache'ten eski değeri göstermesin diye onu da tazeliyoruz. Eskiden bu
      // invalidate edilmediği için grafik ancak elle yenileyince güncelleniyordu.
      queryClient.invalidateQueries({ queryKey: queryKeys.measurementSeries.all });
      hapticSuccess();
      router.back();
    },
  });

  // Kaydet üç durumda kapalı: kayıt sürüyor, fotoğraf işleniyor, ya da form
  // henüz gerçek veriyle dolmadı (bkz. formReady).
  const saveBlocked = updateMutation.isPending || uploading || !formReady;

  // Kaydetmeden önce geçersiz/negatif/çok yüksek ölçüm var mı bak — varsa
  // engelle. Kullanıcı hangi alanın sorunlu olduğunu satır altındaki kırmızı
  // uyarıdan görüyor.
  function handleUpdate() {
    const hasInvalid = (allTypes ?? []).some((t) => {
      const s = validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref)).status;
      return s === "invalid" || s === "negative" || s === "too_high";
    });
    if (hasInvalid) {
      showAlert(
        "Geçersiz ölçüm",
        "Bazı ölçüm değerleri geçerli değil. Kırmızı uyarıları düzeltip tekrar dene.",
      );
      return;
    }
    updateMutation.mutate();
  }

  /* ---------------- UI ---------------- */

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#8CE05A" />
      </View>
    );
  }

  // Kayıt çekilemediyse formu AÇMIYORUZ: alanlar boş kalırdı ve "Kaydet"
  // notu da ölçümleri de silerdi. Kullanıcının gördüğü tek şey boş bir form
  // olduğu için sildiğini anlaması da mümkün değildi.
  if (error) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ErrorState error={error} onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      {/* SABİT başlık çubuğu — gerekçesi entry/new.tsx'te. İki kardeş ekran aynı
          desende. Bu ekranda daha önce hiç geri kontrolü yoktu; İptal onu da
          getiriyor. */}
      <View
        className="flex-row justify-between items-center px-5 pb-3 border-b border-border"
        style={{ paddingTop: screen.top }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="İptal et ve geri dön"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text className="text-textMuted text-base">İptal</Text>
        </Pressable>

        <Text className="text-text text-xl font-bold">Düzenle</Text>

        {/* Etiket sabit: kaydederken metin ActivityIndicator'a dönüşüyor ve
            düğmenin erişilebilir adı kayboluyordu. */}
<Pressable
          onPress={handleUpdate}
          disabled={saveBlocked}
          accessibilityRole="button"
          accessibilityLabel="Kaydet"
          accessibilityState={{ disabled: saveBlocked, busy: saveBlocked }}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : saveBlocked ? 0.7 : 1 })}
          className="bg-accent rounded-[12px] px-4 h-11 items-center justify-center"
        >
          {updateMutation.isPending || !formReady ? (
            <ActivityIndicator color="#0B0D0A" size="small" />
          ) : (
            <Text className="text-bg text-base font-semibold">Kaydet</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1 bg-bg px-5"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: screen.bottom + keyboardPadding }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={pickImage}
          disabled={!formReady}
          accessibilityRole="button"
          accessibilityLabel="Fotoğrafı değiştir"
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          className="mb-6 relative"
        >
          {displayUri ? (
            <Image
              source={{ uri: displayUri, cacheKey: displayCacheKey }}
              // Tam boy diskte yoksa küçük kopya anında görünsün; boş kare
              // beklemesi yerine kullanıcı düşük çözünürlüklü hâli hemen görüyor,
              // tam boy hazır olunca üstüne geçiyor.
              placeholder={placeholderSource}
              placeholderContentFit="cover"
              // Boyut className ile DEĞİL style ile veriliyor: NativeWind bu
              // projede expo-image'a className uygulamıyor (uygulamadaki diğer
              // tüm expo-image kullanımları da style kullanıyor). className
              // verilince görsel boyutsuz kalıp hiç görünmüyordu.
              // w-full/h-64/rounded-card karşılıkları: %100 / 256 / 20.
              style={{ width: "100%", height: 256, borderRadius: 20 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={data?.photoPath ?? undefined}
              transition={150}
            />
          ) : (
            <View className="w-full h-64 bg-surface rounded-card items-center justify-center">
              <Text className="text-textMuted text-base">Fotoğraf seç</Text>
            </View>
          )}

          {uploading && (
            <View className="absolute inset-0 bg-black/40 items-center justify-center rounded-card">
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </Pressable>

        <View className="bg-surface border border-border p-4 rounded-card mb-6">
          <Text className="text-textFaint text-sm font-semibold uppercase tracking-wide mb-3">
            Ölçümler
          </Text>
          {allTypes?.map((t, i) => {
            const errorText = measurementErrorText(
              validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref)),
            );
            return (
              <View key={t.id} className="mb-3">
                <View className="flex-row justify-between items-center">
                  {/* Ölçüm adı ikincil bir etiket değil, girilen değerin ne olduğunu
                    söyleyen asıl metin — 14pt gri yerine 16pt gövde boyutu. */}
                  <Text className="text-textMuted text-base capitalize flex-1" numberOfLines={1}>
                    {t.name}
                  </Text>
                  <View className="flex-row items-center gap-2 shrink-0">
                    <TextInput
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      value={values[t.id] ?? ""}
                      onChangeText={(val) => setValues((prev) => ({ ...prev, [t.id]: val }))}
                      editable={formReady}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      // Alanın ekran okuyucuya söyleyeceği ad. Ölçüm adı AYRI bir Text
                      // düğümü olduğu için alan isimsiz kalıyordu: ekran okuyucu
                      // yalnızca "metin girişi" diyip geçiyordu. Birim de etikete
                      // giriyor, aksi halde neyin girildiği duyulmuyor.
                      accessibilityLabel={`${t.name}, ${displayUnit(t.unit, unitPref)}`}
                      placeholderTextColor="#8B8A82"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      // Klavye açıkken odak buraya geçtiğinde kendiliğinden kaydırma
                      // olmadığı için alanı elle görünür alana taşıyoruz.
                      onFocus={() => revealField(inputRefs.current[i])}
                      onSubmitEditing={() => {
                        const next = inputRefs.current[i + 1];
                        if (next) next.focus();
                        else noteRef.current?.focus();
                      }}
                      className={`text-base font-semibold text-right w-16 ${errorText ? "text-danger" : "text-text"}`}
                    />
                    {/* Birim ARTIK kalıcı bir etiket, placeholder DEĞİL.
                        Placeholder değer yazılır yazılmaz kayboluyor, yani birim tam da
                        kullanıcının sayıyı girdiği anda görünmez oluyordu. Üstelik alan
                        sabit 80px olduğu için uzun birimler ("kilogram", "santimetre")
                        placeholder'da da kırpılıyordu. max-w + numberOfLines: aşırı uzun
                        bir birim satırı bozmak yerine kendisi kısalıyor. */}
                    <Text
                      className="text-textFaint text-sm max-w-[72px]"
                      numberOfLines={1}
                    >
                      {displayUnit(t.unit, unitPref)}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Sonraki alana geç"
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                      onPress={() => {
                        const next = inputRefs.current[i + 1];
                        if (next) next.focus();
                        else noteRef.current?.focus();
                      }}
                    >
                      <Feather name="chevron-right" size={16} color="#8B8A82" />
                    </Pressable>
                  </View>
                </View>
                {errorText ? (
                  <Text className="text-danger text-xs mt-1 text-right">{errorText}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        <TextInput
          ref={noteRef}
          value={note}
          onChangeText={setNote}
          editable={formReady}
          accessibilityLabel="Not"
          placeholder="Not..."
          placeholderTextColor="#8B8A82"
          onFocus={() => revealField(noteRef.current)}
          className="bg-surface border border-border text-text text-base p-4 rounded-card h-28 mb-6"
          multiline
        />

        {updateMutation.isError ? (
          <Text className="text-danger text-base mb-3" accessibilityRole="alert">
            {actionErrorMessage(updateMutation.error)}
          </Text>
        ) : null}

        {/* SİLME — kayıt detayındaki ("entry/[id].tsx") kalıbın birebir aynısı:
            sayfanın en dibinde, dolu kırmızı zemin, chevron yok.

            NEDEN BURADA DA VAR: anı akışından düzenlemeye DOĞRUDAN giriliyor,
            yani kullanıcı detay ekranını hiç görmüyor ve o yoldan bir anıyı
            silmenin hiçbir yolu yoktu — akıştaki bir anıyı silmek için önce
            ana ekrana gidip aynı kaydı bulmak gerekiyordu. Aynı nesne üzerinde
            aynı işlemin, ona nereden ulaştığına göre var olup olmaması
            tutarsızlık; iki yol da artık aynı yeteneklere sahip. */}
        <Pressable
          onPress={() => setConfirmDelete(true)}
          disabled={updateMutation.isPending || deleteMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Bu anıyı sil"
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          className="mt-2 flex-row items-center justify-center gap-2 py-4 rounded-button bg-danger"
        >
          <Feather name="trash-2" size={16} color="#0B0D0A" />
          <Text className="text-bg text-base font-semibold">Bu anıyı sil</Text>
        </Pressable>
      </ScrollView>

      {deleteMutation.isPending && (
        <View className="absolute inset-0 bg-black/50 items-center justify-center z-20">
          <ActivityIndicator color="#fff" />
        </View>
      )}

      <ConfirmDialog
        visible={confirmDelete}
        icon="trash-2"
        danger
        title="Bu anıyı sil?"
        message="Bu işlem geri alınamaz, fotoğraf ve ölçümler kalıcı olarak silinir."
        confirmLabel="Sil"
        onConfirm={() => {
          setConfirmDelete(false);
          hapticWarning();
          deleteMutation.mutate(id, {
            /* dismissAll, back DEĞİL. Bu ekrana iki yoldan geliniyor:
               akıştan doğrudan (üstte tek ekran var) ve ana ekran → detay →
               düzenle (üstte iki ekran var). `back` ikinci yolda kullanıcıyı
               AZ ÖNCE SİLDİĞİ kaydın detay ekranına düşürürdü: sorgu boş döner,
               kullanıcı hata sayfasıyla karşılaşır. dismissAll ikisinde de
               yığını kökene indiriyor, yani kullanıcı hangi sekmeden geldiyse
               oraya dönüyor. */
            onSuccess: () => router.dismissAll(),
            onError: (err) => alertError("Anı silinemedi", err, "editEntry.delete"),
          });
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </View>
  );
}
