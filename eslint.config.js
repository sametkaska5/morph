// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier");

module.exports = defineConfig([
  expoConfig,
  // Prettier'la çakışan tüm biçimlendirme kurallarını kapatır — biçim Prettier'ın,
  // kod kalitesi ESLint'in işi. Her zaman en sonda gelmeli.
  prettierConfig,
  {
    rules: {
      // Türkçe arayüz metinleri kesme işaretiyle dolu ("Remory'de", "gün'e" vb.) —
      // JSX içinde &apos; kaçışları okunabilirliği bitirir, RN'de bunun bir güvenlik
      // karşılığı da yok (web'deki HTML-entity sorunu burada geçerli değil).
      "react/no-unescaped-entities": "off",
      // Bir zamanlar 7 ihlal vardı ve geçici olarak warn'a düşürülmüştü; hepsi
      // render sırasında senkronizasyon kalıbına çevrildi (react.dev:
      // you-might-not-need-an-effect). Artık sıfır — geri sızmasın diye error.
      "react-hooks/set-state-in-effect": "error",
      // Supabase client tipli (createClient<Database>) ve veri katmanı tam
      // tiplenmiş durumda; koddaki 52 `any` temizlendi. `any` tek bir yerde bile
      // geri gelirse o noktadan sonraki tüm tip denetimi sessizce kayboluyor,
      // bu yüzden hata seviyesinde tutuyoruz. Gerçekten kaçınılmazsa
      // eslint-disable-next-line + GEREKÇE yaz.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Jest testleri ve setup dosyası — `jest` globalini tanıt.
    files: ["jest.setup.js", "lib/__tests__/**"],
    languageOptions: { globals: { jest: "readonly" } },
  },
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "graphify-out/**",
      "coverage/**",
      "expo-env.d.ts",
    ],
  },
]);
