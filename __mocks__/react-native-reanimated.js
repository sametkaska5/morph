/**
 * react-native-reanimated için elle yazılmış Jest taklidi.
 *
 * NEDEN RESMİ MOCK DEĞİL: reanimated 4'ün kendi `react-native-reanimated/mock`
 * dosyası, gerçek `react-native-reanimated/src/index`'i içe aktarıyor; o da
 * `react-native-worklets`'i yüklüyor ve worklets JSI native modülü Jest'te
 * olmadığı için import ANINDA "Cannot read properties of undefined (reading
 * 'loadUnpackers')" ile patlıyor. Yani resmi mock bu sürümde kullanılamıyor.
 *
 * Bu taklit animasyonları anlık hâle getiriyor: paylaşılan değerler düz obje,
 * `withTiming`/`withSpring` hedef değeri doğrudan döndürüyor. Testler animasyon
 * SÜRECİNİ değil, animasyonun bittiği durumdaki görünümü doğruluyor.
 *
 * Uygulamanın kullandığı yüzey küçük (Animated.View, useSharedValue,
 * useAnimatedStyle, withTiming, withSpring, runOnJS) — yeni bir API kullanılırsa
 * buraya da eklenmeli, aksi halde test "undefined is not a function" der.
 */
const React = require("react");
const { View, Text, ScrollView, Image } = require("react-native");

const passthrough = (value) => value;

/** Callback alan varyantlar (withTiming(v, cfg, cb)) callback'i hemen çağırır. */
function withAnimation(toValue, _config, callback) {
  if (typeof callback === "function") callback(true);
  return toValue;
}

const Animated = {
  View,
  Text,
  ScrollView,
  Image,
  createAnimatedComponent: (Component) => Component,
};

module.exports = {
  __esModule: true,
  default: Animated,
  // Paylaşılan değer: gerçek implementasyonda .value yazımı worklet'e gider,
  // burada düz bir obje yeterli.
  useSharedValue: (initial) => React.useRef({ value: initial }).current,
  // Stil fonksiyonunu render sırasında çalıştırıp sonucunu veriyoruz —
  // böylece son durumdaki stil test edilebiliyor.
  useAnimatedStyle: (styleFactory) => styleFactory(),
  useDerivedValue: (factory) => ({ value: factory() }),
  withTiming: withAnimation,
  withSpring: withAnimation,
  withDelay: (_delay, animation) => animation,
  withSequence: (...animations) => animations[animations.length - 1],
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  cancelAnimation: () => {},
  interpolate: passthrough,
  Easing: { linear: passthrough, ease: passthrough, bezier: () => passthrough },
};
