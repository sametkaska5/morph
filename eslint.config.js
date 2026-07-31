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
      // Gerçek bir kod kokusu ama düzeltmesi ekran başına dikkatli refactor istiyor
      // (türetilmiş state'i render sırasında hesaplamak / key ile resetlemek).
      // Mevcut 8 kullanım veri katmanı refactor'ünde (Faz B) ele alınacak; o yüzden
      // build'i kırmasın ama görünür kalsın diye warn. Yeni kodda yazma.
      "react-hooks/set-state-in-effect": "warn",
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
