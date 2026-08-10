import { createSupabaseMock, type SupabaseMock } from "./helpers/supabaseMock";

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

import {
  coverPhotoRow,
  coverThumbPath,
  photoCacheKey,
  uploadPhoto,
  uploadThumb,
  uploadAvatar,
} from "../storage";

beforeEach(() => {
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

/**
 * Dosya adı eskiden yalnızca `Date.now()` idi. Aynı milisaniyede iki yükleme
 * olduğunda (galeriden çoklu seçim, ya da tam boy + küçük kopya arka arkaya) yol
 * birebir aynı çıkıyor ve `upload` varsayılan olarak üzerine yazmadığı için
 * ikincisi hata veriyordu — kullanıcı için sebebi görünmeyen bir
 * "fotoğraf eklenemedi".
 */
describe("yükleme yolları — çakışma", () => {
  beforeEach(() => {
    // Zamanı DONDURUYORUZ: çakışmanın tek sebebi zaten aynı milisaniye.
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("aynı milisaniyedeki iki fotoğraf yüklemesi AYRI yollar üretir", async () => {
    const a = await uploadPhoto("u1", "e1", "A");
    const b = await uploadPhoto("u1", "e1", "B");

    expect(a).not.toBe(b);
    expect(sb.storageUploads.map((u) => u.path)).toEqual([a, b]);
  });

  it("tam boy ve küçük kopya birbirini ezmez", async () => {
    const full = await uploadPhoto("u1", "e1", "A");
    const thumb = await uploadThumb("u1", "e1", "A");

    expect(thumb).not.toBe(full);
    // "thumb-" öneki korunuyor: klasör tarayan işlemler buna dayanıyor.
    expect(thumb).toContain("/thumb-");
  });

  it("avatar yolları da çakışmaz ve avatar/ klasöründe kalır", async () => {
    const a = await uploadAvatar("u1", "A");
    const b = await uploadAvatar("u1", "B");

    expect(a).not.toBe(b);
    expect(a).toContain("u1/avatar/avatar-");
    expect(b).toContain("u1/avatar/avatar-");
  });
});

// coverPhotoRow: photos!entry_id ilişkisi bir DİZİ döndürür ve sırası garanti
// değil. Kör photos[0] almak, aynı güne ikinci kez kayıt/değişiklik yapıldığında
// ESKİ fotoğrafı seçebiliyordu — bu yüzden cover_photo_id ile eşleşen satırı seçmeli.

describe("coverPhotoRow", () => {
  it("cover_photo_id ile EŞLEŞEN satırı seçer (dizinin sırasına bakmaz)", () => {
    const entry = {
      cover_photo_id: "p2",
      photos: [
        { id: "p1", storage_path: "u/e/eski.jpg" },
        { id: "p2", storage_path: "u/e/yeni.jpg" },
      ],
    };
    expect(coverPhotoRow<{ id: string; storage_path: string }>(entry)?.id).toBe("p2");
  });

  it("cover_photo_id yoksa ilk fotoğrafa geri düşer (eski kayıtlar)", () => {
    const entry = {
      cover_photo_id: null,
      photos: [
        { id: "p1", storage_path: "u/e/a.jpg" },
        { id: "p2", storage_path: "u/e/b.jpg" },
      ],
    };
    expect(coverPhotoRow<{ id: string }>(entry)?.id).toBe("p1");
  });

  it("cover_photo_id eşleşmiyorsa da ilk fotoğrafa geri düşer", () => {
    const entry = {
      cover_photo_id: "silinmis",
      photos: [{ id: "p1", storage_path: "u/e/a.jpg" }],
    };
    expect(coverPhotoRow<{ id: string }>(entry)?.id).toBe("p1");
  });

  it("boş fotoğraf dizisinde null döner", () => {
    expect(coverPhotoRow({ cover_photo_id: "x", photos: [] })).toBeNull();
  });

  it("photos dizi değil tek nesneyse onu döner", () => {
    const row = { storage_path: "u/e/tek.jpg" };
    expect(coverPhotoRow<{ storage_path: string }>({ photos: row })).toEqual(row);
  });

  it("photos yoksa null döner", () => {
    expect(coverPhotoRow({})).toBeNull();
  });
});

describe("coverThumbPath", () => {
  it("thumb_path varsa onu verir", () => {
    const entry = {
      cover_photo_id: "p1",
      photos: [{ id: "p1", storage_path: "u/e/full.jpg", thumb_path: "u/e/thumb-1.jpg" }],
    };
    expect(coverThumbPath(entry)).toBe("u/e/thumb-1.jpg");
  });

  it("thumb_path yoksa tam boy storage_path'e geri düşer (eski kayıtlar)", () => {
    const entry = {
      cover_photo_id: "p1",
      photos: [{ id: "p1", storage_path: "u/e/full.jpg", thumb_path: null }],
    };
    expect(coverThumbPath(entry)).toBe("u/e/full.jpg");
  });
});

describe("photoCacheKey", () => {
  it("varyantı anahtara ekler (thumb ve full ayrı cache)", () => {
    const path = "u/e/foto.jpg";
    expect(photoCacheKey(path, "thumb")).toBe("u/e/foto.jpg@thumb");
    expect(photoCacheKey(path, "full")).toBe("u/e/foto.jpg@full");
    // Aynı dosyanın iki varyantı ASLA aynı anahtarı paylaşmamalı — yoksa 400px
    // ile 1080px sürüm birbirinin yerine gösterilir.
    expect(photoCacheKey(path, "thumb")).not.toBe(photoCacheKey(path, "full"));
  });

  it("varyant verilmezse düz yolu döner", () => {
    expect(photoCacheKey("u/e/foto.jpg")).toBe("u/e/foto.jpg");
  });
});
