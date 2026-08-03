import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Cihazda "hareketi azalt" açık mı.
 *
 * Bu tercihi açan kullanıcılar için hareket bir süs değil rahatsızlık kaynağı
 * (vestibüler bozukluk, migren). Izgaradaki yaprak animasyonu bu durumda hiç
 * oynamıyor — kapağın arkasındaki sabit yaprak kenarları zaten "burada birden
 * fazla fotoğraf var" bilgisini tek başına taşıyor, yani bilgi kaybı olmuyor.
 */
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });

    // Kullanıcı ayarı uygulama açıkken de değiştirebilir.
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}
