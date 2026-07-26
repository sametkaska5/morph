import { pickOrphans, type CandidateFile } from "../orphanSweep";

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
    const referenced = new Set([
      "u/e/kapak.jpg",
      "u/e/thumb-1.jpg",
      "u/avatar/avatar-1.jpg",
    ]);
    expect(pickOrphans(candidates, referenced, NOW, WINDOW)).toEqual(["u/e/yetim-eski.jpg"]);
  });

  it("boş aday listesinde boş döner", () => {
    expect(pickOrphans([], new Set(["x"]), NOW, WINDOW)).toEqual([]);
  });
});
