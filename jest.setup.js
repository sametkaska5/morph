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
