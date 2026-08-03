import { orderEntryPhotos, nextOrderIndex, nextCoverAfterDelete } from "../photos";

/**
 * Bir günün fotoğraf listesini yöneten saf mantık.
 *
 * Şema ilk günden beri çoklu fotoğrafa hazırdı ama uygulama gün başına tek
 * fotoğraf varsayıyordu. Bu üç fonksiyon o varsayımın kalktığı yerdeki üç
 * sessiz hata kaynağını kapatıyor: yanlış sıralama (kullanıcı yanlış güne
 * baktığını sanır), çakışan order_index ve kapaksız kalan kayıt.
 */

const p = (id: string, order_index: number) => ({ id, storage_path: `${id}.jpg`, order_index });

describe("orderEntryPhotos", () => {
  it("kapağı HER ZAMAN başa alır", () => {
    // Kapak başta olmazsa detay ekranı ızgaradakinden farklı bir fotoğrafla
    // açılır — kullanıcı yanlış günü açtığını sanar.
    const rows = [p("a", 0), p("b", 1), p("c", 2)];
    expect(orderEntryPhotos(rows, "c").map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("kalanları order_index'e göre sıralar", () => {
    const rows = [p("c", 2), p("a", 0), p("b", 1)];
    expect(orderEntryPhotos(rows, "a").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("kapak yoksa (eski/bozuk kayıt) yalnızca sıraya göre dizer, kaybetmez", () => {
    const rows = [p("b", 1), p("a", 0)];
    expect(orderEntryPhotos(rows, null).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("kapak id'si listede yoksa fotoğrafları yine de döner", () => {
    // cover_photo_id "on delete set null" ile boşalmış ya da bayat olabilir.
    const rows = [p("a", 0), p("b", 1)];
    expect(orderEntryPhotos(rows, "silinmis").map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("aynı order_index'te sıralama kararlıdır (her render'da aynı)", () => {
    // Kararsız olsaydı şerit yeniden çizildikçe fotoğraflar yer değiştirirdi.
    const rows = [p("b", 0), p("a", 0)];
    expect(orderEntryPhotos(rows, null).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("boş listede çökmez", () => {
    expect(orderEntryPhotos([], null)).toEqual([]);
  });
});

describe("nextOrderIndex", () => {
  it("ilk fotoğrafta 0 verir", () => {
    expect(nextOrderIndex([])).toBe(0);
  });

  it("mevcut en büyüğün bir fazlasını verir", () => {
    expect(nextOrderIndex([{ order_index: 0 }, { order_index: 3 }])).toBe(4);
  });

  it("uzunluğu değil MAKSİMUMU baz alır (silinme sonrası çakışmasın)", () => {
    // Aradan silme yapılınca uzunluk düşer ama indeksler düşmez; uzunluk baz
    // alınsaydı yeni fotoğraf mevcut biriyle aynı sıraya düşerdi.
    expect(nextOrderIndex([{ order_index: 5 }])).toBe(6);
  });
});

describe("nextCoverAfterDelete", () => {
  it("kapak silinince sıradaki ilk fotoğrafı kapak yapar", () => {
    const ordered = [p("kapak", 0), p("b", 1), p("c", 2)];
    expect(nextCoverAfterDelete(ordered, "kapak")).toBe("b");
  });

  it("son fotoğraf silinirse devredecek kapak yoktur", () => {
    expect(nextCoverAfterDelete([p("tek", 0)], "tek")).toBeNull();
  });

  it("kapak olmayan bir fotoğraf silinse de listenin ilkini döner", () => {
    // Çağıran taraf bunu yalnızca kapak silinirken kullanıyor; yine de
    // fonksiyon kendi başına tutarlı olmalı.
    const ordered = [p("kapak", 0), p("b", 1)];
    expect(nextCoverAfterDelete(ordered, "b")).toBe("kapak");
  });
});
