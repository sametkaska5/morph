import {
  View,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  FlatList,
} from "react-native";
import { PressableFade } from "@/components/PressableFade";
import { Text } from "@/components/Typography";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { photoCacheKey } from "@/lib/storage";
import { formatDateKey } from "@/lib/date";
import { useEntryDetail, useEntryOrder, useDeleteEntry } from "@/lib/entries";
import { useAddEntryPhotos, useSetCoverPhoto, useDeleteEntryPhoto } from "@/lib/photos";
import { pickPhotosForEntry } from "@/lib/capture";
import { useAuth } from "@/lib/useAuth";
import { alertError } from "@/lib/alerts";
import { ErrorState } from "@/components/ErrorState";
import { EntryPhotoStrip, useActivePhoto } from "@/components/EntryPhotoStrip";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useScreenInsets } from "@/lib/useScreenInsets";
import { hapticWarning } from "@/lib/haptics";

/**
 * Sayfa genişliği PENCEREDEN okunuyor ve render sırasında okunmak ZORUNDA.
 *
 * Eskiden modül kapsamında `Dimensions.get("window")` ile bir kez alınıyordu, yani
 * JS paketi yüklenirken donuyordu. Uygulama portrait'e kilitli (app.json
 * orientation) ama Android'in çoklu pencere kipinde pencere genişliği değişiyor;
 * o durumda sayfalayıcının snap noktaları (getItemLayout + contentOffset hesabı)
 * gerçek genişlikle uyuşmayıp yana kaydırma yanlış kayda gidiyordu.
 *
 * Fotoğraf yüksekliği genişliğin 1.25 katı — oran korunuyor.
 */
const IMAGE_RATIO = 1.25;

/** Bir seti "60 kg × 8" biçiminde yazar; boş alanları atlar. */
function workoutSetLabel(s: { reps: number | null; weight: number | null }): string {
  const weight = s.weight != null ? `${s.weight} kg` : "";
  const reps = s.reps != null ? `${s.reps} tekrar` : "";
  if (weight && reps) return `${s.weight} kg × ${s.reps}`;
  return weight || reps || "—";
}

/* ---------------- TEK KAYIT SAYFASI ---------------- */

/**
 * Yatay sayfalayıcının tek bir sayfası. Üstteki geri/işlem butonları burada
 * DEĞİL — onlar ekran seviyesinde sabit duruyor, yoksa her sayfada bir kopyası
 * olur ve kaydırırken beraber kayarlardı.
 *
 * memo: her kaydırmada activeIndex state'i değişiyor ve ekran yeniden render
 * oluyor — memo olmadan monte 3 sayfanın hepsi (tam boy fotoğraf + ölçüm
 * listesi) her kaydırmada baştan çiziliyordu. entryId sabit string olduğu
 * için sayfalar artık tamamen atlanıyor.
 */
