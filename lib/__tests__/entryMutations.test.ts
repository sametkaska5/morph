import { createSupabaseMock, argOf, type SupabaseMock } from "./helpers/supabaseMock";

/**
 * saveEntry — fotoğraflı kaydın YAZMA yolu.
 *
 * Bu, uygulamanın en riskli fonksiyonu: offline'da kuyruğa alınıp saatler sonra
 * yeniden çalıştırılabiliyor (resumePausedMutations) ve içinde storage + üç
 * tablo üzerinde sıralı işlemler var. Buradaki testler o sözleşmeyi sabitliyor.
 */

let sb: SupabaseMock;

// jest.mock çağrıları dosyanın en üstüne taşınır (hoisting) ve fabrikaların
// dışarıdaki değişkenlere erişmesi yalnızca `mock` önekliyse serbest — bu yüzden
// hepsi mock* adlı. Getter kullanmamızın sebebi: fabrika modül yüklenirken bir
// kez çalışıyor, oysa istemci her testte beforeEach'te yeniden kuruluyor.
let mockSbClient: unknown;
const mockUploadPhoto = jest.fn();
const mockUploadThumb = jest.fn();

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));
jest.mock("../storage", () => ({
  uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
  uploadThumb: (...args: unknown[]) => mockUploadThumb(...args),
}));

import { saveEntry, registerEntryMutationDefaults, SAVE_ENTRY_MUTATION_KEY } from "../entryMutations";

const BASE_PAYLOAD = {
  userId: "u1",
  date: "2026-08-01",
  note: "iyi geçti",
  values: {} as Record<string, string>,
  photoBase64: "PHOTO",
};

/**
 * entries.select (mevcut not) → entries.upsert → photos.select (mevcut sıra) →
 * photos.insert → cover update sırasıyla varsayılan başarılı sonuçlar.
 * `existingPhotos`, o güne DAHA ÖNCE eklenmiş fotoğrafları temsil eder
 * (order_index hesabı için okunuyor); `existingEntry` o günün zaten var olan
 * kaydını (notu korumak için okunuyor).
 */
function queueHappyPath(
  existingPhotos: { order_index: number }[] = [],
  existingEntry: { note: string | null } | null = null
) {
  sb.queue("entries", { data: existingEntry }); // mevcut not sorgusu (maybeSingle)
  sb.queue("entries", { data: { id: "e1", date: BASE_PAYLOAD.date } }); // upsert().select().single()
  sb.queue("photos", { data: existingPhotos }); // mevcut order_index sorgusu
  sb.queue("photos", { data: { id: "p-new" } }); // insert().select().single()
  sb.queue("entries", {}); // update cover_photo_id
}

/** Fotoğraf INSERT zinciri — mevcut sıra sorgusundan sonraki ikinci photos çağrısı. */
const photoInsert = () => sb.chainsFor("photos")[1];
/** Gün UPSERT zinciri — mevcut not sorgusundan sonraki ikinci entries çağrısı. */
const entryUpsert = () => sb.chainsFor("entries")[1];
/** cover_photo_id UPDATE zinciri. */
const coverUpdateChain = () => sb.chainsFor("entries")[2];

