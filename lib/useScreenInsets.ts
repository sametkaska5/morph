import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Ekran kenarlarındaki güvenli boşlukları tek yerden hesaplar.
 *
 * NEDEN GEREKLİ: app.json'da targetSdk 36. Android 15'ten itibaren bu,
 * uygulamanın edge-to-edge çizmesini ZORUNLU kılıyor — uygulama artık sistem
 * çubuklarının altında kalan alana değil ekranın tamamına çiziyor, durum
 * çubuğunun ve gezinme çubuğunun arkası dahil. Boşluğu bırakmak uygulamanın
 * sorumluluğunda ve devre dışı bırakılamıyor.
 *
 * Sabit sayı (eskiden her ekranda `paddingTop: 56` / `paddingBottom: 32`)
 * bunu karşılamıyor: 3 tuşlu gezinme çubuğu ~48px yer kaplarken jest çubuğu
 * ~16px kaplıyor, çentikli cihazlarda durum çubuğu 56px'i aşabiliyor. Sonuç,
 * bazı cihazlarda kaydet düğmesinin gezinme çubuğunun arkasında kalmasıydı.
 *
 * Sekme çubuğu olan ekranlarda ALT boşluğa gerek yok — (tabs)/_layout.tsx
 * sekme çubuğunun kendisine zaten insets.bottom ekliyor ve çubuk normal akışta
 * duruyor, yani ekran alanı onun üstünde bitiyor. Oralarda yalnızca `top`
 * kullanılmalı.
 */

/** Tasarım sisteminin modal/push ekranlar için belirlediği üst boşluk. */
const DESIGN_TOP = 56;

/** Güvenli alan 56'yı aştığında başlıkla çentik arasında kalması gereken pay. */
const TOP_GAP = 12;

/** İçeriğin bittiği yerle sistem çubuğu arasındaki nefes payı. */
const BOTTOM_GAP = 24;

export function useScreenInsets() {
  const insets = useSafeAreaInsets();

  return {
    /**
     * Ekranın üst boşluğu. Güvenli alan küçükse tasarımdaki 56px korunuyor —
     * amaç mevcut görünümü bozmadan yalnızca taşmayı engellemek.
     */
    top: Math.max(DESIGN_TOP, insets.top + TOP_GAP),

    /** Kaydırılabilir içeriğin alt boşluğu (sekme çubuğu OLMAYAN ekranlar için). */
    bottom: insets.bottom + BOTTOM_GAP,

    /**
     * Ham güvenli alan. Ekrana sabitlenmiş alt çubuklarda (örn. compare/pick'in
     * "Karşılaştır" düğmesi) kendi iç boşluğunun ÜSTÜNE eklemek için — oralarda
     * BOTTOM_GAP iki kez sayılmış olurdu.
     */
    insets,
  };
}
