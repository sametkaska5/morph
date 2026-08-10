import { useState, useRef } from "react";
import {
  View,
  Image,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { showAlert } from "@/lib/appAlert";
import { Text, TextInput } from "@/components/Typography";
import { router } from "expo-router";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import { useAuth } from "@/lib/useAuth";
import { useCaptureStore } from "@/lib/captureStore";
import { toLocalDateKey } from "@/lib/date";
import { saveEntry, SAVE_ENTRY_MUTATION_KEY, type SaveEntryPayload } from "@/lib/entryMutations";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useKeyboardFocus } from "@/lib/useKeyboardFocus";
import { useUnitPreference, displayUnit, toMetricValue } from "@/lib/units";
import { validateMeasurementInput, measurementErrorText } from "@/lib/measurementInput";
import { alertError } from "@/lib/alerts";
import type { EntryRow } from "@/lib/entries";
import { queryKeys } from "@/lib/queryKeys";
import { useScreenInsets } from "@/lib/useScreenInsets";
import { hapticSuccess } from "@/lib/haptics";

/** Önizlemenin çıkabileceği en fazla yükseklik — çok uzun (9:16, panorama)
 *  fotoğraflar formun tamamını ekran dışına itmesin diye. */
const MAX_PREVIEW_HEIGHT = 480;

