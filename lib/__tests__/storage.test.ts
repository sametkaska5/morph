import { coverPhotoRow, coverPhotoPath, coverThumbPath, photoCacheKey } from "../storage";

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

describe("coverPhotoPath", () => {
  it("kapak satırının tam boy storage yolunu verir", () => {
    const entry = {
      cover_photo_id: "p2",
      photos: [
        { id: "p1", storage_path: "u/e/eski.jpg" },
        { id: "p2", storage_path: "u/e/yeni.jpg" },
      ],
    };
    expect(coverPhotoPath(entry)).toBe("u/e/yeni.jpg");
  });

  it("tek nesne photos'ta düz storage_path'i verir", () => {
    expect(coverPhotoPath({ photos: { storage_path: "u/e/tek.jpg" } })).toBe("u/e/tek.jpg");
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
