# Remory

[![CI](https://github.com/sametkaska5/remory/actions/workflows/ci.yml/badge.svg)](https://github.com/sametkaska5/remory/actions/workflows/ci.yml)

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

Migration'lar `supabase/migrations/` altında sırayla uygulanır: `0001_init.sql` temel ERD + RLS, sonrakiler auth trigger, storage politikaları, ölçüm tipleri, `workout` gün tipi, avatar, hesap silme RPC'si, fotoğraf thumbnail'leri ve antrenman programı tabloları (`workout_items` / `workout_sets`).

Şemayı değiştiren bir migration eklediğinde TypeScript tiplerini de yenile — `lib/database.types.ts` client'a `createClient<Database>` ile bağlı, bayat kalırsa derleme hataları yanlış yerden çıkar:

```bash
npm run gen:types
```

(Proje link'li değilse dosyayı elle güncelle; format `supabase gen types` çıktısıyla birebir aynı.)

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
- **react-native-svg** — ölçüm grafiği (çizim matematiği `lib/chart.ts` içinde, testli)
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
    new.tsx            yeni kayıt (fotoğraflı)
    [id].tsx           kayıt detayı (yatay sayfalayıcı)
    edit/[id].tsx      kayıt düzenleme
    workout.tsx        fotoğrafsız gün: ölçüm + off-day işaretleme
    program.tsx        antrenman programı: hareket + set set giriş
  compare/
    index.tsx          iki kaydı karşılaştırma
    pick.tsx           karşılaştırma için kayıt seçimi
  calendar-year.tsx    yıllık takvim: güne dokununca o tarihin kaydına/ekranına gider
  search.tsx           arama
  profile/edit.tsx     profil düzenleme
  settings/
    notifications.tsx  bildirim tercihleri
    measurements.tsx   ölçüm tipleri yönetimi
    help.tsx           yardım
  privacy-policy.tsx, terms.tsx   yasal metinler

components/
  Typography.tsx       Inter fontunu uygulayan Text / TextInput sarmalayıcıları
  ErrorBoundary.tsx    render çökmelerini yakalar (kök layout'ta), Sentry'ye bildirir
  ErrorState.tsx       veri yüklenemediğinde ikon + açıklama + "Tekrar dene"
  MeasurementChart.tsx interaktif ölçüm grafiği (satır içi + büyütme modu)
  ConfirmDialog.tsx    temalı onay/bilgi kutusu — yıkıcı işlemlerde native Alert yerine
  PhotoStack.tsx       ızgarada kapağın arkasındaki yaprak destesi + açılma animasyonu
  EntryPhotoStrip.tsx  detayda bir günün fotoğrafları arası geçiş + kapak/silme
  DraggableSheet.tsx, CaptureOptionsSheet.tsx, LegalScreen.tsx

lib/
  supabase.ts          Supabase client (createClient<Database> ile tipli)
  database.types.ts    DB şemasının TypeScript karşılığı — bkz. npm run gen:types
  queryKeys.ts         TÜM React Query anahtarlarının tek kaynağı
  useAuth.tsx          oturum context'i
  useIsOnline.ts       ağ durumu (netinfo)
  useKeyboardFocus.ts  klavye açılınca odaklanan alanı görünür tutar

  — veri katmanı (ekranlar buradan okur, kendi sorgularını yazmaz)
  entries.ts           girdi listeleri + detay + düzenleme + silme hook'ları
  stats.ts             ölçüm serisi, haftalık durum, seri/trend hesapları
  workout.ts           fotoğrafsız gün ve antrenman programı okuma/yazma
  comparison.ts        karşılaştırma mantığı
  profile.ts, profileStats.ts, account.ts   profil & hesap
  measurementTypes.ts, units.ts             ölçümler & birimler
  notifications.ts, notificationSettings.ts yerel bildirimler

  — yazma & fotoğraf
  entryMutations.ts    fotoğraflı kaydın yazma yolu (offline kuyruk dahil)
  photos.ts            bir günün fotoğrafları: sıralama, ekleme, silme, kapak seçme
  capture.ts, captureStore.ts, captureSheetStore.ts   fotoğraf çekim akışı
  storage.ts           Supabase storage yükleme/imzalı link/kapak seçimi
  orphanSweep.ts       hiçbir DB satırının işaret etmediği yetim fotoğrafları temizler (günde bir, açılışta)

  — saf yardımcılar (hepsi testli)
  chart.ts             SVG grafik matematiği (Bézier yumuşatma, path üretimi)
  measurementInput.ts  ölçüm girdisini güvenle sayıya çevirir (geçersizde null, NaN DB'ye gitmez)
  errors.ts            ham hataları kullanıcıya gösterilebilir Türkçe metinlere çevirir
  alerts.ts            alertError(): hem Alert gösterir hem Sentry'ye raporlar
  monitoring.ts        ince hata-izleme katmanı (Sentry; DSN yoksa no-op)
  dayRoute.ts          gün kutusuna dokununca gidilecek route (şerit + yıllık takvim ortak)
  memoryMilestones.ts  hangi "X ay önce" bildirimlerinin kurulacağı (işletim sistemi sınırı)
  date.ts              tarih yardımcıları

supabase/migrations/   0001–0010 şema + RLS + storage politikaları, antrenman tabloları
```

## Mimari notları

- **Veri erişimi ekranlarda değil `lib/` içinde.** Ekranlar `useTimelineEntries()` gibi hook'ları çağırır; `supabase.from(...)` yazmaz. Yeni bir sorgu eklerken hook'u ilgili lib modülüne koy.
- **Query anahtarları `lib/queryKeys.ts`'ten gelir**, elle dizi yazılmaz. Aile yapısı sayesinde `invalidateQueries({ queryKey: queryKeys.entries.all })` tüm girdi listelerini birden tazeler.
- **Ham hata metni kullanıcıya asla gösterilmez.** Sorgu hatası → `<ErrorState error={error} onRetry={...} />`; eylem hatası → `alertError("Başlık", err, "modul.islem")`; auth akışı → `authErrorMessage(error)`.
- **Native `Alert.alert` kullanılmaz.** Bilgi/uyarı için `showAlert(baslik, mesaj)` (bkz. `lib/appAlert.ts`), onay gerektiren yıkıcı işlemler için `<ConfirmDialog>`. Alert sistemin kendi penceresi: koyu temanın ortasında beyaz bir kutu olarak belirir, iOS/Android'de bambaşka görünür ve testte içeriği okunamaz. `showAlert` React dışından da çağrılabilir, o yüzden modüllerde de kullanılabiliyor.
- **Hata, boşlukla karıştırılmaz.** Bir sorgu patladığında `isLoading` da false olur ve `data` undefined kalır: hata dalı yazılmazsa ekran "hiç kaydın yok" gibi görünür. Form ekranlarında bu daha ağır — boş dolan formun üstüne basılan "Kaydet" var olan veriyi siler. Bu yüzden **veri okuyan her form, sorgu hata verdiğinde hiç açılmaz**; hydration koşulları da `!error` içerir.
- **Offline-first**: mutasyonlar çevrimdışıyken kuyruğa alınır (`registerEntryMutationDefaults` + `resumePausedMutations`), önbellek AsyncStorage'a kalıcılaştırılır. Bir sorgunun veri şekli değişirse `app/_layout.tsx`'teki `PERSIST_CACHE_BUSTER`'ı artır.

## Test

```bash
npm test
```

Testler `lib/__tests__/` altında, iki gruba ayrılıyor:

**Saf mantık** — tarih, birim dönüşümü, ölçüm girdisi doğrulama, kapak-fotoğraf seçimi, grafik matematiği (`chart`), seri/trend hesapları (`stats`), hata metni eşlemesi (`errors`). `jest.setup.js` sahte Supabase env'i verip AsyncStorage ve Sentry'yi mock'layarak bu modüllerin ağa çıkmadan yüklenmesini sağlıyor.

**Yazma yolu** — `entryMutations`, `workout`, `deleteEntry`. Uygulamanın en riskli kodu (veri kaybı senaryosu) ve saf olmadığı için `lib/__tests__/helpers/supabaseMock.ts` üzerinden test ediliyor: zincirlenebilir Supabase API'sini taklit eden, tablo başına sonuç kuyruğu tutan ve yapılan her çağrıyı kaydeden küçük bir harness. Testler "hangi tabloya, hangi sırayla, hangi yükle yazıldı" sorusunu doğruluyor — bayat fotoğraf temizliği, boşaltılan ölçümün silinmesi, silmede foreign key sırası gibi daha önce gerçekten yaşanmış hataları kilitliyor.

**Bileşen/ekran** — `ErrorState` ve on bir ekran (`profile/edit`, `entry/program`, `entry/workout`, `entry/edit/[id]`, `entry/[id]`, ana ekran, anı akışı, arama, karşılaştırma seçimi/sonucu, istatistikler, yıllık takvim) `@testing-library/react-native` ile render edilerek test ediliyor. İki odak var: (1) form doldurma — dört ekranda form `useEffect` yerine render sırasında "önceki değerle karşılaştır" kalıbıyla dolduruluyor, testler iki sessiz kırılmayı kilitliyor (formun hiç dolmaması ve kullanıcının yazdığının her render'da ezilmesi); (2) durum geçişleri — yükleme / hata / boş / veri, ve hata durumunda ham metin yerine `ErrorState` + çalışan "Tekrar dene".

Native köprü gerektiren kütüphaneler `jest.setup.js`'te merkezî olarak taklit ediliyor. Reanimated için elle yazılmış bir mock var (`__mocks__/react-native-reanimated.js`) — kütüphanenin kendi resmi mock'u v4'te gerçek modülü import edip worklets JSI köprüsüne çarptığı için kullanılamıyor; gerekçesi dosyanın başında yazılı.

> **RNTL v14 notu:** `render`, `rerender` ve `fireEvent` **async** — `await` unutulursa sorgular sessizce çalışmaz. Eski `toHaveAccessibilityState` yerine `toBeSelected()` / `toBeDisabled()` kullanılıyor.

> `helpers/` klasörü `testPathIgnorePatterns` ile hariç tutulmuş; oraya test değil yalnızca yardımcı koy.

## Dağıtım

Proje **development build** ile geliştiriliyor (Expo Go değil) — `expo-notifications` ve `expo-media-library` gibi native modüller Expo Go'da yok.

```bash
eas build --profile development --platform android   # geliştirme (Metro'ya bağlanır)
eas build --profile preview --platform android       # test kullanıcısına verilen bağımsız APK
```

Ortam değişkenleri `.env`'den gelmiyor — `.env` gitignore'da ve EAS onu görmüyor. Her ortama ayrı ayrı yüklenmesi gerekiyor, aksi halde build başarılı olur ama uygulama Supabase'e bağlanamaz:

```bash
eas env:push preview --path .env
```

### Kablosuz güncelleme (EAS Update)

JS değişiklikleri yeni build almadan gönderilebiliyor. Build profilleri kanallara bağlı (`development` / `preview` / `production`):

```bash
eas update --branch preview --message "galeri kaydı düzeltildi"
```

**`runtimeVersion` politikası `fingerprint`** — bu bilinçli bir seçim. Fingerprint, native bağımlılık kümesinin özeti: `package.json`'daki native paketler ya da plugin'ler değişince otomatik değişiyor ve eski build'ler uyumsuz JS'i **almıyor**. Elle yönetilen bir sürüm numarası olsaydı, native tarafı değişmiş bir güncelleme eski binary'ye inip uygulamayı açılışta çökertebilirdi (bkz. worklets/reanimated sürüm uyuşmazlığı geçmişi).

Pratikte: JS-only değişiklik → `eas update` yeter. Native değişiklik (yeni paket, plugin, sabitlenmiş sürümlerin kaldırılması) → yeni build şart.

## Kalite kontrolleri

Üç komut projenin kalite kapısı — üçü de temiz geçmeden değişiklik gönderme:

```bash
npm run lint
npm run typecheck
npm test
```

Aynı üçü her `push` ve pull request'te GitHub Actions üzerinde de çalışıyor (`.github/workflows/ci.yml`). CI, biri patlasa bile diğerlerini çalıştırır — böylece tüm sorunları tek turda görüp düzeltebilirsin.

Biçimlendirme Prettier'ın işi (`npm run format` yazar, `npm run format:check` sadece denetler); ESLint yalnızca kod kalitesine bakar, ikisi çakışmaz.

## Durum

Ana akışlar uçtan uca çalışır durumda: auth, kayıt oluşturma/düzenleme/silme, fotoğrafsız gün ve antrenman programı, offline ekleme + geri senkronizasyon, karşılaştırma, istatistikler, paylaşılabilir kart, bildirimler, profil ve ayarlar.

Kalite kapısının üçü de temiz: ESLint sıfır sorun, `tsc --noEmit` temiz, 35 test paketi / 396 test geçiyor. Kod tabanında `any` yok — `@typescript-eslint/no-explicit-any` hata seviyesinde açık.

## Bilinen açık uçlar

- Onboarding tek ekranda (`welcome.tsx`); planlanan ek adımlar henüz yok.
- Yasal metinler, onboarding, `settings/help.tsx` ve `settings/measurements.tsx`'in render testi yok. Veri yazan ve geri alınamaz akışların (yeni kayıt, düzenleme, fotoğrafsız gün, program, bildirim ayarları, profil düzenleme, giriş/kayıt, hesap silme) hepsi testli.
- `npm run gen:types` yalnızca proje Supabase CLI'a link'liyken çalışır; aksi halde `lib/database.types.ts` elle güncellenmeli.
- Galeriye kaydetme (`app/compare/index.tsx`), `expo-media-library`'yi try/catch'li `require` ile yüklüyor: bu native modül Expo Go'da bulunmadığı için import anında throw eder, yakalanır ve "Kaydet" bilinçli olarak devre dışı kalıp kullanıcıyı development build'e / "Paylaş"a yönlendirir. Beklenen davranış — galeri kaydı için development/production build gerekir.