beforeEach(() => {
  sb = createSupabaseMock();
  mockSbClient = sb.client;
  mockUploadPhoto.mockReset().mockResolvedValue("u1/e1/foto.jpg");
  mockUploadThumb.mockReset().mockResolvedValue("u1/e1/thumb-foto.jpg");
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("saveEntry — mutlu yol", () => {
  it("günü upsert eder, fotoğrafı yükler ve kapak olarak işaretler", async () => {
    queueHappyPath();

    const entry = await saveEntry({ ...BASE_PAYLOAD, thumbBase64: "THUMB" });

    // Gün, (user_id, date) çakışmasında güncellenir — günde tek kayıt kuralı.
    const upsert = entryUpsert();
    expect(argOf(upsert, "upsert")).toEqual({
      user_id: "u1",
      date: "2026-08-01",
      type: "log",
      note: "iyi geçti",
    });
    expect(argOf(upsert, "upsert", 1)).toEqual({ onConflict: "user_id,date" });

    expect(mockUploadPhoto).toHaveBeenCalledWith("u1", "e1", "PHOTO");
    expect(mockUploadThumb).toHaveBeenCalledWith("u1", "e1", "THUMB");

    // Fotoğraf satırı hem tam boy hem küçük kopya yolunu taşımalı.
    expect(argOf(photoInsert(), "insert")).toEqual({
      entry_id: "e1",
      storage_path: "u1/e1/foto.jpg",
      thumb_path: "u1/e1/thumb-foto.jpg",
      order_index: 0,
    });

    // Kapak, YENİ eklenen fotoğrafa işaret etmeli.
    const coverUpdate = coverUpdateChain();
    expect(argOf(coverUpdate, "update")).toEqual({ cover_photo_id: "p-new" });
    expect(argOf(coverUpdate, "eq", 1)).toBe("e1");

    expect(entry).toEqual({ id: "e1", date: "2026-08-01" });
  });

  it("thumbnail üretilmemişse (eski offline kuyruk) tam boyla devam eder", async () => {
    queueHappyPath();

    // thumbBase64 YOK: bu alan eklenmeden önce kuyruğa girmiş mutation'lar
    // böyle geliyor — senkronize olabilmeliler.
    await saveEntry(BASE_PAYLOAD);

    expect(mockUploadThumb).not.toHaveBeenCalled();
    expect(argOf(photoInsert(), "insert")).toMatchObject({ thumb_path: null });
  });

  it("thumbnail yüklemesi patlarsa kaydı DÜŞÜRMEZ, thumb_path null kalır", async () => {
    queueHappyPath();
    mockUploadThumb.mockRejectedValue(new Error("storage 500"));

    const entry = await saveEntry({ ...BASE_PAYLOAD, thumbBase64: "THUMB" });

    expect(entry).toEqual({ id: "e1", date: "2026-08-01" });
    expect(argOf(photoInsert(), "insert")).toMatchObject({ thumb_path: null });
  });
});

/**
 * Aynı güne ikinci fotoğraf.
 *
 * Burası eskiden tam TERSİNİ test ediyordu: saveEntry o günün diğer tüm
 * fotoğraflarını satır ve dosya olarak SİLİYORDU (kapak karışıklığını çözmek
 * için konmuştu). Sonucu, kullanıcının sabah çektiği fotoğrafın akşam ikinci
 * fotoğrafı çekince geri dönüşsüz kaybolmasıydı — hiçbir uyarı olmadan. Artık
 * bir güne birden fazla fotoğraf eklenebiliyor; kapak karışıklığı silerek değil,
 * kapağı açıkça en son eklenene vererek çözülüyor.
 */
describe("saveEntry — aynı güne ikinci fotoğraf", () => {
  it("eski fotoğrafı SİLMEZ — ne satırını ne dosyasını", async () => {
    queueHappyPath([{ order_index: 0 }]);

    await saveEntry({ ...BASE_PAYLOAD, thumbBase64: "THUMB" });

    expect(sb.storageRemovals).toHaveLength(0);
    // photos tablosuna yalnızca mevcut sıra sorgusu + insert gitmeli, delete YOK.
    expect(sb.chainsFor("photos")).toHaveLength(2);
  });

  it("yeni fotoğrafı mevcutların ARDINA koyar", async () => {
    // Sıra korunmazsa detay şeridi fotoğrafları çekildikleri sırayla değil
    // rastgele gösterirdi.
    queueHappyPath([{ order_index: 0 }, { order_index: 1 }]);

    await saveEntry(BASE_PAYLOAD);

    expect(argOf(photoInsert(), "insert")).toMatchObject({ order_index: 2 });
  });

  it("o günün ilk fotoğrafında sıra 0'dan başlar", async () => {
    queueHappyPath([]);

    await saveEntry(BASE_PAYLOAD);

    expect(argOf(photoInsert(), "insert")).toMatchObject({ order_index: 0 });
  });

  it("not boş bırakılırsa o günün MEVCUT notunu korur", async () => {
    // Yeni kayıt ekranı o günün mevcut notunu hiç göstermiyor. Notu koşulsuz
    // yazsaydık, sabah "harika bir gün" yazan kullanıcı akşam ikinci fotoğrafı
    // eklerken notunu farkında olmadan silmiş olurdu.
    queueHappyPath([{ order_index: 0 }], { note: "sabah yazdığım not" });

    await saveEntry({ ...BASE_PAYLOAD, note: null });

    expect(argOf(entryUpsert(), "upsert")).toMatchObject({ note: "sabah yazdığım not" });
  });

  it("kullanıcı yeni not yazdıysa mevcut notun yerine ONU yazar", async () => {
    queueHappyPath([{ order_index: 0 }], { note: "eski not" });

    await saveEntry({ ...BASE_PAYLOAD, note: "yeni not" });

    expect(argOf(entryUpsert(), "upsert")).toMatchObject({ note: "yeni not" });
  });

  it("kapağı EN SON eklenen fotoğrafa verir", async () => {
    // Kullanıcı az önce çektiği fotoğrafı ızgarada görmeyi bekler.
    queueHappyPath([{ order_index: 0 }]);

    await saveEntry(BASE_PAYLOAD);

    const coverUpdate = coverUpdateChain();
    expect(argOf(coverUpdate, "update")).toEqual({ cover_photo_id: "p-new" });
  });
});

describe("saveEntry — ölçüm değerleri", () => {
  it("geçersiz girdiyi DB'ye yazmaz, geçerliyi virgüllü ondalıkla kabul eder", async () => {
    queueHappyPath();

    await saveEntry({
      ...BASE_PAYLOAD,
      values: { kilo: "72,5", bel: "abc", gogus: "", yag: "18" },
    });

    // "abc" ve "" düşmeli; "72,5" → 72.5 olmalı. Bu, offline kuyruktan gelen
    // eski/bozuk payload'lara karşı son savunma katmanı.
    expect(argOf(sb.chainsFor("measurement_values")[0], "upsert")).toEqual([
      { entry_id: "e1", measurement_type_id: "kilo", value: 72.5 },
      { entry_id: "e1", measurement_type_id: "yag", value: 18 },
    ]);
  });

  it("yazılacak geçerli ölçüm yoksa measurement_values'a hiç gitmez", async () => {
    queueHappyPath();

    await saveEntry({ ...BASE_PAYLOAD, values: { kilo: "", bel: "  " } });

    expect(sb.chainsFor("measurement_values")).toHaveLength(0);
  });
});

describe("saveEntry — hata yolları", () => {
  it("gün upsert'ü patlarsa fotoğrafı YÜKLEMEZ (yetim dosya bırakmaz)", async () => {
    sb.queue("entries", { data: null }); // mevcut not sorgusu
    sb.queue("entries", { error: { message: "boom" } });

    await expect(saveEntry(BASE_PAYLOAD)).rejects.toEqual({ message: "boom" });
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it("fotoğraf satırı eklenemezse hatayı yukarı fırlatır", async () => {
    sb.queue("entries", { data: null }); // mevcut not sorgusu
    sb.queue("entries", { data: { id: "e1" } });
    sb.queue("photos", { data: [] }); // mevcut sıra sorgusu
    sb.queue("photos", { error: { message: "insert failed" } });

    await expect(saveEntry(BASE_PAYLOAD)).rejects.toEqual({ message: "insert failed" });
  });

  it("ölçüm yazımı patlarsa hatayı yukarı fırlatır", async () => {
    queueHappyPath();
    sb.queue("measurement_values", { error: { message: "constraint" } });

    await expect(saveEntry({ ...BASE_PAYLOAD, values: { kilo: "70" } })).rejects.toEqual({
      message: "constraint",
    });
  });
});

describe("registerEntryMutationDefaults", () => {
  it("mutationFn'i kayıtlı tutar — offline kuyruk yeniden başlatma sonrası çalışabilsin", () => {
    const setMutationDefaults = jest.fn();
    registerEntryMutationDefaults({ setMutationDefaults } as never);

    expect(setMutationDefaults).toHaveBeenCalledWith(SAVE_ENTRY_MUTATION_KEY, expect.any(Object));
    expect(setMutationDefaults.mock.calls[0][1].mutationFn).toBe(saveEntry);
  });

  it("başarıda listeleri, profili ve ölçüm serisini tazeler", () => {
    const setMutationDefaults = jest.fn();
    const invalidateQueries = jest.fn();
    registerEntryMutationDefaults({ setMutationDefaults, invalidateQueries } as never);

    setMutationDefaults.mock.calls[0][1].onSuccess();

    const invalidated = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidated).toEqual([["entries"], ["profile"], ["measurement_series"]]);
  });
});
