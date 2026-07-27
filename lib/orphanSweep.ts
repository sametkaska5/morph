import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { captureError } from "./monitoring";

/**
 * "Yetim dosya" temizliği.
 *
 * Fotoğraflar iki yerde yaşıyor: Storage'daki gerçek .jpg dosyaları ve onların
 * yolunu tutan `photos` tablosu satırları. Uygulama bir fotoğrafa HER ZAMAN
 * satır üzerinden ulaşır — yani hiçbir satırın işaret etmediği bir storage
 * dosyası "görünmez"dir: kimse erişemez ama yer kaplamaya devam eder ("yetim").
 *
 * Yetimler şuralardan doğar: kayıt akışında yükleme başarılı olup sonraki DB
 * adımı hata verirse; ya da (düzeltilmeden önce) düzenleme ekranında foto seçilip
 * kaydedilmeden çıkılırsa. Bu iş, storage'ı `photos` + avatar referanslarıyla
 * kıyaslayıp eşleşmeyen ESKİ dosyaları siler.
 */

const LAST_SWEEP_KEY = "remory-last-orphan-sweep";
const SWEEP_INTERVAL_MS = 1000 * 60 * 60 * 24; // günde en fazla bir kez süpür
const SAFETY_WINDOW_MS = 1000 * 60 * 60 * 24; // son 24 saatte yüklenmişlere dokunma

export type CandidateFile = { path: string; createdAt: number | null };

/**
 * SAF karar fonksiyonu: verilen adaylardan hangileri silinmeli?
 *
 * I/O'dan ayrı tutuluyor ki bu DESTRUCTIVE mantık birim testle kilitlenebilsin.
 * Bir aday yalnızca (a) referans kümesinde DEĞİLSE ve (b) güvenlik penceresinden
 * ESKİYSE silinir. createdAt bilinmiyorsa temkinli davranıp KORUNUR — silinmez.
 */
export function pickOrphans(
  candidates: CandidateFile[],
  referenced: Set<string>,
  now: number,
  safetyWindowMs: number = SAFETY_WINDOW_MS
): string[] {
  const cutoff = now - safetyWindowMs;
  return candidates
    .filter((c) => !referenced.has(c.path))
    // createdAt null ise `now` varsayıyoruz -> now > cutoff -> korunur (silinmez).
    .filter((c) => (c.createdAt ?? now) <= cutoff)
    .map((c) => c.path);
}

/**
 * Kullanıcının SİLİNMEMESİ gereken tüm storage yollarını toplar: photos
 * tablosundaki tam boy + thumbnail yolları, bir de profil avatarı.
 *
 * Sayfalama KRİTİK: küme eksik olursa referanslı bir dosya "yetim" sanılıp
 * silinebilir. O yüzden photos'u sayfa sayfa, son sayfaya kadar çekiyoruz.
 * Herhangi bir sorgu hata verirse throw ediyoruz — çağıran taraf o zaman
 * HİÇBİR ŞEY silmiyor.
 */
async function collectReferencedPaths(userId: string): Promise<Set<string>> {
  const referenced = new Set<string>();
  const PAGE = 1000;

  // photos'ta user_id yok; entries üzerinden (inner join) kullanıcıya bağlanır.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("photos")
      .select("storage_path, thumb_path, entries!inner(user_id)")
      .eq("entries.user_id", userId)
      .range(from, from + PAGE - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      if (row.storage_path) referenced.add(row.storage_path);
      const thumb = (row as { thumb_path?: string | null }).thumb_path;
      if (thumb) referenced.add(thumb);
    }
    if (!data || data.length < PAGE) break;
  }

  // Avatar aynı bucket'ta ({userId}/avatar/...) ama photos tablosunda DEĞİL —
  // referansa eklemezsek her süpürmede avatar silinirdi.
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .single();
  if (profErr) throw profErr;
  if (profile?.avatar_path) referenced.add(profile.avatar_path);

  return referenced;
}

/**
 * {userId}/ altındaki tüm klasörleri gezip her dosyayı (yol + created_at) toplar.
 * Storage list'i tek seviye döndürdüğü için önce klasörleri, sonra içindekileri
 * listeliyoruz — deleteAllUserPhotos ile aynı desen.
 *
 * NOT: Burada eksik listeleme GÜVENLİDİR (sadece bazı yetimler o tur atlanır,
 * bir sonraki turda yakalanır); tehlikeli olan referans kümesinin eksik olmasıdır.
 */
async function collectCandidateFiles(userId: string): Promise<CandidateFile[]> {
  const candidates: CandidateFile[] = [];

  const { data: folders, error: listErr } = await supabase.storage
    .from("photos")
    .list(userId, { limit: 1000 });
  if (listErr) throw listErr;

  for (const folder of folders ?? []) {
    const { data: files, error } = await supabase.storage
      .from("photos")
      .list(`${userId}/${folder.name}`, { limit: 1000 });
    if (error) throw error;

    for (const file of files ?? []) {
      candidates.push({
        path: `${userId}/${folder.name}/${file.name}`,
        createdAt: file.created_at ? new Date(file.created_at).getTime() : null,
      });
    }
  }

  return candidates;
}

/**
 * Bir süpürme turu çalıştırır ve { taranan, silinen } döner. Hata olursa throw
 * eder (çağıran yutar). Referans kümesi güvenle çekilemezse (throw) hiçbir dosya
 * silinmez — false-delete'e karşı en önemli güvence budur.
 */
export async function sweepOrphanPhotos(userId: string): Promise<{ scanned: number; deleted: number }> {
  const referenced = await collectReferencedPaths(userId);
  const candidates = await collectCandidateFiles(userId);
  const orphans = pickOrphans(candidates, referenced, Date.now());

  if (orphans.length > 0) {
    const { error } = await supabase.storage.from("photos").remove(orphans);
    if (error) throw error;
  }

  return { scanned: candidates.length, deleted: orphans.length };
}

/**
 * Günde en fazla bir kez süpürür; uygulama açılışında fire-and-forget çağrılır.
 * Süpürme bir bakım işi — kullanıcı akışını ne bloklamalı ne de hatayla bölmeli,
 * o yüzden tüm hatalar sessizce yutulur.
 */
export async function maybeSweepOrphans(userId: string): Promise<void> {
  try {
    const last = await AsyncStorage.getItem(LAST_SWEEP_KEY);
    if (last && Date.now() - Number(last) < SWEEP_INTERVAL_MS) return;

    // Damgayı süpürmeden ÖNCE yazıyoruz: iş hata verse bile her açılışta yeniden
    // denemek yerine bir sonraki pencereye bırakıyoruz (storage list'leri boşa
    // harcamamak için).
    await AsyncStorage.setItem(LAST_SWEEP_KEY, String(Date.now()));

    const { scanned, deleted } = await sweepOrphanPhotos(userId);
    if (deleted > 0) {
      console.log(`[orphanSweep] ${deleted}/${scanned} yetim dosya temizlendi`);
    }
  } catch (err) {
    captureError(err, { where: "orphanSweep" });
  }
}
