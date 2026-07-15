/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // React Native özel fontlarda numeric font-weight'i yok sayıp her ağırlık için ayrı
  // yüklenmiş bir fontFamily bekliyor — bu yüzden Tailwind'in yerleşik fontWeight
  // core plugin'ini kapatıp font-normal/medium/semibold/bold sınıflarını kendi Inter
  // fontFamily eşlemelerimizle yeniden tanımlıyoruz. Uygulamadaki mevcut font-bold vb.
  // kullanımların hiçbirini değiştirmeye gerek kalmıyor, otomatik doğru dosyaya düşüyor.
  corePlugins: {
    fontWeight: false,
  },
  theme: {
    extend: {
      colors: {
        // Ana yüzeyler
        bg: "#0A0A08",
        surface: "#12140D",
        surfaceMuted: "rgba(255,255,255,0.03)",
        border: "rgba(255,255,255,0.06)",

        // Marka aksanı (lime yeşil)
        accent: "#8CE05A",
        accentSoft: "rgba(140,224,90,0.14)",

        // Metin
        text: "#F5F3EC",
        textMuted: "#8B8A82",
        textFaint: "#5C5A50",

        // Kamera tarih damgası
        stamp: "#FF7A3D",

        // Off day
        offDay: "#9AA3C7",
        offDaySoft: "rgba(154,163,199,0.22)",

        // Tehlike / silme
        danger: "#D9705A",

        // Kağıt / flip arka yüzü (fotoğraf notu)
        paper: "#E8E0CC",
        paperInk: "#3A3324",
      },
      borderRadius: {
        card: "20px",
        button: "16px",
        pill: "20px",
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
      },
    },
  },
  plugins: [
    ({ addUtilities }) => {
      addUtilities({
        ".font-normal": { fontFamily: "Inter_400Regular" },
        ".font-medium": { fontFamily: "Inter_500Medium" },
        ".font-semibold": { fontFamily: "Inter_600SemiBold" },
        ".font-bold": { fontFamily: "Inter_700Bold" },
      });
    },
  ],
};
