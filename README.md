# Remory

Fotoğraf tabanlı, offline-öncelikli bir anı/ilerleme günlüğü. Expo Router + Supabase üzerine kurulu, NativeWind ile tasarım sistemine bağlı.

## Kurulum

```bash
npm install
```

`.env` dosyası oluştur (Supabase proje ayarlarından alacaksın):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxxx
# Opsiyonel — tanımlanırsa hata izleme (Sentry) devreye girer, yoksa no-op:
EXPO_PUBLIC_SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx
```

Supabase şemasını kur:

```bash
supabase link --project-ref <proje-ref>
supabase db push
```

Migration'lar `supabase/migrations/` altında sırayla uygulanır (`0001_init.sql` temel ERD + RLS, sonrakiler auth trigger, storage politikaları, ölçüm tipleri, avatar, hesap silme vb.).

Çalıştır:

```bash
npx expo start
```

## Teknolojiler

- **Expo (~57) + Expo Router** — dosya tabanlı navigasyon
- **Supabase** — auth, Postgres (RLS'li), storage
- **TanStack Query** + `query-async-storage-persister` — offline-öncelikli veri katmanı ve önbellek kalıcılığı
- **Zustand** — çekim/sheet için hafif yerel state
- **NativeWind (Tailwind)** — tasarım sistemi tokenları (`tailwind.config.js`)
- **react-native-reanimated / gesture-handler** — sürüklenebilir sheet ve geçiş animasyonları
- **expo-image-picker / -manipulator / -media-library / view-shot / sharing** — fotoğraf çekimi, kırpma, paylaşılabilir kart üretimi
- **expo-notifications** — "X ay önce bugün" yerel hatırlatmaları

## Klasör yapısı

```
app/
  _layout.tsx          kök layout (providers, query client, auth gate)
  index.tsx            açılış yönlendirmesi
  (auth)/index.tsx     giriş
  forgot-password.tsx  şifre sıfırlama
  (onboarding)/
    welcome.tsx        karşılama ekranı
  (tabs)/              ana navigasyon
    _layout.tsx        sekme çubuğu (capture butonu doğrudan kamera açar)
    index.tsx          Ana Ekran
    zaman-kapsulu.tsx  Anı akışı / zaman kapsülü
    capture.tsx        render edilmeyen placeholder route (bkz. _layout)
    istatistikler.tsx  İstatistikler + paylaşılabilir kart
    profil.tsx         Profil
  entry/
    new.tsx            yeni kayıt
    [id].tsx           kayıt detayı
    edit/[id].tsx      kayıt düzenleme
    off-day.tsx        boş/atlanan gün kaydı
  compare/
    index.tsx          iki kaydı karşılaştırma
    pick.tsx           karşılaştırma için kayıt seçimi
  calendar-year.tsx    yıllık takvim görünümü
  search.tsx           arama
  profile/edit.tsx     profil düzenleme
  settings/
    notifications.tsx  bildirim tercihleri
    measurements.tsx   ölçüm tipleri yönetimi
    help.tsx           yardım
  privacy-policy.tsx, terms.tsx   yasal metinler

components/
  DraggableSheet.tsx, CaptureOptionsSheet.tsx, Typography.tsx, LegalScreen.tsx

lib/
  supabase.ts          Supabase client
  useAuth.tsx          oturum context'i
  useIsOnline.ts       ağ durumu (netinfo)
  capture.ts, captureStore.ts, captureSheetStore.ts   fotoğraf çekim akışı
  entryMutations.ts    kayıt CRUD mutasyonları (offline sync dahil)
  measurementInput.ts  ölçüm girdisini güvenle sayıya çevirir (geçersizde null, NaN DB'ye gitmez)
  storage.ts           Supabase storage yükleme/imzalı link
  orphanSweep.ts       hiçbir DB satırının işaret etmediği yetim fotoğrafları temizler (günde bir, açılışta)
  offDay.ts            gün kutusu 3 durumlu döngü mantığı (boş→off_day→workout)
  monitoring.ts        ince hata-izleme katmanı (Sentry; DSN yoksa no-op)
  comparison.ts        karşılaştırma mantığı
  profile.ts, profileStats.ts, account.ts   profil & hesap
  measurementTypes.ts, units.ts             ölçümler & birimler
  notifications.ts, notificationSettings.ts yerel bildirimler
  date.ts              tarih yardımcıları

supabase/migrations/   0001–0008 şema + RLS + storage politikaları
```

## Test

Saf mantık katmanı (tarih, birim dönüşümü, kapak-fotoğraf seçimi) `jest-expo` ile test ediliyor:

```bash
npm test
```

Testler `lib/__tests__/` altında. Native/Supabase köprüsü gerektirmeyen saf fonksiyonlara odaklı (`date`, `units`, `storage` yardımcıları); `jest.setup.js` sahte Supabase env'i verip AsyncStorage'ı mock'layarak bu modüllerin ağa çıkmadan yüklenmesini sağlıyor.

## Durum

Ana akışlar uçtan uca çalışır durumda: auth, kayıt oluşturma/düzenleme/silme, offline ekleme + geri senkronizasyon, karşılaştırma, istatistikler, paylaşılabilir kart, bildirimler, profil ve ayarlar. TypeScript temiz derlenir (`npx tsc --noEmit`), testler `npm test` ile geçer.

## Bilinen açık uçlar

- Onboarding tek ekranda (`welcome.tsx`); planlanan ek adımlar henüz yok.
- Galeriye kaydetme (`app/compare/index.tsx`), `expo-media-library`'yi try/catch'li `require` ile yüklüyor: bu native modül Expo Go'da bulunmadığı için import anında throw eder, yakalanır ve "Kaydet" bilinçli olarak devre dışı kalıp kullanıcıyı development build'e / "Paylaş"a yönlendirir. Beklenen davranış — galeri kaydı için development/production build gerekir.
