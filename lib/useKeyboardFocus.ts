import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type TextInput,
} from "react-native";

/**
 * Odaklanan alan, görünür alanın üstünden bu kadar aşağıda konumlanır (pt).
 * Alanın kendisinin ve bir miktar bağlamın (satır adı, kart başlığı) görünmesini
 * sağlayacak kadar; klavyenin çok üstünde kalması için yeterince küçük.
 */
const TOP_MARGIN = 100;

/**
 * Odaklanan alanı kendiliğinden görünür alanın üst kısmına kaydıran yardımcı.
 *
 * Neden gerekli: ölçüm alanları `decimal-pad` klavyesi kullanıyor ve bu klavyede
 * "next"/return tuşu yok — alanlar arası geçiş chevron butonuyla, yani
 * programatik `focus()` ile yapılıyor. Klavye zaten açıkken odak değiştiğinde
 * hiçbir klavye olayı tetiklenmiyor, dolayısıyla klavye olaylarına bağlı çalışan
 * hazır çözümler (react-native-keyboard-aware-scroll-view dahil) bu durumda hiç
 * kaydırmıyor. O paket ayrıca bakımsız ve RN 0.86'nın yeni mimarisinde
 * scrollToFocusedInput sessizce çalışmıyor.
 *
 * Nasıl çalışıyor: alanın ekrandaki konumunu `measureInWindow` ile ölçüp, onu
 * görünür alanın üstünden TOP_MARGIN kadar aşağıya getirecek kadar kaydırıyoruz.
 * Kasıtlı olarak klavye yüksekliği hesabı YOK — o yol platformlar arasında
 * (iOS vs Android edge-to-edge) farklı davrandığı için güvenilmez çıktı. Alanı
 * ekranın üst kısmına çekmek, klavye ne kadar yer kaplarsa kaplasın alanın
 * üstünde kalmasını garantiliyor.
 *
 * Kullanım:
 *   const { scrollRef, onScroll, keyboardPadding, revealField } = useKeyboardFocus();
 *   <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16}
 *     contentContainerStyle={{ paddingBottom: 20 + keyboardPadding }}>
 *   ...
 *   <TextInput ref={el} onFocus={() => revealField(el)} />
 */
export function useKeyboardFocus() {
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);
  /** Son odaklanan alan — klavye açılıp alt boşluk eklendikten sonra yeniden hizalamak için. */
  const lastFocused = useRef<TextInput | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const revealField = useCallback((el: TextInput | null) => {
    const scroller = scrollRef.current;
    if (!el || !scroller) return;

    lastFocused.current = el;

    // measureInWindow bilerek tercih edildi: measureLayout yeni mimaride ikinci
    // argüman olarak gerçek bir native component ref'i istiyor ve ScrollView'un
    // getInnerViewNode() değeri bunu karşılamıyor ("must be called with a ref to
    // a native component"). measureInWindow ise ref argümanı almıyor.
    el.measureInWindow((_x, fieldY) => {
      // Alan şu an ekranda fieldY'de; onu ekranın üstünden TOP_MARGIN kadar
      // aşağıya getirmek için aradaki farkı kaydırmak yeterli. Bu ekranlarda
      // ScrollView tüm ekranı kapladığı için ekran koordinatı = görünür alan
      // koordinatı; klavye yüksekliği hesabına hiç girmiyoruz.
      const delta = fieldY - TOP_MARGIN;

      // Sadece AŞAĞIDAKİ alanları yukarı çekiyoruz. Zaten üstte olan bir alana
      // odaklanıldığında ekranı geri sarmak sıçrama hissi verirdi.
      if (delta > 1) {
        scroller.scrollTo({ y: scrollY.current + delta, animated: true });
      }
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      // Klavye ilk açıldığında alt boşluk (keyboardPadding) yeni uygulanıyor;
      // kaydırılabilir alan büyüdükten SONRA tekrar hizalamak gerekiyor, yoksa
      // en alttaki alanlar için kaydırma sınıra takılıp yetersiz kalıyor.
      const el = lastFocused.current;
      if (el) setTimeout(() => revealField(el), 80);
    });

    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      lastFocused.current = null;
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [revealField]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  return {
    scrollRef,
    onScroll,
    revealField,
    /**
     * contentContainerStyle'ın altına eklenecek boşluk. Bu olmazsa en alttaki
     * alanlar için kaydırılacak yer kalmaz ve scrollTo sınıra takılır.
     * Her iki platformda da ekliyoruz: Android'de "adjustResize" pencereyi
     * küçültüyor sanılabilir ama Expo SDK 54+ ile edge-to-edge varsayılan
     * olduğundan artık küçültmüyor.
     */
    keyboardPadding: keyboardHeight,
  };
}
