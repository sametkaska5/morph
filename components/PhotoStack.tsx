import { useEffect } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { photoCacheKey } from "@/lib/storage";
import type { BackPhoto } from "@/lib/entries";

/**
 * Izgara kartında kapağın ARKASINDAKİ yapraklar — plak sandığında öndeki kabı
 * eğip arkadakilere bakmak gibi.
 *
 * İki ayrı şey yapıyor ve ikisi bilerek ayrı:
 *
 *  1. SABİT yaprak kenarları. Çoklu günlerde her zaman görünür. Tek ipucu
 *     animasyon olsaydı, o bir saniyeye denk gelmeyen kullanıcı o günde birden
 *     fazla fotoğraf olduğunu hiç öğrenemezdi.
 *  2. ANLIK açılma. Yapraklar bir saniye kadar dışarı çıkıp geri kapanıyor.
 *     Kart ekrana ilk girdiğinde bir kez, sonra her dokunuşta.
 *
 * "Hareketi azalt" açıkken yalnızca (1) kalıyor.
 */

/** Yaprakların kapalı hâlde dışarı taşma miktarı (pt) ve açılınca gittiği yer. */
const RESTING_OFFSET = 3;
const PEEK_OFFSET = 13;
const RESTING_ROTATION = 1.5;
const PEEK_ROTATION = 7;

/** Bir yaprağın açılıp kapanma süresi ve yapraklar arası gecikme. */
const OPEN_MS = 260;
const HOLD_MS = 180;
const CLOSE_MS = 320;
const STAGGER_MS = 90;

const LEAF_STYLE = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  overflow: "hidden",
  borderRadius: 10,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)", // tailwind: border
  backgroundColor: "#12140D", // tailwind: surface
} as const;

function Leaf({
  photo,
  index,
  progress,
}: {
  photo: BackPhoto;
  index: number;
  progress: SharedValue<number>;
}) {
  // Derinlik sırası: index 0 kapağa en yakın yaprak. Arkadakiler daha çok
  // taşıyor ve daha çok dönüyor ki üst üste binmiş bir deste hissi versin.
  const depth = index + 1;

  const style = useAnimatedStyle(() => {
    const offset = RESTING_OFFSET * depth + (PEEK_OFFSET - RESTING_OFFSET) * depth * progress.value;
    const rotation =
      RESTING_ROTATION * depth + (PEEK_ROTATION - RESTING_ROTATION) * depth * progress.value;
    return {
      transform: [
        { translateX: offset },
        { translateY: -offset * 0.4 },
        { rotate: `${rotation}deg` },
      ],
    };
  });

  return (
    <Animated.View
      // Yapraklar dekoratif: ekran okuyucu kartın kendi etiketini okumalı,
      // arkadaki görselleri ayrı ayrı değil.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      // Bilerek className YOK, hepsi düz stil: bu projede className ile
      // fonksiyon/dizi biçimli style birlikte verildiğinde stillerin sessizce
      // düştüğü defalarca görüldü (bkz. ErrorState.tsx ve calendar-year.tsx).
      // Renkler tailwind.config.js'teki surface/border ile birebir aynı.
      style={[LEAF_STYLE, { zIndex: -depth }, style]}
    >
      <Image
        source={{ uri: photo.url, cacheKey: photoCacheKey(photo.path) }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={photo.path}
      />
    </Animated.View>
  );
}

export function PhotoStack({
  photos,
  peekToken,
  reduceMotion,
  staggerIndex = 0,
  children,
}: {
  photos: BackPhoto[];
  /**
   * Her değiştiğinde açılma bir kez oynar. Sayaç kullanmak "görünür oldu" ve
   * "basıldı" tetikleyicilerini tek bir yoldan geçiriyor — iki ayrı boolean
   * olsaydı ikisi aynı anda gelince animasyon kendi kendini kesecekti.
   */
  peekToken: number;
  reduceMotion: boolean;
  /** Aynı anda görünür olan kartlar peş peşe açılsın diye kademeli gecikme. */
  staggerIndex?: number;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (peekToken === 0 || reduceMotion || photos.length === 0) return;
    progress.value = withDelay(
      Math.min(staggerIndex, 5) * STAGGER_MS,
      withSequence(
        withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }),
        withDelay(
          HOLD_MS,
          withTiming(0, { duration: CLOSE_MS, easing: Easing.inOut(Easing.quad) }),
        ),
      ),
    );
  }, [peekToken, reduceMotion, photos.length, staggerIndex, progress]);

  if (photos.length === 0) return <>{children}</>;

  return (
    <View>
      {/* Yapraklar önce, kapak sonra: kapak DOM sırasında üstte kalmalı. */}
      {photos.map((photo, i) => (
        <Leaf key={photo.path} photo={photo} index={i} progress={progress} />
      ))}
      {children}
    </View>
  );
}
