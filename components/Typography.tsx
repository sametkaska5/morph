import { Text as RNText, TextInput as RNTextInput } from "react-native";
import type { ComponentProps, ComponentRef, Ref } from "react";

/**
 * Uygulamanın varsayılan fontunu (Inter) uygulayan Text / TextInput sarmalayıcıları.
 *
 * Neden gerekiyor: eskiden bu iş app/_layout.tsx'te `Text.defaultProps` ile
 * yapılıyordu. React 19 fonksiyon bileşenlerinde defaultProps desteğini kaldırdı ve
 * RN 0.86'da Text düz bir fonksiyon bileşeni — yani o atama sessizce hiçbir işe
 * yaramıyordu. font-* sınıfı olmayan her metin cihazın sistem fontuna (SF Pro /
 * Roboto) düşüyordu. Bu yüzden varsayılanı bileşen seviyesine taşıdık.
 *
 * Neden style değil de className: NativeWind'de inline `style` prop'u className'den
 * DAHA yüksek öncelikli. Varsayılan fontu style ile verseydik, uygulamadaki her
 * `font-bold` / `font-semibold` sınıfını ezip hepsini Regular'a düşürürdü. Bunun
 * yerine className'in başına `font-normal` ekliyoruz: aynı özgüllükte iki utility
 * çakıştığında stylesheet'te SONRA gelen kazanır ve tailwind.config.js'teki plugin
 * bunları normal → medium → semibold → bold sırasıyla tanımlıyor. Yani çağıran
 * tarafta font-bold varsa o kazanmaya devam ediyor, hiçbir şey yoksa Inter Regular
 * devreye giriyor.
 */
const BASE_FONT_CLASS = "font-normal";

function withBaseFont(className?: string) {
  return className ? `${BASE_FONT_CLASS} ${className}` : BASE_FONT_CLASS;
}

// React 19'da `ref` fonksiyon bileşenleri için normal bir prop — {...props} ile
// olduğu gibi aşağı geçiyor. Tip tarafında ComponentProps ref'i içermediği için
// elle ekliyoruz, yoksa çağıran taraftaki ref'ler tip hatası veriyor.
type TextProps = ComponentProps<typeof RNText> & { ref?: Ref<ComponentRef<typeof RNText>> };
type TextInputProps = ComponentProps<typeof RNTextInput> & {
  ref?: Ref<ComponentRef<typeof RNTextInput>>;
};

export function Text({ className, ...props }: TextProps) {
  return <RNText className={withBaseFont(className)} {...props} />;
}

export function TextInput({ className, ...props }: TextInputProps) {
  return <RNTextInput className={withBaseFont(className)} {...props} />;
}

/**
 * Ekranlar `useRef<TextInput | null>(null)` gibi kullanımlarda TextInput'u TİP olarak
 * da istiyor (RN'in kendi TextInput'u hem değer hem tip olduğu için eskiden çalışıyordu).
 * Aynı isimde bir tip diğer adı veriyoruz — değer ve tip ayrı bildirim alanlarında
 * yaşadığı için yukarıdaki fonksiyonla çakışmıyor.
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare -- bilinçli değer+tip ikilisi (yukarıdaki açıklama)
export type Text = ComponentRef<typeof RNText>;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- bilinçli değer+tip ikilisi (yukarıdaki açıklama)
export type TextInput = ComponentRef<typeof RNTextInput>;