export default function NewEntry() {
  const screen = useScreenInsets();
  const photo = useCaptureStore((s) => s.photo);
  const clearPhoto = useCaptureStore((s) => s.clear);
  // Fotoğraf var ama base64'ü henüz üretilmedi (arka plan küçültme sürüyor).
  // Bu sürede önizleme görünüyor ama kaydetme beklemeli.
  const photoProcessing = !!photo && !photo.base64;
  const { user } = useAuth();
  const { data: types } = useMeasurementTypes(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);
  const queryClient = useQueryClient();

  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  // Galeriden seçilen eski fotoğrafın EXIF çekim tarihi varsa (bkz. (tabs)/_layout.tsx
  // parseExifDateTime) tarihi otomatik ona ayarlıyoruz — kullanıcı tekrar elle seçmesin.
  const [date, setDate] = useState(() => (photo?.takenAt ? new Date(photo.takenAt) : new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const noteRef = useRef<TextInput | null>(null);
  const { scrollRef, onScroll, revealField, keyboardPadding } = useKeyboardFocus();

  /* ---------------- ÖNİZLEME ÖLÇÜSÜ ----------------
     Önizleme fotoğrafın KENDİ oranında çiziliyor; eskiden kutu tam genişlik ×
     sabit 288px'ti ve `cover` ile dolduruluyordu, yani dikey fotoğrafların üstü
     ve altı kırpılıyordu — kullanıcı çektiği karenin yarısını göremiyordu.

     Genişlik ELLE hesaplanıyor, `width: "100%"` + `aspectRatio` + `maxHeight`
     üçlüsü DEĞİL: yükseklik maxHeight'e takılınca oranı korumak için genişlik de
     küçülüyor ve fotoğrafın sağında boşluk kalıyordu. Genişliği sabitleyip
     yüksekliği kendimiz sınırlayınca kutu her zaman tam genişlik oluyor; yalnızca
     aşırı uzun fotoğraflarda `cover` biraz kırpıyor.

     40 = contentContainerStyle'daki padding: 20'nin iki yanı. */
  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = windowWidth - 40;
  const previewRatio = photo?.width && photo?.height ? photo.width / photo.height : 4 / 3;
  const previewHeight = Math.min(previewWidth / previewRatio, MAX_PREVIEW_HEIGHT);

  const saveMutation = useMutation<
    Awaited<ReturnType<typeof saveEntry>>,
    Error,
    SaveEntryPayload,
    { previous?: InfiniteData<EntryRow[]> }
  >({
    mutationKey: SAVE_ENTRY_MUTATION_KEY,
    mutationFn: saveEntry,
    onMutate: async (payload) => {
      // Offline'da bile kaydı hemen Ana Ekran'da görebilmek için timeline cache'ine
      // "senkronize edilecek" işaretli bir kayıt ekliyoruz — gerçek satır Supabase'e
      // yazılınca (online olduğunda) invalidate ile yerini gerçek veriye bırakıyor.
      await queryClient.cancelQueries({ queryKey: queryKeys.entries.timeline() });
      // Izgara sayfalı olduğu için cache'te düz dizi değil sayfa dizisi var.
      const previous = queryClient.getQueryData<InfiniteData<EntryRow[]>>(
        queryKeys.entries.timeline()
      );

      const optimisticEntry: EntryRow = {
        id: `pending-${payload.date}`,
        date: payload.date,
        note: payload.note,
        // Izgarada ~108pt'lik kare gösteriliyor ve bu obje persist edilen React
        // Query cache'i üzerinden AsyncStorage'a yazılıyor — tam boy base64'ü
        // gömmek hem diske yüzlerce KB yazıyor hem render'ı yavaşlatıyordu.
        // Küçük kopya varsa onu kullan, yoksa (eski akış) tam boya düş.
        cover_photo_url: `data:image/jpeg;base64,${payload.thumbBase64 ?? payload.photoBase64}`,
        cover_photo_path: `pending-${payload.date}`,
        // Senkronize olmadan o günün gerçek fotoğraf sayısını bilmiyoruz; kart
        // tek fotoğraflı gibi çizilir, sunucudan dönen satır doğrusunu getirir.
        photo_count: 1,
        back_photos: [],
        pending: true,
      };

      queryClient.setQueryData<InfiniteData<EntryRow[]>>(queryKeys.entries.timeline(), (old) => {
        // Aynı günün önceki kaydı HER sayfadan çıkarılıyor: kullanıcı eski bir
        // tarihe kayıt ekliyor olabilir ve o gün ilk sayfada olmayabilir.
        const cleaned = (old?.pages ?? []).map((page) =>
          page.filter((e) => e.date !== payload.date)
        );
        const pages = cleaned.length > 0 ? cleaned : [[]];
        // Yeni kayıt ilk sayfaya giriyor ve sayfa kendi içinde sıralanıyor.
        // Sayfalar arası sıralama zaten tarihe göre; gerçek satır geldiğinde
        // invalidate hepsini yeniden çekiyor.
        pages[0] = [optimisticEntry, ...pages[0]].sort((a, b) => (a.date < b.date ? 1 : -1));
        return { pages, pageParams: old?.pageParams ?? [0] };
      });

      return { previous };
    },
    onError: (err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.entries.timeline(), context.previous);
      }
      // alertError hem bildirir hem captureError'a raporlar — ayrıca
      // çağırmıyoruz, yoksa aynı hata Sentry'ye iki kez giderdi.
      alertError("Kayıt başarısız", err, "new.saveEntry");
    },
  });

  function handleSave() {
    if (!user) return;
    if (!photo) {
      showAlert("Fotoğraf bulunamadı", "Kaydetmeden önce bir fotoğraf çekmen/seçmen gerekiyor.");
      return;
    }
    if (!photo.base64) {
      // Arka plan küçültme henüz bitmedi — birkaç saniye içinde hazır olur.
      showAlert("Fotoğraf hazırlanıyor", "Fotoğraf işleniyor, bir saniye sonra tekrar dene.");
      return;
    }
    // Geçersiz / negatif / makul olmayan yüksek bir değer varsa kaydetme —
    // kullanıcı hangi alanın sorunlu olduğunu satır altındaki kırmızı uyarıdan
    // görüyor. Sessizce düşürmek yerine engelliyoruz ki yanlışlıkla "kaydettim"
    // sanmasın.
    const hasInvalid = (types ?? []).some((t) => {
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

    // Kullanıcı imperial tercih ettiyse girdiği değerler lb/inch cinsinden — DB'ye
    // her zaman metrik yazıldığı için kaydetmeden önce kg/cm'ye çeviriyoruz.
    const metricValues: Record<string, string> = {};
    for (const t of types ?? []) {
      const v = validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref));
      if (v.status !== "ok") continue;
      metricValues[t.id] = String(toMetricValue(v.value, t.unit, unitPref));
    }

    // İnternet olsun olmasın kayıt anında Ana Ekran'a dönüyoruz — foto zaten optimistic
    // olarak timeline'da görünüyor (onMutate), gerçek senkronizasyon arka planda
    // (online olunca) tamamlanıyor. Kullanıcı offline'da spinner'da beklemek zorunda kalmasın.
    saveMutation.mutate({
      userId: user.id,
      date: toLocalDateKey(date),
      note: note || null,
      values: metricValues,
      photoBase64: photo.base64,
      thumbBase64: photo.thumbBase64,
    });
    clearPhoto();
    // Dokunsal onay BURADA, mutation'ın onSuccess'inde DEĞİL: bu ekran
    // offline-öncelikli, yani kayıt kuyruğa alınıp ağ gelince tamamlanabiliyor.
    // Titreşimi ağ başarısına bağlamak, kullanıcı saatler sonra bambaşka bir
    // şey yaparken telefonun titremesi demek olurdu. Kullanıcı açısından
    // "tamamlandı" anı burası: kayıt alındı ve ana ekrana dönülüyor.
    hapticSuccess();
    router.replace("/(tabs)");
  }

  return (
    <View className="flex-1 bg-bg">
      {/* SABİT başlık çubuğu — kaydırılan içeriğin DIŞINDA, o yüzden aşağı
          kaydırınca kaybolmuyor. İptal solda, Kaydet sağda.
          Bu üçüncü deneme: (1) Kaydet kaydırılan içeriğin sonundaydı, gezinme
          çubuğuyla çarpışıyordu; (2) alta sabit çubuk çarpışmayı çözdü ama form
          alanından ~110px götürüp fotoğraf önizlemesini ekran dışına itti;
          (3) başlık satırı zaten vardı ve sağı boştu — eylemler oraya taşınınca
          dikey alandan hiçbir şey harcanmıyor, Kaydet hem her zaman görünür hem
          de gezinme çubuğuna hiç yaklaşmıyor.
          İptal eski geri okunun yerini aldı: ikisi de router.back() çağırıyordu.
          Alttaki ince ayraç, içeriğin çubuğun ALTINDAN aktığını belli ediyor. */}
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

        <Text className="text-text text-xl font-bold">Yeni Kayıt</Text>

        {/* Etiket SABİT: duruma göre değiştirilirse düğmenin erişilebilir adı
            kayboluyor (düzenleme ekranında da aynı kural). Meşguliyet
            accessibilityState'e yazılıyor, ada değil. */}
        <Pressable
          onPress={handleSave}
          disabled={photoProcessing}
          accessibilityRole="button"
          accessibilityLabel="Kaydı kaydet"
          accessibilityState={{ disabled: photoProcessing, busy: photoProcessing }}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : photoProcessing ? 0.7 : 1 })}
          className="bg-accent rounded-[12px] px-4 h-11 items-center justify-center"
        >
          {photoProcessing ? (
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
        className="flex-1 bg-bg"
        contentContainerStyle={{
          padding: 20,
          paddingBottom: screen.bottom + keyboardPadding,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {photo?.uri ? (
          <Image
            source={{ uri: photo.uri }}
            style={{ width: previewWidth, height: previewHeight }}
            className="rounded-card mb-4"
            resizeMode="cover"
          />
        ) : null}

        {/* Kaydet'in neden kapalı olduğunu söyleyen tek yer burası. Eskiden
          düğmenin kendi etiketi "Hazırlanıyor…"a dönüyordu; düğme başlığa
          taşınıp daralınca oraya metin sığmıyor, yerine spinner var. Durum
          bilgisi kullanıcıdan kaybolmasın diye fotoğrafın altına alındı. */}
        {photoProcessing ? (
          <Text className="text-textMuted text-sm text-center mb-4">Hazırlanıyor…</Text>
        ) : null}

        {/* "Tarih" ve değer ayrı iki metin düğümü; etiketsizken ekran okuyucu
          ikisini ilişkisiz okuyor ve bunun DOKUNULABİLİR olduğu hiç belli
          olmuyordu. Etiket + ipucu ikisini de çözüyor. */}
        <Pressable
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`Tarih: ${date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`}
          accessibilityHint="Tarih seçiciyi açar"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="bg-surface border border-border rounded-button px-4 py-4 mb-3 flex-row items-center justify-between"
        >
          <Text className="text-textMuted text-base">Tarih</Text>
          <Text className="text-text text-base font-semibold">
            {date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </Pressable>

        {showPicker && (
          <DateTimePicker
            value={date}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onValueChange={(_, selected) => {
              if (Platform.OS === "android") setShowPicker(false);
              setDate(selected);
            }}
            onDismiss={() => setShowPicker(false)}
          />
        )}

        <View className="bg-surface border border-border rounded-card p-4 mb-3">
          <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">ÖLÇÜMLER</Text>
          {types?.map((t, i) => {
            const errorText = measurementErrorText(
              validateMeasurementInput(values[t.id] ?? "", displayUnit(t.unit, unitPref)),
            );
            return (
              <View key={t.id} className="py-2">
                <View className="flex-row items-center justify-between gap-3">
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
                      onChangeText={(v) => setValues((prev) => ({ ...prev, [t.id]: v }))}
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

        <View className="bg-surface border border-border rounded-card p-4">
          <Text className="text-textFaint text-sm font-semibold mb-2 tracking-wide">NOT</Text>
          <TextInput
            ref={noteRef}
            value={note}
            onChangeText={setNote}
            placeholder="birkaç kelime yaz..."
            placeholderTextColor="#8B8A82"
            accessibilityLabel="Not"
            onFocus={() => revealField(noteRef.current)}
            multiline
            className="text-text text-base min-h-[64px]"
            maxLength={300}
          />
        </View>
      </ScrollView>
    </View>
  );
}