const EntryPage = memo(function EntryPage({
  entryId,
  screenWidth,
  onRequestDelete,
}: {
  entryId: string;
  screenWidth: number;
  /** Silme onayını ekran seviyesinde açar — mutation ve kutu orada yaşıyor. */
  onRequestDelete: (entryId: string) => void;
}) {
  const screen = useScreenInsets();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useEntryDetail(entryId);

  const photos = useMemo(() => data?.photos ?? [], [data?.photos]);
  const { activeId, active, setActiveId } = useActivePhoto(photos);

  const addPhotos = useAddEntryPhotos(entryId);
  const setCover = useSetCoverPhoto(entryId);
  const deletePhoto = useDeleteEntryPhoto(entryId);
  const busy = addPhotos.isPending || setCover.isPending || deletePhoto.isPending;

  async function handleAdd() {
    if (!user) return;
    const uris = await pickPhotosForEntry();
    if (uris.length === 0) return;
    addPhotos.mutate(
      { userId: user.id, uris },
      { onError: (err) => alertError("Fotoğraf eklenemedi", err, "photos.add") }
    );
  }

  // DİKKAT: Bu kaplarda `flex-1` KULLANILMAZ.
  // Yatay listede iç kap satır yönünde dizilir; orada `flex-1` (flexBasis: 0)
  // ana ekseni, yani GENİŞLİĞİ kontrol eder ve aşağıdaki sabit width'i ezer.
  // Sayfalar tek ekran genişliğine sıkışınca kaydırılacak içerik kalmaz ve
  // sayfalayıcı hiç çalışmaz. Yükseklik zaten yatay listenin varsayılan
  // `alignItems: stretch` davranışıyla geliyor, ayrıca vermeye gerek yok.

  if (isLoading) {
    return (
      <View style={{ width: screenWidth }} className="bg-bg justify-center items-center">
        <ActivityIndicator color="#8CE05A" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ width: screenWidth }} className="bg-bg justify-center items-center">
        <ErrorState error={error} onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView style={{ width: screenWidth }} className="bg-bg" bounces={false}>
      <View className="relative w-full" style={{ height: screenWidth * IMAGE_RATIO }}>
        {/* Şeritten seçilen fotoğraf; seçim yoksa kapak. */}
        {active?.url ? (
          <Image
            // cacheKey stabil storage yoluna bağlı — imzalı URL token'ı değişse de
            // (feed/ana ekranla aynı fotoğraf) cache isabet eder, yeniden indirmez.
            source={{ uri: active.url, cacheKey: photoCacheKey(active.path, "full") }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={active.path}
            transition={150}
          />
        ) : (
          <View className="w-full h-full bg-surface items-center justify-center">
            <Text className="text-textMuted text-base">Fotoğraf yok</Text>
          </View>
        )}
      </View>

      <EntryPhotoStrip
        photos={photos}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={handleAdd}
        onSetCover={(photoId) =>
          setCover.mutate(photoId, {
            onError: (err) => alertError("Kapak değiştirilemedi", err, "photos.setCover"),
          })
        }
        onDelete={(photoId, nextCoverId) =>
          deletePhoto.mutate(
            { photoId, nextCoverId },
            { onError: (err) => alertError("Fotoğraf silinemedi", err, "photos.delete") }
          )
        }
        busy={busy}
      />

      <View className="px-5 pt-6" style={{ paddingBottom: screen.bottom + 24 }}>
        <Text className="text-text text-3xl font-bold mb-6">
          {data?.date ? formatDateKey(data.date) : ""}
        </Text>

        {/* ÖLÇÜMLER — programla aynı kalıp: gördüğün şeye dokunup düzenliyorsun.
            Ölçümler zaten entry/edit ekranında düzenleniyor, ama oraya giden tek
            yol sağ üstteki işlem menüsüydü; kullanıcı değiştirmek istediği sayıya
            dokunmayı bekliyor. */}
        {data?.measurement_values?.length ? (
          <PressableFade
            onPress={() => router.push(`/entry/edit/${entryId}`)}
            accessibilityRole="button"
            accessibilityLabel="Ölçümleri düzenle"
            dim={0.85}
            className="bg-surface border border-border rounded-card p-4 mb-4"
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-textFaint text-sm font-semibold tracking-wide">ÖLÇÜMLER</Text>
              <Feather name="chevron-right" size={16} color="#8B8A82" />
            </View>
            {data.measurement_values.map((mv, i) => (
              <View key={i} className="flex-row justify-between py-2 gap-3">
                <Text className="text-textMuted text-base capitalize flex-1" numberOfLines={1}>
                  {mv.measurement_types?.name}
                </Text>
                <Text className="text-text text-base font-bold shrink-0">
                  {mv.value} {mv.measurement_types?.unit}
                </Text>
              </View>
            ))}
          </PressableFade>
        ) : null}

        {/* PROGRAM — hem gösterim hem DÜZENLEME kapısı.
            Eskiden salt okunurdu ve bu, programı düzenlemenin yolunu kapatıyordu:
            dayRoute fotoğraflı günleri buraya yönlendiriyor (hafta şeridi ve yıl
            takvimi dahil), ama buradan program ekranına hiçbir bağlantı yoktu.
            Tek dönüş yolu Anı Akışı'nda o kartı bulup çevirmekti. */}
        {data?.workout_items?.length ? (
          <PressableFade
            onPress={() => router.push(`/entry/program?date=${data.date}`)}
            accessibilityRole="button"
            accessibilityLabel="Antrenman programını düzenle"
            dim={0.85}
            className="bg-surface border border-border rounded-card p-4 mb-4"
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-textFaint text-sm font-semibold tracking-wide">
                ANTRENMAN PROGRAMI
              </Text>
              <Feather name="chevron-right" size={16} color="#8B8A82" />
            </View>
            {[...data.workout_items]
              .sort((a, b) => a.order_index - b.order_index)
              .map((wi, i) => {
                const sets = [...(wi.workout_sets ?? [])].sort(
                  (a, b) => a.order_index - b.order_index
                );
                return (
                  <View key={i} className={i > 0 ? "mt-3 pt-3 border-t border-border" : ""}>
                    <Text className="text-text text-base font-semibold capitalize mb-1">{wi.name}</Text>
                    {sets.length > 0 ? (
                      sets.map((s, j) => (
                        <View key={j} className="flex-row justify-between py-0.5">
                          <Text className="text-textFaint text-sm">{j + 1}. set</Text>
                          <Text className="text-textMuted text-base">{workoutSetLabel(s)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text className="text-textFaint text-sm">Set girilmemiş</Text>
                    )}
                  </View>
                );
              })}
          </PressableFade>
        ) : data ? (
          /* Programı OLMAYAN gün: eklemenin yolu da yoktu. Program ekranı ana
             ekrandan/istatistiklerden yalnızca BUGÜN için açılıyor, yani geçmiş
             bir güne program yazmak için tarih seçicisiyle uğraşmak gerekiyordu. */
          <PressableFade
            onPress={() => router.push(`/entry/program?date=${data.date}`)}
            accessibilityRole="button"
            accessibilityLabel="Bu güne antrenman programı ekle"
            dim={0.85}
            className="bg-surface border border-border rounded-card p-4 mb-4 flex-row items-center gap-3"
          >
            <View className="w-9 h-9 rounded-lg bg-accentSoft items-center justify-center">
              <Feather name="clipboard" size={18} color="#8CE05A" />
            </View>
            <View className="flex-1">
              <Text className="text-text text-base font-semibold">Antrenman programı</Text>
              <Text className="text-textFaint text-sm">Hareket ve setleri ekle</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#8B8A82" />
          </PressableFade>
        ) : null}

        {/* NOT da aynı kalıpta: üç kartın ikisi dokunulabilirken üçüncüsünün
            olmaması tutarsız olurdu. Hedef yine aynı düzenleme ekranı. */}
        {data?.note ? (
          <PressableFade
            onPress={() => router.push(`/entry/edit/${entryId}`)}
            accessibilityRole="button"
            accessibilityLabel="Notu düzenle"
            dim={0.85}
            className="bg-surface border border-border rounded-card p-4"
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-textFaint text-sm font-semibold tracking-wide">NOT</Text>
              <Feather name="chevron-right" size={16} color="#8B8A82" />
            </View>
            <Text className="text-text text-base leading-6">{data.note}</Text>
          </PressableFade>
        ) : null}

        {/* SİLME — sayfanın en dibinde, yıkıcı işlem rengiyle.
            Eskiden sağ üstteki üç nokta menüsündeydi. O menüde silmenin yanında
            "Düzenle" de vardı; düzenleme artık karta dokunarak yapıldığı için menü
            tek maddeye düşüyordu ve üstteki chrome'u boşuna dolduruyordu. Silme
            profildeki "Hesabı sil" ile aynı kalıba taşındı: liste dibinde, kırmızı,
            chevron'suz — yani yanlışlıkla basılacak bir yerde değil.
            entryId'yi doğrudan gönderiyoruz: silme, dokunulan SAYFANIN kaydına
            uygulanıyor, ekran seviyesindeki aktif indekse bağlı değil. */}
        <PressableFade
          onPress={() => onRequestDelete(entryId)}
          accessibilityRole="button"
          accessibilityLabel="Bu anıyı sil"
          dim={0.85}
          className="mt-6 flex-row items-center justify-center gap-2 py-4 rounded-button bg-danger"
        >
          {/* Dolu kırmızı zemin: ConfirmDialog'un onay düğmesiyle aynı kalıp
              (bg-danger + koyu metin). İkon ve yazı zeminle kontrast için
              bg rengine (#0B0D0A) çekiliyor — kırmızı üstünde kırmızı metin
              okunmuyor. */}
          <Feather name="trash-2" size={16} color="#0B0D0A" />
          <Text className="text-bg text-base font-semibold">Bu anıyı sil</Text>
        </PressableFade>
      </View>
    </ScrollView>
  );
});

/* ---------------- PAGE ---------------- */

export default function EntryDetail() {
  const screen = useScreenInsets();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams();

  const id = useMemo(() => {
    const raw = params.id;
    if (Array.isArray(raw)) return raw[0];
    return raw ?? "";
  }, [params.id]);

  const { data: orderIds, isLoading: orderLoading } = useEntryOrder();
  /**
   * Silme onayı bekleyen kaydın id'si (null = kutu kapalı).
   *
   * Eskiden yalnızca bir boolean vardı ve silme `activeId`'ye uygulanıyordu, yani
   * ekran seviyesindeki indeks senkronuna bağlıydı. Artık dokunulan sayfa kendi
   * id'sini gönderiyor — yanlış kaydı silme ihtimali yapısal olarak kapanıyor.
   */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Arama ya da yıllık takvimden açılan ESKİ bir kayıt son 60'ın dışında
  // kalabilir. O durumda tek sayfalık listeye düşüyoruz: yana kaydırma olmaz
  // ama ekran normal şekilde çalışmaya devam eder.
  const ids = useMemo(() => {
    if (!orderIds || !orderIds.includes(id)) return [id];
    return orderIds;
  }, [orderIds, id]);

  const initialIndex = Math.max(0, ids.indexOf(id));

  // DİKKAT: başlangıç değeri 0 DEĞİL initialIndex olmalı. Sıra verisi ilk
  // render'da hazırsa (cache'ten geldiğinde) aşağıdaki karşılaştırma hiç
  // tetiklenmez ve activeIndex 0'da kalır: sayfalayıcı doğru kayda kayar ama
  // üstteki "3/60" sayacı yanlış konumu gösterir. (Bu hata bir kez yaşandı:
  // useEffect'ten render sırasında senkronizasyona geçilirken mount anındaki
  // eşitleme kaybolmuştu.)
  //
  // Düzenleme ve silme artık bu indekse HİÇ bağlı değil — ikisi de sayfanın
  // kendi entryId'sinden gidiyor, yani indeks kaysa bile yanlış kayda işlem
  // yapılamıyor. Eskiden ikisi de `ids[activeIndex]` üzerinden çalışıyordu.
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Sıra verisi SONRADAN gelince (initialIndex değişince) aktif sayfayı eşitle.
  // Effect'te setState yapmak fazladan bir tam render turu demekti; React'in
  // "render sırasında önceki değerle karşılaştır" kalıbı aynı işi commit
  // öncesinde, tek geçişte yapıyor (react.dev: you-might-not-need-an-effect).
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  if (prevInitialIndex !== initialIndex) {
    setPrevInitialIndex(initialIndex);
    setActiveIndex(initialIndex);
  }

  const deleteMutation = useDeleteEntry();

  // Sabit referans: memo'lu EntryPage'e prop olarak iniyor.
  const requestDelete = useCallback((entryId: string) => setPendingDeleteId(entryId), []);

  /* ---------------- LOADING ---------------- */

  // Sırayı bekliyoruz: initialScrollIndex yalnızca ilk render'da uygulandığı
  // için liste hazır olmadan çizersek açılışta yanlış kayıtta başlardık.
  if (orderLoading) {
    return (
      <View className="flex-1 bg-bg justify-center items-center">
        <ActivityIndicator color="#8CE05A" size="large" />
      </View>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <>
    <View className="flex-1 bg-bg">
      <FlatList
        data={ids}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        // windowSize=3 → aynı anda en fazla 3 sayfa bağlı, bellek sınırlı kalıyor.
        // removeClippedSubviews BİLEREK kapalı: her sayfa kendi içinde bir
        // ScrollView ve bu kombinasyon Android'de sayfaları boş gösterebiliyor.
        windowSize={3}
        onMomentumScrollEnd={(e) =>
          setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth))
        }
        renderItem={({ item }) => (
          <EntryPage entryId={item} screenWidth={screenWidth} onRequestDelete={requestDelete} />
        )}
      />

      {/* Üst kontroller sayfalayıcının DIŞINDA: kaydırırken yerinde kalıyorlar.
          Dikey konum güvenli alandan geliyor: burası tam ekran bir sayfa, yani
          durum çubuğunun ARKASINA çiziyor ve sabit 56px, çentiği büyük
          cihazlarda butonları saatin üstüne bindiriyordu. Konum sarmalayıcı
          View'de duruyor çünkü fonksiyon-form style'a konan yerleşim
          özellikleri bu projede güvenilir çalışmıyordu — o kalıp artık
          PressableFade ile tamamen kalktı, konum yine de burada kalıyor. */}
      <View style={{ position: "absolute", top: screen.top, left: 16, zIndex: 10 }}>
        <PressableFade
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          dim={0.7}
          className="w-11 h-11 bg-black/40 rounded-full items-center justify-center"
        >
          <Feather name="chevron-left" size={22} color="#fff" />
        </PressableFade>
      </View>

      {/* Sayaç, yanlarda başka kayıt olduğunu belli ediyor — Anı Akışı'ndaki
          ile aynı desen. h-11 sayesinde üstteki butonlarla aynı hizada. */}
      {ids.length > 1 ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: screen.top, zIndex: 10 }}
          className="left-0 right-0 h-11 items-center justify-center"
        >
          <View className="bg-black/50 rounded-pill px-3 py-1">
            <Text className="text-text text-xs font-medium">
              {activeIndex + 1}/{ids.length}
            </Text>
          </View>
        </View>
      ) : null}

      {deleteMutation.isPending && (
        <View className="absolute inset-0 bg-black/50 items-center justify-center z-20">
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>

    <ConfirmDialog
      visible={pendingDeleteId !== null}
      icon="trash-2"
      danger
      title="Bu anıyı sil?"
      message="Bu işlem geri alınamaz, fotoğraf ve ölçümler kalıcı olarak silinir."
      confirmLabel="Sil"
      onConfirm={() => {
        const target = pendingDeleteId;
        setPendingDeleteId(null);
        if (!target) return;
        // Uyarı deseni (başarı değil): geri alınamaz bir işlem başlıyor.
        // Onay anında veriliyor, silme bitince değil — kullanıcı o an bir karar
        // verdi ve karşılığını hemen hissetmesi gerekiyor.
        hapticWarning();
        // Navigasyon ekranın işi — invalidation'lar hook'un içinde.
        // onError şart: hata olunca spinner kayboluyor, kayıt yerinde duruyor ve
        // kullanıcıya HİÇBİR şey söylenmiyordu — silme başarılı sanılıyordu.
        deleteMutation.mutate(target, {
          onSuccess: () => router.back(),
          onError: (err) => alertError("Anı silinemedi", err, "entry.delete"),
        });
      }}
      onClose={() => setPendingDeleteId(null)}
    />
    </>
  );
}
