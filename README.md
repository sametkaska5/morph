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

Migration'lar `supabase/migrations/` altında sırayla uygulanır: `0001_init.sql` temel ERD + RLS, sonrakiler auth trigger, storage politikaları, ölçüm tipleri, `workout` gün tipi, avatar, hesap silme RPC'si, fotoğraf thumbnail'leri, antrenman programı tabloları (`workout_items` / `workout_sets`) ve giriş ekranının hesap kontrolü (`email_exists` + hız sınırı).

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
  _layout.tsx          kök layout (providers, query client, auth gate, splash)
  index.tsx            açılış yönlendirmesi (karşılama / giriş kararı)
  +not-found.tsx       eşleşmeyen route — derin bağlantı çıkmazından kurtarır
  (auth)/index.tsx     giriş
  forgot-password.tsx  şifre sıfırlama
  (onboarding)/
    welcome.tsx        karşılama ekranı (yalnızca ilk açılışta)
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
    password.tsx       şifre değiştirme (mevcut şifreyle yeniden kimlik doğrulaması)
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
  UpdateBanner.tsx     "yeni sürüm hazır" şeridi — çevrimdışı şeridiyle aynı yerde
  DraggableSheet.tsx, CaptureOptionsSheet.tsx, LegalScreen.tsx

lib/
  supabase.ts          Supabase client (createClient<Database> ile tipli) + oturum yenilemesinin AppState'e bağlanması
  database.types.ts    DB şemasının TypeScript karşılığı — bkz. npm run gen:types
  queryKeys.ts         TÜM React Query anahtarlarının tek kaynağı
  useAuth.tsx          oturum context'i
  useIsOnline.ts       ağ durumu (netinfo)
  useKeyboardFocus.ts  klavye açılınca odaklanan alanı görünür tutar
  onboarding.ts        karşılama ekranının "görüldü" bayrağı (cihazda, AsyncStorage)

  — veri katmanı (ekranlar buradan okur, kendi sorgularını yazmaz)
  entries.ts           girdi listeleri + detay + düzenleme + silme hook'ları
  stats.ts             ölçüm serisi, haftalık durum, seri/trend hesapları
  workout.ts           fotoğrafsız gün ve antrenman programı okuma/yazma
  comparison.ts        karşılaştırma mantığı
  profile.ts, profileStats.ts, account.ts   profil & hesap
  measurementTypes.ts, units.ts             ölçümler & birimler
  notifications.ts, notificationSettings.ts yerel bildirimler + bildirime dokununca kaydın detayına yönlendirme
  appUpdates.ts        kablosuz güncelleme: öne gelişte kontrol, hazır olunca kullanıcıya bırakma

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
- **Açılış sırası: splash → karar → ekran.** `expo-splash-screen` fontlar hazır olana kadar ekranda tutuluyor (`preventAutoHideAsync` global kapsamda, `hideAsync` ilk render commit'inden sonra) — eskiden splash kendiliğinden kayboluyordu ve arada düz siyah bir kare görünüyordu. Font yüklemesi HATA verirse de devam ediliyor: `fontsLoaded` sonsuza kadar false kalabildiği için uygulama açılışta sessizce kilitleniyordu; sistem fontuyla açılmak hiç açılmamaktan iyi. Ardından `app/index.tsx` karar veriyor — oturum varsa karşılama atlanır, yoksa ve daha önce görülmediyse karşılama, diğer her durumda giriş.
- **Hesap kontrolü hız sınırlı ve başarısızlığı "bilmiyorum" demektir.** `email_exists`, giriş ekranındaki "hesabım mı yok, şifrem mi yanlış" belirsizliğini kaldırıyor; karşılığında bir e-postanın kayıtlı olup olmadığı anon anahtarla sorulabiliyor. Tek tek sızan bu bilgi zararsız, ama sınırsız bırakılırsa bir e-posta listesi döngüye sokulup "bu listeden kimler Remory kullanıyor" toplu olarak cevaplanabilir — o noktada sızan şey bir kullanıcı listesi. Fonksiyon bu yüzden IP başına 10 dakikada 10 çağrıyla sınırlı (bkz. migration 0012). Sınır aşılınca hata fırlıyor ve istemci bunu **`"unknown"`** olarak ele alıp genel mesaja düşüyor — `"missing"` DEĞİL. Fark kritik: `"missing"` dönseydi hesabı olan kullanıcıya hesabının olmadığı söylenip kayıt ekranına gönderilirdi, üstelik hiçbir hata belirtisi olmadan. `accountLookup` testi bunu kilitliyor.
- **Renkle anlatılan hiçbir şey yalnızca renkle kalmaz.** Seçili durum, "hedefe uygun / uzak" yargısı, etkin/kapalı düğme — hepsi görselde renkle ayrışıyor ama ekran okuyucu ve renk körü kullanıcı için görünmez. Seçimler `accessibilityRole="radio"` + `accessibilityState={{ selected }}` ile, yargılar etiket metnine sözle yazılarak taşınıyor (bkz. `measurementRowLabel`, `app/compare/index.tsx`).
- **Metni gösterge ile değişen düğmelerde etiket SABİT verilir.** "Kaydet", "Paylaş", "Giriş yap" gibi düğmeler işlem sürerken metni `ActivityIndicator`'a bırakıyor; etiket verilmezse düğmenin erişilebilir adı tam da en kritik anda kayboluyor ve ekran okuyucu sadece "düğme" diyor. Aynı yerlerde `accessibilityState={{ busy, disabled }}` de veriliyor.
- **Dokunmayı yutan sarmalayıcılar düğme değildir.** Sheet ve modal içeriklerini saran `<Pressable onPress={() => {}}>` yalnızca dışarı tıklamayı engelliyor; `accessible={false}` ile ekran okuyucuya sunulmuyor, kapatan arka plan ise `accessibilityLabel="Kapat"` alıyor. Aksi halde kullanıcı isimsiz iki düğme arasında dolaşıyordu.
- **Şifre değiştirmek yeniden kimlik doğrulaması ister.** Supabase'in `updateUser({ password })` çağrısı eski şifreyi sormuyor — açık oturum yeterli. Yani kilidi açık bir telefonu eline geçiren biri şifreyi değiştirip hesabın sahibini kilitleyebilirdi. `settings/password.tsx` değiştirmeden önce `signInWithPassword` ile mevcut şifreyi doğruluyor (aynı kullanıcı için yeni oturum açar, `SIGNED_OUT` tetiklemez, önbellek temizlenmez). Bu adım kaldırılırsa ekran gözle bakınca aynen çalışmaya devam eder; `passwordScreen` testi o yüzden var.
- **Oturum yenilemesi AppState'e bağlı.** `autoRefreshToken: true` tek başına yetmiyor: yenileme bir JS zamanlayıcısıyla yapılıyor, işletim sistemi ise arka plandaki uygulamanın zamanlayıcılarını donduruyor. Uygulama uzun süre arka planda kalınca token'ın süresi doluyor ve dönüşteki ilk istekler 401 alıyor — kullanıcı için bu, sebepsiz bir çıkış gibi görünüyor. `registerAuthAutoRefresh()` (bkz. `lib/supabase.ts`, kök layout'ta bir kez çağrılır) önplana geçişte `startAutoRefresh()` çağırıyor; bu yalnızca zamanlayıcıyı kurmakla kalmıyor, kaçırılan yenilemeyi ilk veri isteğinden önce telafi ediyor.

## Test

```bash
npm test
```

Testler `lib/__tests__/` altında, iki gruba ayrılıyor:

**Saf mantık** — tarih, birim dönüşümü, ölçüm girdisi doğrulama, kapak-fotoğraf seçimi, grafik matematiği (`chart`), seri/trend hesapları (`stats`), hata metni eşlemesi (`errors`), bildirim yükünden kayıt kimliği çıkarma (`notificationTap`) ve oturum yenilemesinin AppState'e bağlanması (`authAutoRefresh`). Son ikisi "sessizce bozulan" davranışlar: kaldırıldıklarında hiçbir hata çıkmıyor, yalnızca kullanıcı bildirime dokununca yanlış yere düşüyor ya da arka plandan dönüşte oturumu kopmuş gibi görünüyor. `jest.setup.js` sahte Supabase env'i verip AsyncStorage ve Sentry'yi mock'layarak bu modüllerin ağa çıkmadan yüklenmesini sağlıyor.

**Yazma yolu** — `entryMutations`, `workout`, `deleteEntry`. Uygulamanın en riskli kodu (veri kaybı senaryosu) ve saf olmadığı için `lib/__tests__/helpers/supabaseMock.ts` üzerinden test ediliyor: zincirlenebilir Supabase API'sini taklit eden, tablo başına sonuç kuyruğu tutan ve yapılan her çağrıyı kaydeden küçük bir harness. Testler "hangi tabloya, hangi sırayla, hangi yükle yazıldı" sorusunu doğruluyor — bayat fotoğraf temizliği, boşaltılan ölçümün silinmesi, silmede foreign key sırası gibi daha önce gerçekten yaşanmış hataları kilitliyor.

**Yönlendirme** — açılış kararı (`app/index.tsx`) ve karşılama ekranı `onboardingRoute` testinde kilitli: ilk açılış karşılamaya gider, görüldükten sonra gitmez, oturum varsa hiç gösterilmez, oturum yüklenirken erken yönlendirme yapılmaz ve depolama patlarsa kullanıcı karşılamada KİLİTLENMEZ. `+not-found` ekranının kurtarma düğmesi de testli (`replace`, `push` değil — yoksa geri tuşu kullanıcıyı çıkmaza geri getirirdi).

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

### Sentry kaynak haritaları

Release build'lerinde kaynak haritaları Sentry'ye yükleniyor, yani yığın izleri küçültülmüş kod yerine gerçek dosya/satır olarak görünüyor. İki parça birlikte çalışıyor:

| Parça | Nerede | Ne işe yarıyor |
|---|---|---|
| `organization` / `project` | `app.json` → Sentry plugin | Hangi projeye yükleneceği |
| `SENTRY_AUTH_TOKEN` | EAS gizli değişkeni | Yükleme yetkisi |

Plugin bunlardan `android/sentry.properties`'i üretiyor; doğrulamak için `npx expo prebuild --platform android --no-install` çalıştırıp dosyaya bakabilirsin (sonra `android/` klasörünü silmeyi ve `package.json` script'lerini geri almayı unutma).

> ⚠️ **Plugin'e `url` verme.** Bir kez `https://de.sentry.io/` olarak eklendi ve release build'lerini düşürdü, geri alındı. Sebep: org **EU (Frankfurt)** bölgesinde olsa bile (DSN'deki `ingest.de.sentry.io`) API giriş adresi yine `https://sentry.io`. Sentry kimlik/organizasyon katmanını orada, olay verisini bölgede tutuyor; `sentry-cli` sentry.io'ya girip bölgeye kendisi yönleniyor. Girişi `de.sentry.io`'ya sabitlemek bu yönlendirmeyi kırıyor. Organizasyon token'ı zaten içinde hem `url` hem `region_url` taşıdığı için bölge bilgisi kaybolmuyor — veri AB'de kalmaya devam ediyor.

**Auth token asla repoda tutulmuyor.** Plugin `authToken` seçeneğini kabul ediyor ama kendisi bunu kullanmaya karşı uyarıyor; token bunun yerine EAS gizli değişkeni olarak duruyor:

```bash
npx eas-cli env:set --name SENTRY_AUTH_TOKEN --value "<token>" --visibility secret --environment preview --environment production
```

Token **organizasyon token'ı** olmalı (`sntrys_` ile başlar, Sentry → Settings → Auth Tokens). Kullanıcı token'ının aksine bölge adresini kendi içinde taşıyor, o yüzden ayrıca `url` yapılandırması gerekmiyor.

> `sntrys_` sonrası şifreli değil, base64 kodlanmış JSON — token'ı gören org adını ve bölgesini okuyabiliyor. Log/terminal çıktısı paylaşırken token'ı yazan satırı kes; `sentry-cli`'ın kendi çıktısı token'ı `Bearer sntrys_e***` diye maskeliyor, sızdıran genelde komut satırının kendisi oluyor.

> ⚠️ **Token'ı EAS'a yazarken interaktif isteme yapıştırma.** Bir kez öyle yapıldı ve saklanan değer bozuldu: `Authorization` başlığı geçersiz hale geldi, Sentry'nin önündeki Google yük dengeleyicisi isteği daha Sentry'ye ulaşmadan reddetti. Değeri belirleyici şekilde kur — dosyaya kaydet, kırp, öyle gönder:
>
> ```bash
> $t = (Get-Content token.txt -Raw).Trim(); "uzunluk: $($t.Length) | bas: $($t.Substring(0,8))"
> ```
>
> Beklenen: `sntrys_e` ile başlar, uzunluk ~195. Doğruysa `--value $t` ile yaz, sonra dosyayı sil.

**Hata ayıklarken:** yükleme build'in son adımı, yani sorun 10 dakika sonra ortaya çıkıyor. Yerelde saniyeler içinde çoğaltabilirsin — build'in çalıştırdığı komutun aynısı:

```bash
npx expo export:embed --platform android --dev false --bundle-output ./tmp/index.android.bundle --sourcemap-output ./tmp/index.android.bundle.map --assets-dest ./tmp/assets
npx sentry-cli react-native gradle --bundle ./tmp/index.android.bundle --sourcemap ./tmp/index.android.bundle.map --release "com.remory.app@<sürüm>" --dist 1
```

`SENTRY_LOG_LEVEL=debug` istek/yanıtı da basar (token maskeli). Build tarafında aynı bilgiyi almak için `eas.json`'ın ilgili profiline geçici olarak `"env": { "SENTRY_LOG_LEVEL": "debug" }` eklenebilir.

Yanıtı okurken ilk bakılacak yer **hatayı kimin döndürdüğü**:

| Görünen | Kaynak | Anlamı |
|---|---|---|
| `HTTP/1.1` + JSON gövde | Sentry API | Aşağıdaki durum kodlarına bak |
| `HTTP/1.0` + `Error 400 (Bad Request)!!1` HTML | Google yük dengeleyici | İstek Sentry'ye **hiç ulaşmadı** — büyük olasılıkla bozuk `Authorization` başlığı |

Sentry'den gelen kodlar: **401** token geçersiz, **403** kapsam yetersiz (`www-authenticate` başlığı eksik kapsamı adıyla yazıyor), **404** org bulunamadı, **400** istek gövdesi yanlış.

Bir de `Authorization: Bearer` satırına bak: `sentry-cli` token'ın ilk 8 karakterini bırakıp gerisini maskeliyor. `Bearer sntrys_e***` beklenen görüntü; `Bearer ***` ise saklanan değer boş ya da bozuk demektir.

#### ⚠️ Kablosuz güncellemeler ayrı bir adım istiyor

Yukarıdaki her şey yalnızca **`eas build`** için geçerli — kaynak haritalarını Gradle eklentisi yüklüyor ve o yalnızca derleme sırasında çalışıyor.

`eas update` ise **yeni bir JS paketi** yayınlıyor. O paketin kaynak haritaları kendiliğinden gitmiyor: build'den sonra kaç kez güncelleme gönderdiysen, telefondaki kod Sentry'nin elindeki haritalarla o kadar alakasız hale geliyor. Sonuç, hiç kurulmamışla aynı — yığın izi `index.android.bundle:1:284917`.

Her `eas update`'ten **sonra** çalıştır:

```bash
npm run update:sourcemaps
```

`eas update`, yayınlarken projeyi `dist/` klasörüne çıkarıyor ve orada bırakıyor; betik de tam o klasörü okuyor, yani paket ile haritalar aynı derlemeden geliyor. Token gerekiyor:

```bash
$env:SENTRY_AUTH_TOKEN = "sntrys_ile_baslayan_token"
```

> Eklentinin `app.json`'daki adı **`@sentry/react-native/expo`** olmak zorunda. `@sentry/react-native` ile birebir aynı eklenti (`app.plugin.js` doğrudan `./expo`'yu döndürüyor) ama yükleme betiği eklentiyi ADINA göre arıyor; başka bir adla org/proje ayarlarını bulamayıp ortam değişkenlerine düşüyor.

> Geçmiş not: bu ayarlar yokken `eas.json`'ın release profillerinde `SENTRY_DISABLE_AUTO_UPLOAD=true` vardı, çünkü Gradle eklentisi yalnızca release derlemesinde yüklemeye çalışıp org/proje bilgisi olmadan build'i düşürüyordu (`An organization ID or slug is required`). Artık gerekmiyor ve kaldırıldı. Aynı hatayı yerelde `./gradlew` ile denerken görürsen sebebi budur — o durumda `SENTRY_DISABLE_AUTO_UPLOAD=true` ile çalıştır.

### Kablosuz güncelleme (EAS Update)

JS değişiklikleri yeni build almadan gönderilebiliyor. Build profilleri kanallara bağlı (`development` / `preview` / `production`):

```bash
eas update --branch preview --message "galeri kaydı düzeltildi"
```

**`runtimeVersion` politikası `appVersion`** — yani güncelleme uyumluluğu `app.json`'daki `version` alanına bağlı. Bu, bir güncellemenin hangi build'lere ineceğini belirleyen tek şey.

Bu yüzden `eas.json`'daki **`appVersionSource` `local` olmak zorunda**. `remote` seçilirse sürümün sahibi EAS sunucusu oluyor: build'in gömdüğü sürüm ile `eas update`'in yereldeki `app.json`'dan hesapladığı `runtimeVersion` sessizce ayrılabiliyor ve güncelleme yanlış binary'ye iniyor. `local` ile iki taraf da aynı dosyayı okuyor. Karşılığında `android.versionCode` da `app.json`'da tutuluyor — `production` profilindeki `autoIncrement` onu yerelde artırıp dosyaya yazıyor, artan değeri commit'lemek gerekiyor.

> ⚠️ **Native tarafı değiştiren her değişiklikte `version` ELLE artırılmalı** — yeni native paket, yeni config plugin, `expo.install.exclude`'daki sürümlerin değişmesi. Artırılmazsa, native tarafı değişmiş bir JS güncellemesi eski binary'ye iner ve uygulama açılışta çöker (bkz. worklets/reanimated uyuşmazlığı geçmişi).
>
> Bu disiplin normalde `fingerprint` politikasıyla otomatik sağlanırdı ve önce o seçilmişti. Ama yönetilen (CNG) projede tutmuyor: `android/` klasörü yerelde yok, EAS onu derleme sırasında üretip parmak izini ondan SONRA hesaplıyor. İki taraf hiçbir zaman eşleşmiyor ve EAS build'i "Runtime version mismatch" ile düşürüyor. `appVersion` deterministik: iki tarafta da aynı sonucu veriyor.

Pratikte: JS-only değişiklik → `eas update` yeter. Native değişiklik → `version`'ı artır **ve** yeni build al.

#### Güncelleme kullanıcıya nasıl ulaşıyor

`expo-updates` açılışta kendiliğinden bir kez bakıp indiriyor, ama indirdiğini **ancak bir sonraki soğuk açılışta** uyguluyor. Uygulamayı günlerce arka planda tutan kullanıcı için bu pratikte "hiçbir zaman" demek: güncelleme cihazda hazır bekler, kimsenin haberi olmaz. `lib/appUpdates.ts` iki şey ekliyor — uygulama öne geldiğinde tekrar bakmak (15 dakikada birden sık değil, aksi halde günde onlarca gereksiz istek) ve hazır olduğunda `UpdateBanner`'ı göstermek.

Yeniden başlatma **asla kendiliğinden** yapılmıyor, yalnızca kullanıcı dokununca: reload o an ekranda ne varsa siler (yazılmakta olan not, seçilmiş fotoğraf). Kaydetme sürerken (`useIsMutating`) düğme kapalı — yarıda kesilen bir fotoğraf yüklemesi kullanıcı için veri kaybı gibi görünürdü. Kuyruğa alınmış çevrimdışı kayıtlar reload'dan etkilenmiyor; mutation'lar AsyncStorage'a kalıcılaştırıldığı için `resumePausedMutations` onları devralıyor.

> `ready` bayrağı bilerek expo-updates'in kendi `isUpdatePending`'inden okunuyor, kendi state'imizden değil. Açılıştaki otomatik indirme bizim kodumuzdan geçmiyor — kendi bayrağımızı tutsaydık o durumda hiç açılmaz ve zaten hazır olan güncelleme duyurulmazdı.

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

Kalite kapısının üçü de temiz: ESLint sıfır sorun, `tsc --noEmit` temiz, 44 test paketi / 460 test geçiyor. Kod tabanında `any` yok — `@typescript-eslint/no-explicit-any` hata seviyesinde açık.

### Android izinleri

Manifest'e giren izinlerin tamamı uygulamanın gerçekten kullandığı bir yeteneğe karşılık geliyor. Üç tanesi bunu sağlamak için **bilerek söktürülüyor** (`app.json` → `android.blockedPermissions`):

| İzin | Nereden geliyor | Neden gerekmiyor |
|---|---|---|
| `READ_MEDIA_VIDEO` | `expo-image-picker`, `expo-media-library` | Seçici `mediaTypes` verilmeden çağrılıyor → varsayılan `images` |
| `READ_MEDIA_AUDIO` | aynı eklentiler | Uygulama sesli hiçbir şeye dokunmuyor |
| `SYSTEM_ALERT_WINDOW` | Expo prebuild şablonu (hem `src/main` hem `src/debug`) | Yalnızca debug'a özel kod kullanıyor — bkz. aşağıdaki not |

**Neden `permissions` listesinden çıkarmak yetmiyor:** bu izinler bizim listemizden değil, bağımlılıkların kendi manifest'lerinden geliyor. Manifest merge sırasında yine ekleniyorlar. `blockedPermissions` ise onlara `tools:node="remove"` işareti koyuyor, yani merge sonunda düşüyorlar.

`SYSTEM_ALERT_WINDOW`'a dair not: Expo şablonu bu izni `android/app/src/main/AndroidManifest.xml`'e de yazıyor, dolayısıyla **release AAB'ye de giriyordu**. Oysa tek kullananlar debug'a özel: `expo-dev-menu/android/src/debug/.../DevMenuDevToolsDelegate.kt` ve React Native'in `devsupport/DebugOverlayController.kt`'si — release build'de ikisi de hiç çalışmıyor. Ayrıca `android/app/src/debug/AndroidManifest.xml` izni **ayrıca** tanımlıyor ve build tipi manifest'i main'den yüksek öncelikli olduğu için development build'in dev menüsü etkilenmiyor; sökülen yalnızca release.

`SYSTEM_ALERT_WINDOW` Play'in "kısıtlı izin" beyan listesinde değil, yani yayını **engellemiyor** — ama uygulamanın hiç kullanmadığı, mağaza listesinde görünen ve kötüye kullanıldığında overlay/tapjacking yüzeyi açan özel bir erişim. Kaldırılması hijyen; `READ_MEDIA_*` ise Play Console'un geniş medya erişimi için istediği ayrı gerekçe formunu tetiklediğinden daha somut bir kazanç.

**Doğrulamak için** (izinlere veya eklentilere dokunan her değişiklikten sonra):

```bash
npx expo prebuild --platform android --no-install
```

Ardından `android/app/src/main/AndroidManifest.xml`'de `tools:node="remove"` işaretlerini kontrol et. Merge'ün gerçek sonucunu görmek istersen Gradle'a sordur:

```bash
cd android && SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew :app:processReleaseMainManifest :app:processDebugMainManifest
```

Sonuç `android/app/build/intermediates/merged_manifest/<variant>/` altında. İki uyarı: `processReleaseMainManifest` yerelde Sentry'nin yükleme adımını tetikleyip build'i düşürüyor, başına `SENTRY_DISABLE_AUTO_UPLOAD=true` koy (aynı sebep, bkz. yukarıdaki Sentry bölümü). İşin bitince **üretilen `android/` klasörünü sil** — proje yönetilen (CNG) akışta, `android/` yerelde tutulmaz; `package.json`'daki `android`/`ios` script'lerini de geri al, prebuild onları `expo start --*` yerine `expo run:*` olarak değiştiriyor.

Bu yolla ölçülmüş son durum — **release** varyantının birleşmiş manifest'indeki `android.permission.*` izinleri:

```
ACCESS_NETWORK_STATE  ACCESS_WIFI_STATE  CAMERA  INTERNET  POST_NOTIFICATIONS
READ_APP_BADGE  READ_EXTERNAL_STORAGE  READ_MEDIA_IMAGES
READ_MEDIA_VISUAL_USER_SELECTED  RECEIVE_BOOT_COMPLETED  VIBRATE
WAKE_LOCK  WRITE_EXTERNAL_STORAGE
```

`SYSTEM_ALERT_WINDOW`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO` ve `RECORD_AUDIO` listede yok. **Debug** varyantında ise `SYSTEM_ALERT_WINDOW` duruyor (medya izinleri orada da düşüyor) — yani dev menüsü çalışmaya devam ediyor, tasarlanan ayrım tutuyor.

## Bilinen açık uçlar

- Onboarding tek ekranda (`welcome.tsx`); planlanan ek adımlar henüz yok. Akış bağlı ve testli — adım eklemek istendiğinde `app/index.tsx`'teki karara dokunmadan `(onboarding)` altına yeni ekran koymak yeterli.
- Yasal metinler ve `settings/help.tsx`'in render testi yok — içerikleri statik. Veri yazan ve geri alınamaz akışların hepsi testli.
- `assets/images/adaptive-icon.png` ile `splash-icon.png` bire bir aynı dosya. Android adaptif ikonun dış bölgesini kırptığı için logonun kenarları kesiliyor — güvenli alanı olan ayrı bir varyant gerekiyor.
- `npm run gen:types` yalnızca proje Supabase CLI'a link'liyken çalışır; aksi halde `lib/database.types.ts` elle güncellenmeli.
- Galeriye kaydetme (`app/compare/index.tsx`), `expo-media-library`'yi try/catch'li `require` ile yüklüyor: bu native modül Expo Go'da bulunmadığı için import anında throw eder, yakalanır ve "Kaydet" bilinçli olarak devre dışı kalıp kullanıcıyı development build'e / "Paylaş"a yönlendirir. Beklenen davranış — galeri kaydı için development/production build gerekir.
