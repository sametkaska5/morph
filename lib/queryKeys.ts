/**
 * TÜM React Query anahtarlarının tek kaynağı.
 *
 * Neden: anahtarlar 14 dosyaya elle yazılmış string dizileri halinde dağılmıştı.
 * Bir invalidation'ın hangi sorguları kapsadığı ancak tüm dosyalar taranarak
 * anlaşılabiliyordu ve aile dışında kalan bir anahtar sessizce bayat kalıyordu
 * (bkz. aşağıdaki entries.year notu — gerçek yaşanmış bug).
 *
 * Kurallar:
 * - Yeni bir sorgu eklerken anahtarı BURADA tanımla, ekranda elle dizi yazma.
 * - `all` anahtarları invalidation için: `invalidateQueries({ queryKey: X.all })`
 *   o ailenin tüm alt anahtarlarını kapsar (React Query prefix eşleşmesi).
 * - Anahtar ŞEKLİNİ değiştirmek persist edilmiş offline cache'i o sorgu için
 *   ıskalatır (eski veri çöpe düşer, yenisi fetch edilir) — bilinçli yap ve
 *   veri şekli de değiştiyse _layout.tsx'teki PERSIST_CACHE_BUSTER'ı artır.
 */
export const queryKeys = {
  /** Girdi listeleri — hepsi ["entries", ...] ailesi altında ki tek
   *  invalidateQueries(entries.all) çağrısı tüm listeleri tazelesin. */
  entries: {
    all: ["entries"] as const,
    timeline: () => ["entries", "timeline"] as const,
    capsule: () => ["entries", "capsule"] as const,
    searchIndex: (userId: string | undefined) => ["entries", "search-index", userId] as const,
    pickable: (userId: string | undefined) => ["entries", "pickable", userId] as const,
    order: () => ["entries", "order"] as const,
    /** Eskiden ["yearEntries", ...] idi — aile DIŞINDA kaldığı için hiçbir
     *  mutation onu invalidate etmiyordu ve yıl takvimi yeni kayıttan sonra
     *  bayat kalıyordu. Aileye taşımak bug'ı kökten çözdü. */
    year: (userId: string | undefined, year: number) =>
      ["entries", "year", userId, year] as const,
  },

  /** Tek girdi detayı (görüntüleme + düzenleme formu). */
  entry: {
    all: ["entry"] as const,
    detail: (id: string) => ["entry", id] as const,
    edit: (id: string) => ["entry", "edit", id] as const,
  },

  profile: {
    all: ["profile"] as const,
    info: (userId: string | undefined) => ["profile", "info", userId] as const,
    stats: (userId: string | undefined) => ["profile", "stats", userId] as const,
    unitPref: (userId: string | undefined) => ["profile", "unit_pref", userId] as const,
  },

  measurementTypes: {
    all: ["measurement_types"] as const,
    byUser: (userId: string | undefined) => ["measurement_types", userId] as const,
  },

  measurementSeries: {
    all: ["measurement_series"] as const,
    byType: (userId: string | undefined, typeId: string | undefined) =>
      ["measurement_series", userId, typeId] as const,
  },

  currentWeek: {
    all: ["currentWeek"] as const,
    /** weekOffset: 0 = bu hafta, -1 = önceki hafta... (bkz. lib/stats.ts useWeek) */
    byWeek: (userId: string | undefined, weekOffset: number) =>
      ["currentWeek", userId, weekOffset] as const,
  },

  shareablePhotos: {
    all: ["shareablePhotos"] as const,
    byUser: (userId: string | undefined) => ["shareablePhotos", userId] as const,
  },

  workoutDay: {
    all: ["workoutDay"] as const,
    byDate: (userId: string | undefined, date: string) => ["workoutDay", userId, date] as const,
  },

  programDay: {
    all: ["programDay"] as const,
    byDate: (userId: string | undefined, date: string) => ["programDay", userId, date] as const,
  },

  comparison: (a: string | undefined, b: string | undefined) => ["comparison", a, b] as const,

  notificationSettings: (userId: string | undefined) =>
    ["notification_settings", userId] as const,
} as const;
