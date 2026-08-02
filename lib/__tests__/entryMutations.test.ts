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

/** entries.upsert → photos.insert sırasıyla varsayılan başarılı sonuçlar. */
function queueHappyPath(stalePhotos: unknown[] = []) {
  sb.queue("entries", { data: { id: "e1", date: BASE_PAYLOAD.date } }); // upsert().select().single()
  sb.queue("photos", { data: { id: "p-new" } }); // insert().select().single()
  sb.queue("entries", {}); // update cover_photo_id
  sb.queue("photos", { data: stalePhotos }); // bayat fotoğraf sorgusu
}

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
    const upsert = sb.chainsFor("entries")[0];
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
    expect(argOf(sb.chainsFor("photos")[0], "insert")).toEqual({
      entry_id: "e1",
      storage_path: "u1/e1/foto.jpg",
      thumb_path: "u1/e1/thumb-foto.jpg",
      order_index: 0,
    });

    // Kapak, YENİ eklenen fotoğrafa işaret etmeli.
    const coverUpdate = sb.chainsFor("entries")[1];
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
    expect(argOf(sb.chainsFor("photos")[0], "insert")).toMatchObject({ thumb_path: null });
  });

  it("thumbnail yüklemesi patlarsa kaydı DÜŞÜRMEZ, thumb_path null kalır", async () => {
    queueHappyPath();
    mockUploadThumb.mockRejectedValue(new Error("storage 500"));

    const entry = await saveEntry({ ...BASE_PAYLOAD, thumbBase64: "THUMB" });

    expect(entry).toEqual({ id: "e1", date: "2026-08-01" });
    expect(argOf(sb.chainsFor("photos")[0], "insert")).toMatchObject({ thumb_path: null });
  });
});

describe("saveEntry — aynı güne ikinci kayıt (bayat fotoğraf temizliği)", () => {
  it("eski fotoğrafın hem dosyalarını hem satırını siler, yenisine dokunmaz", async () => {
    queueHappyPath([
      { id: "p-old", storage_path: "u1/e1/eski.jpg", thumb_path: "u1/e1/thumb-eski.jpg" },
    ]);

    await saveEntry({ ...BASE_PAYLOAD, thumbBase64: "THUMB" });

    // Bayat sorgusu YENİ fotoğrafı dışlamalı (neq), yoksa az önce eklediğimizi silerdik.
    const staleQuery = sb.chainsFor("photos")[1];
    expect(argOf(staleQuery, "eq", 1)).toBe("e1");
    expect(argOf(staleQuery, "neq", 1)).toBe("p-new");

    // Tam boy VE küçük kopya birlikte silinmeli — yoksa storage'da yetim
    // thumbnail dosyaları birikiyordu.
    expect(sb.storageRemovals).toEqual([
      { bucket: "photos", paths: ["u1/e1/eski.jpg", "u1/e1/thumb-eski.jpg"] },
    ]);

    const deleteChain = sb.chainsFor("photos")[2];
    expect(argOf(deleteChain, "in", 1)).toEqual(["p-old"]);
  });

  it("thumb_path'i olmayan eski kayıtta yalnızca tam boyu siler (null yol göndermez)", async () => {
    queueHappyPath([{ id: "p-old", storage_path: "u1/e1/eski.jpg", thumb_path: null }]);

    await saveEntry(BASE_PAYLOAD);

    expect(sb.storageRemovals[0].paths).toEqual(["u1/e1/eski.jpg"]);
  });

  it("bayat fotoğraf yoksa storage'a hiç dokunmaz", async () => {
    queueHappyPath([]);

    await saveEntry(BASE_PAYLOAD);

    expect(sb.storageRemovals).toHaveLength(0);
    // photos tablosuna yalnızca insert + bayat sorgusu gitmeli, delete YOK.
    expect(sb.chainsFor("photos")).toHaveLength(2);
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
    sb.queue("entries", { error: { message: "boom" } });

    await expect(saveEntry(BASE_PAYLOAD)).rejects.toEqual({ message: "boom" });
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it("fotoğraf satırı eklenemezse hatayı yukarı fırlatır", async () => {
    sb.queue("entries", { data: { id: "e1" } });
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
