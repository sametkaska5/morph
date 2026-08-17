import { supabase } from "./supabase";
import { decode } from "base64-arraybuffer";

const SIGNED_URL_EXPIRY = 60 * 60 * 6; // 6 saat — sık sık yenilemeye gerek kalmasın

/**
 * Çakışmayan dosya adı üretir.
 *
 * Ad eskiden yalnızca `Date.now()` idi. Aynı milisaniyede iki yükleme olduğunda
 * (galeriden çoklu seçim, ya da tam boy + küçük kopya) yol birebir aynı çıkıyor
 * ve `upload` varsayılan olarak üzerine yazmadığı için ikincisi hata veriyordu —
 * kullanıcı için "fotoğraf eklenemedi", sebebi görünmez. Zaman damgasını
 * okunabilirlik için tutuyoruz (dosya adına bakıp ne zaman yüklendiğini görmek
 * işe yarıyor), sonuna rastgele bir sonek ekliyoruz.
 */
function uniqueFileName(prefix = "") {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now()}-${suffix}.jpg`;
}

export async function uploadPhoto(userId: string, entryId: string, base64: string) {
  const path = `${userId}/${entryId}/${uniqueFileName()}`;

  const { error } = await supabase.storage.from("photos").upload(path, decode(base64), {
    contentType: "image/jpeg",
  });

  if (error) throw error;
  return path;
}

/**
 * Izgaralarda kullanılan küçük kopyayı yükler. Aynı bucket ve aynı storage
 * politikaları (0003_storage_policies.sql) geçerli; sadece dosya adı "thumb-"
 * önekli, böylece hesap silme (deleteAllUserPhotos) gibi klasör tarayan işlemler
 * ekstra bir değişiklik olmadan thumbnail'leri de kapsıyor.
 */
export async function uploadThumb(userId: string, entryId: string, base64: string) {
  const path = `${userId}/${entryId}/${uniqueFileName("thumb-")}`;

  const { error } = await supabase.storage.from("photos").upload(path, decode(base64), {
    contentType: "image/jpeg",
  });

  if (error) throw error;
  return path;
}

/**
 * Profil fotoğrafını "photos" bucket'ında {user_id}/avatar/ altına yükler — entry
 * fotoğraflarıyla aynı bucket'ı ve aynı storage politikalarını (0003_storage_policies.sql)
 * paylaşıyor, sadece yol öneki farklı; ayrı bir politika/bucket gerekmiyor.
 */
export async function uploadAvatar(userId: string, base64: string) {
  const path = `${userId}/avatar/${uniqueFileName("avatar-")}`;

  const { error } = await supabase.storage.from("photos").upload(path, decode(base64), {
    contentType: "image/jpeg",
  });

  if (error) throw error;
  return path;
}

/**
 * Storage'ın list() metodu VARSAYILAN OLARAK yalnızca 100 kayıt döndürüyor ve
 * fazlasını sessizce atıyor. Hesap silmede bunun anlamı şuydu: 100'den fazla
 * günü olan kullanıcının fotoğrafları hesap silindikten SONRA da depoda
 * kalıyordu — kullanıcı "tüm verim silindi" diyen bir onay görüp öyle olmadığı
 * hâlde. Sayfa sayfa, son sayfaya kadar okuyoruz.
 */
const LIST_PAGE = 1000;

/** list() satırlarından OKUDUĞUMUZ alanlar (gerçek satırda fazlası var). */
export type StorageEntry = { name: string; created_at?: string | null };

/**
 * "photos" bucket'ında bir klasörün TÜM girdilerini döner — son sayfaya kadar.
 *
 * Hem hesap silme (deleteAllUserPhotos) hem yetim süpürmesi (lib/orphanSweep.ts)
 * buna ihtiyaç duyuyor ve ikisi de sessizce eksik listeyle çalışıyordu; tek
 * uygulama olsun diye burada.
 */
export async function listFolder(prefix: string): Promise<StorageEntry[]> {
  const all: StorageEntry[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage
      .from("photos")
      .list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < LIST_PAGE) break;
  }
  return all;
}

/**
 * Hesap silinirken kullanıcının "photos" bucket'ındaki {user_id}/ altındaki TÜM
 * dosyaları (entry fotoğrafları + avatar) kaldırır. Storage'ın list() metodu tek
 * seviye döndürdüğü için önce alt klasörleri (her entry_id + avatar), sonra
 * içindeki dosyaları listeleyip tam yollarını topluyoruz.
 */
export async function deleteAllUserPhotos(userId: string) {
  const folders = await listFolder(userId);

  const filePaths: string[] = [];
  for (const folder of folders) {
    for (const file of await listFolder(`${userId}/${folder.name}`)) {
      filePaths.push(`${userId}/${folder.name}/${file.name}`);
    }
  }

  // remove() de tek istekte sınırlı sayıda yol kabul ediyor; parça parça
  // gönderiyoruz ki tek büyük istek reddedilip her şey geride kalmasın.
  const REMOVE_CHUNK = 500;
  for (let i = 0; i < filePaths.length; i += REMOVE_CHUNK) {
    const { error } = await supabase.storage
      .from("photos")
      .remove(filePaths.slice(i, i + REMOVE_CHUNK));
    if (error) throw error;
  }
}

/**
 * Kapak seçicilerinin kabul ettiği en az alan kümesi.
 *
 * Neden somut bir satır tipi değil: sorgular photos ilişkisini farklı şekillerde
 * seçiyor — `photos!entry_id(...)` bir DİZİ, `photos!cover_photo_id(...)` ise
 * TEKİL bir satır döndürüyor; seçilen kolonlar da çağrı yerine göre değişiyor
 * (kimi yerde thumb_path var, kimi yerde yok). Bu yüzden yapısal bir tip
 * kullanıyoruz. Eskiden burada `any` vardı ve yanlış yazılmış bir alan adı
 * sessizce undefined dönüyordu.
 */
export type PhotoRowLike = {
  id?: string | null;
  storage_path?: string | null;
  thumb_path?: string | null;
};

export type EntryRowWithPhotos<T extends PhotoRowLike = PhotoRowLike> = {
  cover_photo_id?: string | null;
  photos?: T | T[] | null;
};

/**
 * Bir entry satırının KAPAK fotoğrafı SATIRINI ({ id, storage_path, ... }) döner.
 * `photos!entry_id(...)` ilişkisi bir DİZİ döndürüyor ve dizinin sırası garanti
 * değil — körlemesine photos[0] almak, aynı güne ikinci kez kayıt yapıldığında (ya
 * da fotoğraf değiştirildiğinde) eski fotoğrafı seçebiliyor. cover_photo_id ile
 * eşleşeni seçiyoruz; kapağı olmayan eski kayıtlar için ilk fotoğrafa geri düşüyoruz.
 */
export function coverPhotoRow<T extends PhotoRowLike = PhotoRowLike>(
  entryRow: EntryRowWithPhotos<T> | null | undefined,
): T | null {
  const photos = entryRow?.photos;
  if (photos == null) return null;
  if (!Array.isArray(photos)) return photos;
  if (photos.length === 0) return null;
  const cover = photos.find((p) => p.id === entryRow?.cover_photo_id);
  return cover ?? photos[0] ?? null;
}

/**
 * Izgaralar için kapak fotoğrafının KÜÇÜK kopyasının yolunu döner.
 * thumb_path yoksa (thumbnail'den önce yazılmış eski kayıtlar) tam boy
 * storage_path'e geri düşer — eski kayıtlar bozulmaz, sadece büyük iner.
 * Sorguda `photos(...)` içine thumb_path'i eklemeyi unutma.
 */
export function coverThumbPath(entryRow: EntryRowWithPhotos | null | undefined): string | null {
  const photos = entryRow?.photos;
  const row = Array.isArray(photos) ? coverPhotoRow(entryRow) : photos;
  return row?.thumb_path ?? row?.storage_path ?? null;
}

/**
 * Fotoğraflar depoya en fazla 1280px / %75 kaliteyle yazılıyor (bkz. lib/capture.ts).
 * Ama 3 sütunlu ızgaralarda kare ~108pt (3x ekranda ~325px) gösteriliyor — yani
 * ızgaraya gereğinden ~12 kat fazla piksel iniyordu. Supabase'in görsel dönüşümü
 * ile her ekrana gösterdiği boyutta görsel sunuyoruz.
 *
 * DİKKAT: Varyant, expo-image cache anahtarının da parçası olmak ZORUNDA
 * (bkz. photoCacheKey). Aksi halde ızgaradaki 400px sürüm ile tam ekrandaki
 * 1080px sürüm aynı anahtarı paylaşır ve biri diğerinin yerine gösterilir.
 */
const PHOTO_VARIANTS = {
  /** 3 sütunlu ızgaralar, arama listesi — küçük kareler. */
  thumb: { width: 400, quality: 65 },
  /** Tam ekran görünümler — anı akışı, kayıt detayı. */
  full: { width: 1080, quality: 80 },
} as const;

export type PhotoVariant = keyof typeof PHOTO_VARIANTS;

/**
 * expo-image için stabil cache anahtarı. İmzalı URL'nin token'ı her fetch'te
 * değiştiğinden URL'ye göre anahtarlanan cache aynı fotoğrafı sürekli yeniden
 * indiriyor; anahtarı değişmeyen storage yoluna + varyanta bağlıyoruz.
 */
export function photoCacheKey(path: string, variant?: PhotoVariant) {
  return variant ? `${path}@${variant}` : path;
}

/**
 * Supabase'in sunucu tarafı görsel dönüşümü (render/image) YALNIZCA ücretli
 * planlarda açık ve varsayılan olarak kapalı tutuyoruz.
 *
 * Neden varsayılan kapalı: dönüşüm batch imzalama ile çalışmadığından (bkz.
 * getPhotoUrls) path başına ayrı istek atmak gerekiyor. Free planda bunların
 * hepsi hata alacağı için her ekran ilk açılışta onlarca boşa istek atardı —
 * yani hızlandırmak isterken yavaşlatırdı.
 *
 * Pro plana geçersen burayı `true` yap. Izgaralar zaten yüklemede üretilen
 * thumbnail'i kullandığı için asıl kazanç tam ekran görünümlerde ve thumbnail'i
 * olmayan ESKİ kayıtlarda olur.
 */
const SUPABASE_IMAGE_TRANSFORM_ENABLED = false;

/**
 * Dönüşüm açıkken de bir güvenlik ağı: imzalama hata verirse (plan düşürüldü,
 * özellik kapatıldı) bir daha denemeyip dönüşümsüz yola kalıcı geri dönüyoruz.
 * Uygulama çalışmaya devam eder, sadece eskisi gibi büyük dosyalar iner.
 */
let transformAvailable = SUPABASE_IMAGE_TRANSFORM_ENABLED;

export async function getPhotoUrl(path: string, variant?: PhotoVariant) {
  const transform = variant && transformAvailable ? PHOTO_VARIANTS[variant] : undefined;

  const { data, error } = await supabase.storage
    .from("photos")
    .createSignedUrl(path, SIGNED_URL_EXPIRY, transform ? { transform } : undefined);

  if (error) {
    // Dönüşüm desteklenmiyorsa dönüşümsüz olarak bir kez daha dene (variant
    // geçmediğimiz için bu çağrı tekrar buraya düşmez).
    if (transform) {
      transformAvailable = false;
      return getPhotoUrl(path);
    }
    throw error;
  }
  return data.signedUrl;
}

/**
 * Birden fazla fotoğrafın imzalı linkini üretir.
 *
 * `variant` verilmezse TEK batch isteği kullanılır (en az ağ gidiş-gelişi).
 * `variant` verildiğinde path başına ayrı istek atmak zorundayız: Supabase'in
 * batch `createSignedUrls` API'si transform kabul etmiyor ve dönüşüm imzanın
 * içine gömüldüğü için hazır bir imzalı URL'ye sonradan query param eklenemiyor.
 * İstekler paralel gittiğinden ek gecikme küçük; karşılığında inen bayt miktarı
 * ızgaralarda kat kat azalıyor.
 */
export async function getPhotoUrls(
  paths: string[],
  variant?: PhotoVariant,
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return new Map();

  if (variant && transformAvailable) {
    const transformed = await signWithTransform(uniquePaths, variant);
    if (transformed) return transformed;
  }

  const { data, error } = await supabase.storage
    .from("photos")
    .createSignedUrls(uniquePaths, SIGNED_URL_EXPIRY);
  if (error) throw error;

  const map = new Map<string, string>();
  (data ?? []).forEach((d) => {
    if (d.signedUrl && d.path) map.set(d.path, d.signedUrl);
  });
  return map;
}

/** Başarısız olursa null döner ve çağıran dönüşümsüz batch'e geri düşer. */
async function signWithTransform(
  paths: string[],
  variant: PhotoVariant,
): Promise<Map<string, string> | null> {
  const transform = PHOTO_VARIANTS[variant];
  try {
    const entries = await Promise.all(
      paths.map(async (path) => {
        const { data, error } = await supabase.storage
          .from("photos")
          .createSignedUrl(path, SIGNED_URL_EXPIRY, { transform });
        if (error) throw error;
        return [path, data.signedUrl] as const;
      }),
    );
    return new Map(entries);
  } catch {
    transformAvailable = false;
    return null;
  }
}
