/**
 * Merkezi Tema Dosyası
 *
 * Uygulamanın renk paletini `tailwind.config.js` ile aynı tutacak şekilde dışa aktarır.
 * React bileşenleri içerisindeki Feather ikonları, ActivityIndicator vb. için
 * bu objeyi kullanarak hardcoded HEX kodlarından kaçının.
 */
export const theme = {
  colors: {
    bg: "#0A0A08",
    surface: "#12140D",
    surfaceMuted: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.06)",
    accent: "#8CE05A",
    accentSoft: "rgba(140,224,90,0.14)",
    text: "#F5F3EC",
    textMuted: "#ADABA1",
    textFaint: "#8B8A82",
    stamp: "#FF7A3D",
    offDay: "#9AA3C7",
    offDaySoft: "rgba(154,163,199,0.22)",
    danger: "#D9705A",
    paper: "#E8E0CC",
    paperInk: "#3A3324",
  },
} as const;
