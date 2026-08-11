/**
 * store/play-listing.md içindeki alanların Play Console sınırlarına uyduğunu
 * doğrular.
 *
 * NEDEN BETİK: Play sınırı aşan alanı KAYDETTİRMİYOR — metni konsola yapıştırıp
 * orada saymak, düzenleme sırasında kolayca kaçırılan bir tur. Sınırlar ayrıca
 * KARAKTER cinsinden, bayt değil: Türkçe metinde "ş" bir karakter ama iki bayt,
 * yani bayt sayan bir kontrol yanlış alarm verirdi. Emoji gibi çift birimli
 * karakterleri de doğru saymak için Array.from kullanılıyor.
 *
 * Çalıştır: node scripts/check-listing.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "store", "play-listing.md");

const src = fs.readFileSync(FILE, "utf8");

/** Başlıktaki "— sınır N" ifadesinden hemen sonraki kod bloğunu yakalar. */
const FIELD_RE = /^##\s+(.+?)\s+—\s+sınır\s+(\d+)\s*$\n+```\n([\s\S]*?)\n```/gm;

const rows = [];
let m;
while ((m = FIELD_RE.exec(src))) {
  const [, name, limitText, body] = m;
  const limit = Number(limitText);
  // Play karakter sayar; kod birimini değil grafik birimini saymak için Array.from.
  const length = Array.from(body).length;
  rows.push({ name, limit, length, ok: length <= limit });
}

if (rows.length === 0) {
  console.error("Hiç alan bulunamadı — store/play-listing.md'nin başlık biçimi değişmiş olabilir.");
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("Alan", 26)} ${pad("Uzunluk", 9)} ${pad("Sınır", 7)} Durum`);
for (const r of rows) {
  console.log(
    `${pad(r.name, 26)} ${pad(r.length, 9)} ${pad(r.limit, 7)} ${
      r.ok ? `tamam (${r.limit - r.length} karakter pay)` : `AŞIYOR (+${r.length - r.limit})`
    }`
  );
}

const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} alan sınırı aşıyor.`);
  process.exit(1);
}
console.log("\nHepsi sınırların içinde.");
