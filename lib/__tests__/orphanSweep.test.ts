import { createSupabaseMock, argOf, type SupabaseMock } from "./helpers/supabaseMock";

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

import { pickOrphans, sweepOrphanPhotos, type CandidateFile } from "../orphanSweep";

beforeEach(() => {
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

const HOUR = 1000 * 60 * 60;
const NOW = 1_700_000_000_000; // sabit "şimdi"
const WINDOW = 24 * HOUR;

// Yardımcı: verilen yaş (saat) kadar eski bir aday üret.
function file(path: string, ageHours: number | null): CandidateFile {
  return { path, createdAt: ageHours === null ? null : NOW - ageHours * HOUR };
}

describe("pickOrphans", () => {
  it("referans kümesindeki dosyayı ASLA silmez (eski olsa bile)", () => {
    const candidates = [file("u/e/kapak.jpg", 100)];
    const referenced = new Set(["u/e/kapak.jpg"]);
    expect(pickOrphans(candidates, referenced, NOW, WINDOW)).toEqual([]);
  });

  it("referanssız ve güvenlik penceresinden eski dosyayı yetim sayar", () => {
    const candidates = [file("u/e/yetim.jpg", 48)]; // 48s > 24s
    expect(pickOrphans(candidates, new Set(), NOW, WINDOW)).toEqual(["u/e/yetim.jpg"]);
  });

  it("referanssız ama YENİ (pencere içi) dosyaya dokunmaz", () => {
    // Yükleme başarılı olup DB satırı henüz yazılmamış olabilir — korunmalı.
    const candidates = [file("u/e/taze.jpg", 2)]; // 2s < 24s
    expect(pickOrphans(candidates, new Set(), NOW, WINDOW)).toEqual([]);
  });

  it("createdAt bilinmiyorsa temkinli davranır (korur, silmez)", () => {
    const candidates = [file("u/e/tarihsiz.jpg", null)];
    expect(pickOrphans(candidates, new Set(), NOW, WINDOW)).toEqual([]);
  });

  it("pencere sınırındaki dosya (tam cutoff) yetim sayılır (<= cutoff)", () => {
    const candidates = [file("u/e/sinir.jpg", 24)]; // createdAt === cutoff
    expect(pickOrphans(candidates, new Set(), NOW, WINDOW)).toEqual(["u/e/sinir.jpg"]);
  });

  it("karışık gruptan yalnızca referanssız + eski olanları seçer", () => {
    const candidates = [
      file("u/e/kapak.jpg", 100), // referanslı -> kal
      file("u/e/thumb-1.jpg", 100), // referanslı -> kal
      file("u/avatar/avatar-1.jpg", 100), // referanslı (avatar) -> kal
      file("u/e/yetim-eski.jpg", 50), // referanssız + eski -> SİL
      file("u/e/yetim-yeni.jpg", 1), // referanssız + yeni -> kal
    ];
    const referenced = new Set(["u/e/kapak.jpg", "u/e/thumb-1.jpg", "u/avatar/avatar-1.jpg"]);
    expect(pickOrphans(candidates, referenced, NOW, WINDOW)).toEqual(["u/e/yetim-eski.jpg"]);
  });

  it("boş aday listesinde boş döner", () => {
    expect(pickOrphans([], new Set(["x"]), NOW, WINDOW)).toEqual([]);
  });
});

/**
 * sweepOrphanPhotos'un I/O yolu.
 *
 * Bu, uygulamadaki en YIKICI kod: yanlış karar verirse kullanıcının gerçek
 * fotoğrafını siler ve geri dönüşü yok. `pickOrphans` (saf karar) baştan beri
 * test ediliyordu ama onu BESLEYEN iki toplama adımı test edilmiyordu — oysa
 * hatanın asıl kaynağı orada: referans kümesi eksik kalırsa referanslı bir dosya
 * "yetim" sanılıp silinir.
 */
describe("sweepOrphanPhotos", () => {
  const OLD = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(); // 48 saat önce

  /** photos sayfaları + profiles satırı — referans kümesinin kaynağı. */
  function queueReferences(pages: { storage_path: string; thumb_path?: string | null }[][]) {
    for (const page of pages) sb.queue("photos", { data: page });
    sb.queue("profiles", { data: { avatar_path: null } });
  }

  it("referanslı dosyaya DOKUNMAZ, yalnızca yetimi siler", async () => {
    queueReferences([[{ storage_path: "u1/e1/kapak.jpg", thumb_path: "u1/e1/thumb-kapak.jpg" }]]);
    sb.queueStorageList(
      { data: [{ name: "e1" }] },
      {
        data: [
          { name: "kapak.jpg", created_at: OLD },
          { name: "thumb-kapak.jpg", created_at: OLD },
          { name: "yetim.jpg", created_at: OLD },
        ],
      },
    );

    const result = await sweepOrphanPhotos("u1");

    expect(sb.storageRemovals).toEqual([{ bucket: "photos", paths: ["u1/e1/yetim.jpg"] }]);
    expect(result).toEqual({ scanned: 3, deleted: 1 });
  });

  it("avatarı referans sayar — her süpürmede silinmemeli", async () => {
    for (const page of [[]]) sb.queue("photos", { data: page });
    sb.queue("profiles", { data: { avatar_path: "u1/avatar/avatar-1.jpg" } });
    sb.queueStorageList(
      { data: [{ name: "avatar" }] },
      { data: [{ name: "avatar-1.jpg", created_at: OLD }] },
    );

    await sweepOrphanPhotos("u1");

    expect(sb.storageRemovals).toHaveLength(0);
  });

  /**
   * Sayfalama sıralaması OLMADAN Postgres satır sırasını garanti etmiyor: aynı
   * satır iki sayfada birden çıkabiliyor ya da HİÇ çıkmıyor. Eksik kalan satır
   * "referanssız" sayılıp gerçek bir fotoğrafın silinmesi demek. Kararlı sıra
   * (birincil anahtar) bunu imkânsız kılıyor.
   */
  it("referans sorgusunu KARARLI bir sırayla sayfalar", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      storage_path: `u1/e1/${i}.jpg`,
      thumb_path: null,
    }));
    queueReferences([fullPage, [{ storage_path: "u1/e1/son.jpg", thumb_path: null }]]);
    sb.queueStorageList({ data: [] });

    await sweepOrphanPhotos("u1");

    const photoChains = sb.chainsFor("photos");
    // Sayfa dolu geldiği için ikinci sayfa da istenmiş olmalı.
    expect(photoChains).toHaveLength(2);
    for (const chain of photoChains) {
      expect(argOf(chain, "order")).toBe("id");
    }
    // İkinci sayfa bir SONRAKİ aralığı istemeli.
    expect(argOf(photoChains[1], "range")).toBe(1000);
  });

  it("1000'den fazla dosyası olan klasörü de tamamen tarar", async () => {
    // Sayfalama olmadan 1000'den sonraki dosyalar hiç TARANMIYORDU: o
    // kullanıcılarda süpürme fiilen çalışmıyor, yetimler sonsuza kadar kalıyordu.
    queueReferences([[]]);
    const files = Array.from({ length: 1200 }, (_, i) => ({
      name: `${i}.jpg`,
      created_at: OLD,
    }));
    sb.queueStorageList({ data: [{ name: "e1" }] }, { data: files });

    const result = await sweepOrphanPhotos("u1");

    expect(result.scanned).toBe(1200);
    expect(result.deleted).toBe(1200);
  });

  it("referans kümesi çekilemezse HİÇBİR şey silmez", async () => {
    // En önemli güvence: küme eksikse her dosya yetim gibi görünür.
    sb.queue("photos", { error: { message: "network" } });
    sb.queueStorageList({ data: [{ name: "e1" }] }, { data: [{ name: "a.jpg", created_at: OLD }] });

    await expect(sweepOrphanPhotos("u1")).rejects.toEqual({ message: "network" });
    expect(sb.storageRemovals).toHaveLength(0);
  });
});
