import { useState, useEffect, useRef, useCallback } from "react";
import { View, Pressable, Animated, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { theme } from "@/lib/theme";
import { Text } from "@/components/Typography";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { markOnboardingSeen } from "@/lib/onboarding";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [progressAnim] = useState(() => new Animated.Value(0));
  const progressValue = useRef(0);
  const [isPaused, setIsPaused] = useState(false);
  const pressInTime = useRef(0);

  useEffect(() => {
    const listener = progressAnim.addListener(({ value }) => {
      progressValue.current = value;
    });
    return () => progressAnim.removeListener(listener);
  }, [progressAnim]);

  useEffect(() => {
    progressValue.current = 0;
    progressAnim.setValue(0);
  }, [step, progressAnim]);

  const handleSkipOrFinish = useCallback(async () => {
    await markOnboardingSeen();
    router.replace("/(auth)");
  }, []);

  const handleNext = useCallback(() => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleSkipOrFinish();
    }
  }, [step, handleSkipOrFinish]);

  const handlePrev = useCallback(() => {
    if (step > 1) {
      setStep(step - 1);
    }
  }, [step]);

  useEffect(() => {
    if (step === 0) {
      const t = setTimeout(() => {
        setStep(1);
      }, 2500); // 2.5 saniye sonra ilk adima gec
      return () => clearTimeout(t);
    } else {
      if (!isPaused) {
        const remainingDuration = (1 - progressValue.current) * 3500;
        const anim = Animated.timing(progressAnim, {
          toValue: 1,
          duration: remainingDuration, // Kalan sure kadar
          useNativeDriver: false,
        });
        
        anim.start(({ finished }) => {
          if (finished) {
            handleNext();
          }
        });

        return () => anim.stop();
      } else {
        progressAnim.stopAnimation();
      }
    }
  }, [step, isPaused, progressAnim, handleNext]); // dependencies eklendi

  if (step === 0) {
    return (
      <Pressable 
        className="flex-1 bg-bg items-center justify-center relative overflow-hidden" 
        onPress={() => setStep(1)}
      >
        {/* Koselerdeki yesil parlamalar (Basit opacity ile) */}
        <View className="absolute -top-24 -right-24 w-[350px] h-[350px] rounded-full bg-accent opacity-[0.08]" />
        <View className="absolute -bottom-24 -left-24 w-[350px] h-[350px] rounded-full bg-accent opacity-[0.08]" />
        <View className="absolute -top-12 -right-12 w-[200px] h-[200px] rounded-full bg-accent opacity-[0.12]" />
        <View className="absolute -bottom-12 -left-12 w-[200px] h-[200px] rounded-full bg-accent opacity-[0.12]" />
        
        {/* Logo ve Yazi */}
        <View className="items-center z-10 mt-10">
          <Image source={require('@/assets/images/icon.png')} style={{ width: 110, height: 110 }} contentFit="contain" />
          <Text className="text-white text-[42px] font-bold mt-4 tracking-[0.15em] uppercase">Morph</Text>
          <Text className="text-textMuted text-lg mt-3">See how you change.</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View 
      className="flex-1 bg-bg relative" 
      style={{ paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 24) }}
    >
      {/* Background for Step 3 */}
      {step === 3 && (
        <Image 
          source={{ uri: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80" }} 
          style={[StyleSheet.absoluteFill, { opacity: 0.15 }]} 
          contentFit="cover" 
        />
      )}

      {/* Touch zones for left/right tap navigation */}
      <View className="absolute inset-0 flex-row" style={{ zIndex: 10 }}>
        <Pressable 
          className="flex-1" 
          onPressIn={() => {
            pressInTime.current = Date.now();
            setIsPaused(true);
          }}
          onPressOut={() => {
            setIsPaused(false);
            if (Date.now() - pressInTime.current < 250) {
              handlePrev();
            }
          }}
        />
        <Pressable 
          className="flex-[2]" 
          onPressIn={() => {
            pressInTime.current = Date.now();
            setIsPaused(true);
          }}
          onPressOut={() => {
            setIsPaused(false);
            if (Date.now() - pressInTime.current < 250) {
              handleNext();
            }
          }}
        />
      </View>

      {/* Top Bar */}
      <View className="flex-row items-center px-6 pt-4 pb-2 relative" style={{ zIndex: 20 }} pointerEvents="box-none">
        <Text className="text-textMuted text-sm font-medium w-8">{step}/3</Text>
        
        <View className="flex-1 flex-row mx-4 gap-1" pointerEvents="auto">
          {[1, 2, 3].map((i) => {
            let widthVal: string | Animated.AnimatedInterpolation<string> = "0%";
            if (i < step) widthVal = "100%";
            else if (i === step) widthVal = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
            else widthVal = "0%";

            return (
              <Pressable 
                key={i} 
                onPress={() => setStep(i)} 
                className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden relative"
                hitSlop={{ top: 15, bottom: 15 }}
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Animated.View style={{ width: widthVal as any, height: '100%', backgroundColor: theme.colors.accent, position: 'absolute', left: 0 }} />
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={handleSkipOrFinish} className="w-8 items-end" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} pointerEvents="auto">
          <Text className="text-textMuted text-sm font-medium">Atla</Text>
        </Pressable>
      </View>

      {/* Content Area */}
      <View className="flex-1 px-6 mt-8 relative" style={{ zIndex: 5 }} pointerEvents="none">
        {step === 1 && (
          <>
            <Text className="text-text text-[40px] font-bold leading-[44px] tracking-tight">
              Zaman{"\n"}değiştirir.
            </Text>
            <Text className="text-textMuted text-base mt-4 leading-6">
              Değişimini kaydet ve zamanla nasıl ilerlediğini gör.
            </Text>

            {/* Polaroids Container */}
            <View className="flex-1 items-center justify-center mt-8 mb-4 relative">
              <View 
                className="absolute w-52 h-72 bg-[#9CA3AF] rounded-lg p-3 shadow-lg"
                style={{ transform: [{ rotate: '12deg' }, { translateX: 30 }, { translateY: 20 }], zIndex: 1 }}
              >
                <View className="flex-1 bg-[#374151] rounded-md mb-3 overflow-hidden">
                   <Image source={{ uri: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=500&q=80" }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
                <Text className="text-[#1F2937] text-xs font-semibold">10 Eylül 2024</Text>
              </View>

              <View 
                className="absolute w-52 h-72 bg-[#D1D5DB] rounded-lg p-3 shadow-lg"
                style={{ transform: [{ rotate: '4deg' }, { translateX: 15 }, { translateY: 10 }], zIndex: 2 }}
              >
                <View className="flex-1 bg-[#4B5563] rounded-md mb-3 overflow-hidden">
                   <Image source={{ uri: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=500&q=80" }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
                <Text className="text-[#111827] text-xs font-semibold">6 Eylül 2024</Text>
              </View>

              <View 
                className="absolute w-52 h-72 bg-white rounded-lg p-3 shadow-xl border border-gray-200"
                style={{ transform: [{ rotate: '-6deg' }], zIndex: 3 }}
              >
                <View className="flex-1 bg-surface rounded-md mb-3 overflow-hidden">
                   <Image source={{ uri: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=500&q=80" }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
                <Text className="text-black text-xs font-semibold">3 Eylül 2024</Text>
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text className="text-text text-[40px] font-bold leading-[44px] tracking-tight">
              Verilerle{"\n"}daha fazlası.
            </Text>
            <Text className="text-textMuted text-base mt-4 leading-6">
              Fotoğraflarını ölçümlerle birleştir,{"\n"}ilerlemeni grafiklerle takip et.
            </Text>

            {/* Dashboard Mock Container */}
            <View className="flex-1 mt-6 mb-2 gap-3" pointerEvents="none">
              {/* Chart Card */}
              <View className="bg-[#111] rounded-[28px] border border-white/5 p-5 relative overflow-hidden">
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-baseline gap-2">
                    <Text className="text-white font-bold text-3xl">68 <Text className="text-textMuted text-base font-normal">kg</Text></Text>
                    <Text className="text-[#ff5e5e] text-sm font-semibold tracking-wide">↑ 8 kg</Text>
                  </View>
                  <Feather name="maximize-2" size={18} color={theme.colors.textMuted} />
                </View>

                {/* SVG Wavy Chart */}
                <View className="h-[120px] w-full relative mt-2 -ml-2">
                  <Svg height="100%" width="100%" viewBox="0 0 400 120">
                    <Defs>
                      <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={theme.colors.accent} stopOpacity="0.4" />
                        <Stop offset="1" stopColor={theme.colors.accent} stopOpacity="0.0" />
                      </LinearGradient>
                    </Defs>
                    
                    {/* The Wavy Path */}
                    <Path 
                      d="M 10 30 C 50 30, 70 100, 110 100 C 140 100, 160 30, 190 30 C 220 30, 240 110, 270 110 C 300 110, 310 65, 340 65 L 380 60"
                      fill="none"
                      stroke={theme.colors.accent}
                      strokeWidth="3"
                    />

                    {/* Gradient under path */}
                    <Path 
                      d="M 10 30 C 50 30, 70 100, 110 100 C 140 100, 160 30, 190 30 C 220 30, 240 110, 270 110 C 300 110, 310 65, 340 65 L 380 60 L 380 120 L 10 120 Z"
                      fill="url(#grad)"
                    />

                    {/* Dots */}
                    <Circle cx="10" cy="30" r="4" fill={theme.colors.accent} stroke="#111" strokeWidth="1.5" />
                    <Circle cx="70" cy="73" r="4" fill={theme.colors.accent} stroke="#111" strokeWidth="1.5" />
                    <Circle cx="110" cy="100" r="4" fill={theme.colors.accent} stroke="#111" strokeWidth="1.5" />
                    <Circle cx="190" cy="30" r="4" fill={theme.colors.accent} stroke="#111" strokeWidth="1.5" />
                    <Circle cx="270" cy="110" r="4" fill={theme.colors.accent} stroke="#111" strokeWidth="1.5" />
                    <Circle cx="340" cy="65" r="4" fill={theme.colors.accent} stroke="#111" strokeWidth="1.5" />
                    <Circle cx="380" cy="60" r="5" fill="#111" stroke={theme.colors.accent} strokeWidth="3" />
                  </Svg>
                  
                  {/* Vertical dashed line for the last point */}
                  <View className="absolute w-[1px] bg-accent/40" style={{ height: 110, top: 0, right: '3%', borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(200,255,100,0.3)' }} />

                  {/* Tooltip */}
                  <View className="absolute right-[5%] top-[20px] bg-[#111] border border-accent/50 rounded-xl px-4 py-2 items-center shadow-lg shadow-accent/10">
                    <Text className="text-textMuted text-[10px] mb-0.5 font-medium">1 Ağu</Text>
                    <Text className="text-white text-sm font-bold">68 kg</Text>
                  </View>
                </View>
              </View>

              {/* Streak Card */}
              <View className="bg-[#151515] rounded-[28px] border border-white/5 p-4 mt-1 flex-1">
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center gap-3">
                    {/* Alev/Şimşek kutusu - Glow efekti eklendi */}
                    <View className="w-11 h-11 rounded-[14px] bg-[#3A1810] items-center justify-center shadow-[0_0_20px_rgba(255,90,0,0.6)] border border-orange-500/20">
                      <FontAwesome5 name="fire" size={22} color="#FF6B00" />
                    </View>
                    <View>
                      <Text className="text-white font-bold text-base mb-0.5">119 gün üst üste</Text>
                      <Text className="text-textMuted text-[11px]">Bu Hafta</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="share-2" size={15} color={theme.colors.accent} />
                    <Text className="text-accent text-[11px] font-bold">Yıla Göre Gör {">"}</Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between px-2 mb-4">
                  <Feather name="chevron-left" size={16} color={theme.colors.textFaint} />
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-white text-sm font-semibold">14 - 20 Eylül</Text>
                    <Feather name="rotate-cw" size={14} color={theme.colors.accent} />
                  </View>
                  <Feather name="chevron-right" size={16} color={theme.colors.textFaint} />
                </View>

                <View className="flex-row items-center justify-between px-1 mt-auto">
                  {/* P: Moon solid */}
                  <View className="items-center gap-1.5">
                    <View className="w-10 h-10 rounded-[12px] border border-[#6B728E] bg-[#2C2C35] items-center justify-center">
                      <Feather name="moon" size={16} color="#A5A9C0" />
                    </View>
                    <Text className="text-textFaint text-[9px] font-bold">P</Text>
                  </View>
                  {/* S: Lightning green solid */}
                  <View className="items-center gap-1.5">
                    <View className="w-10 h-10 rounded-[12px] bg-accent items-center justify-center shadow-[0_0_10px_rgba(200,255,100,0.3)]">
                      <Feather name="zap" size={18} color="#111" />
                    </View>
                    <Text className="text-textFaint text-[9px] font-bold">S</Text>
                  </View>
                  {/* Ç: Lightning green solid */}
                  <View className="items-center gap-1.5">
                    <View className="w-10 h-10 rounded-[12px] bg-accent items-center justify-center shadow-[0_0_10px_rgba(200,255,100,0.3)]">
                      <Feather name="zap" size={18} color="#111" />
                    </View>
                    <Text className="text-textFaint text-[9px] font-bold">Ç</Text>
                  </View>
                  {/* P: Check green solid */}
                  <View className="items-center gap-1.5">
                    <View className="w-10 h-10 rounded-[12px] border border-accent bg-accent/5 items-center justify-center">
                      <Feather name="check" size={18} color={theme.colors.accent} />
                    </View>
                    <Text className="text-textFaint text-[9px] font-bold">P</Text>
                  </View>
                  {/* C: Moon dashed */}
                  <View className="items-center gap-1.5">
                    <View className="w-10 h-10 rounded-[12px] border border-[#6B728E] border-dashed bg-[#1C1C22] items-center justify-center">
                      <Feather name="moon" size={16} color="#6B728E" />
                    </View>
                    <Text className="text-textFaint text-[9px] font-bold">C</Text>
                  </View>
                  {/* C: Check green solid */}
                  <View className="items-center gap-1.5">
                    <View className="w-10 h-10 rounded-[12px] border border-accent bg-accent/5 items-center justify-center">
                      <Feather name="check" size={18} color={theme.colors.accent} />
                    </View>
                    <Text className="text-textFaint text-[9px] font-bold">C</Text>
                  </View>
                  {/* P: Check dashed */}
                  <View className="items-center gap-1.5">
                    <View className="w-10 h-10 rounded-[12px] border border-accent border-dashed items-center justify-center">
                      <Feather name="check" size={18} color={theme.colors.accent} />
                    </View>
                    <Text className="text-textFaint text-[9px] font-bold">P</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}
        
        {step === 3 && (
          <>
            <Text className="text-text text-[40px] font-bold leading-[44px] tracking-tight">
              Kendi yolculuğunu{"\n"}kontrol et.
            </Text>
            <Text className="text-textMuted text-base mt-4 leading-6">
              Antrenmanlarını, ölçümlerini,{"\n"}notlarını ve hatırlatıcılarını tek yerde{"\n"}yönet.
            </Text>

            <View className="flex-1 mt-10 gap-8">
              <View className="flex-row items-center gap-5">
                <View className="w-14 h-14 rounded-full border border-accent/30 bg-accent/10 items-center justify-center shadow-lg">
                  <Feather name="clock" size={24} color={theme.colors.accent} />
                </View>
                <View>
                  <Text className="text-text text-lg font-medium">Antrenman Programı</Text>
                  <Text className="text-textMuted text-sm mt-1">Set, tekrar, ilerleme</Text>
                </View>
              </View>

              <View className="flex-row items-center gap-5">
                <View className="w-14 h-14 rounded-full border border-accent/30 bg-accent/10 items-center justify-center shadow-lg">
                  <Feather name="activity" size={24} color={theme.colors.accent} />
                </View>
                <View>
                  <Text className="text-text text-lg font-medium">Ölçümler</Text>
                  <Text className="text-textMuted text-sm mt-1">Kilo, bel, yağ oranı vb.</Text>
                </View>
              </View>

              <View className="flex-row items-center gap-5">
                <View className="w-14 h-14 rounded-full border border-accent/30 bg-accent/10 items-center justify-center shadow-lg">
                  <Feather name="bell" size={24} color={theme.colors.accent} />
                </View>
                <View>
                  <Text className="text-text text-lg font-medium">Hatırlatıcılar</Text>
                  <Text className="text-textMuted text-sm mt-1">Geçmişin seni bekliyor</Text>
                </View>
              </View>

              <View className="flex-row items-center gap-5">
                <View className="w-14 h-14 rounded-full border border-accent/30 bg-accent/10 items-center justify-center shadow-lg">
                  <Feather name="cloud" size={24} color={theme.colors.accent} />
                </View>
                <View>
                  <Text className="text-text text-lg font-medium">Çevrimdışı Kullanım</Text>
                  <Text className="text-textMuted text-sm mt-1">Her zaman, her yerde</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Bottom Pagination & Next Button */}
      <View className="flex-row items-center justify-between px-6 pb-6 pt-4 relative" style={{ zIndex: 20 }} pointerEvents="box-none">
        <View className="flex-row gap-2 pl-2">
          {[1, 2, 3].map((i) => (
            <View 
              key={i} 
              className={`w-2 h-2 rounded-full ${i === step ? "bg-accent" : "bg-surface"}`} 
            />
          ))}
        </View>

        <Pressable 
          onPress={handleNext}
          className="w-14 h-14 rounded-full bg-accent items-center justify-center active:opacity-80 shadow-xl"
          accessibilityRole="button"
          accessibilityLabel="Ileri"
          pointerEvents="auto"
        >
          <Feather name="arrow-right" size={24} color="#0A0A08" />
        </Pressable>
      </View>
    </View>
  );
}
