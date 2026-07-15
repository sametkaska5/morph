# Remory

## Kurulum

```bash
npm install
```

`.env` dosyası oluştur (Supabase proje ayarlarından alacaksın):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxxx
```

Supabase şemasını kur:

```bash
supabase link --project-ref <proje-ref>
supabase db push
```

(`supabase/migrations/0001_init.sql` — sohbette çıkardığımız ERD'nin tamamı burada.)

Çalıştır:

```bash
npx expo start
```

## Klasör yapısı

```
app/
  (onboarding)/     onboarding akışı (welcome.tsx şimdilik tek ekran)
  (tabs)/           5 sekmeli ana navigasyon
    index.tsx       Ana Ekran — tam implemente edildi
    zaman-kapsulu.tsx, capture.tsx, istatistikler.tsx, profil.tsx  — stub, sırada
lib/
  supabase.ts       Supabase client
  notifications.ts  yerel bildirim zamanlama ("X ay önce bugün" mantığı)
supabase/migrations/
  0001_init.sql     tam veri şeması + RLS politikaları
```

## Şu ana kadar tamamlanan

- Proje iskeleti, NativeWind tema tokenları (tasarım sistemimizdeki renkler)
- Supabase şeması + RLS
- Ana Ekran'ın gerçek implementasyonu (Supabase'den veri çeken query dahil)
- Bildirim zamanlama mantığının iskeleti

## Sırada

- Anı Akışı, Çekim, İstatistik, Profil ekranlarının implementasyonu
- Kart çevirme animasyonu (react-native-reanimated ile)
- Onboarding akışının kalan 4 ekranı
