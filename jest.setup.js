// lib/supabase.ts modül yüklenirken createClient(url, key) çağırıyor; url/key
// undefined olursa supabase-js daha import anında throw eder. Testler gerçek bir
// Supabase'e BAĞLANMAZ — sadece saf yardımcı fonksiyonları (units, storage, date)
// içe aktarmak için modülün yüklenebilmesi yeterli. Bu yüzden sahte ama geçerli
// biçimli değerler veriyoruz; hiçbir ağ isteği atılmıyor.
process.env.EXPO_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

// lib/supabase.ts, auth session'ını AsyncStorage'da tutuyor. Native modül Jest'te
// null olduğundan (gerçek cihaz yok) resmi in-memory mock'u kullanıyoruz — böylece
// supabase.ts'yi içe aktaran saf yardımcılar (units, storage) native köprü
// olmadan yüklenebiliyor.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// lib/monitoring.ts, @sentry/react-native'i içe aktarıyor (native köprü). Testler
// gerçek Sentry'yi çalıştırmaz — hata sınırı olan modülleri (orphanSweep vb.)
// yükleyebilmek için hafif bir mock veriyoruz.
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

// ─── Bileşen testleri için native köprü taklitleri ───
// Aşağıdakiler yalnızca EKRAN render eden testlerde gerekiyor ama burada
// merkezî olarak tanımlanıyorlar: her test dosyasında tekrar yazmak yerine
// kütüphanelerin KENDİ resmi mock'larını kullanıyoruz, böylece sürüm
// yükseltmelerinde davranış kendiliğinden güncelleniyor.

// Reanimated'ın KENDİ resmi mock'u bu sürümde kullanılamıyor (gerçek modülü
// import edip worklets JSI köprüsüne çarpıyor) — gerekçesi ve kapsamı
// __mocks__/react-native-reanimated.js dosyasında yazılı.
jest.mock("react-native-reanimated");

// useSafeAreaInsets native ölçüm gerektiriyor; resmi mock sabit kenar boşlukları
// döndürüyor, layout hesabı yapan ekranlar (anı akışı) böylece render edilebiliyor.
// `.default` şart: mock dosyası her şeyi tek bir default export nesnesinde
// veriyor, doğrudan require edilirse `useSafeAreaInsets is not a function` olur.
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);
