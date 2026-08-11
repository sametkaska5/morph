/**
 * Yasal sayfaları docs/ altına HTML olarak üretir (GitHub Pages).
 *
 * NEDEN VAR: Play Console iki şeyi uygulama DIŞINDAN erişilebilir bir adreste
 * istiyor — gizlilik politikası ve hesap silme talebi yolu. Metni elle HTML'e
 * kopyalamak, uygulamadaki metinle ayrışmaya davetiye: biri güncellenir, diğeri
 * unutulur ve mağazadaki politika artık uygulamanın yaptığını anlatmaz. Bu
 * yüzden kaynak tek — lib/legal/*.json — ve HTML ondan türetiliyor.
 *
 * Hesap silme sayfasının uygulama içinde bir karşılığı yok (ekran değil, yalnızca
 * mağaza yükümlülüğü), o yüzden içeriği burada duruyor.
 *
 * Çalıştır: npm run gen:legal
 * CI, çıktının commit'lenmiş hâlle aynı olduğunu doğruluyor.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");

const APP_NAME = "Remory";
const CONTACT = "sametkaska5@gmail.com";

const read = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "legal", name), "utf8"));

/**
 * Uygulama içinde karşılığı OLMAYAN, yalnızca mağaza yükümlülüğü olan sayfa.
 * Google, hesap oluşturmaya izin veren uygulamalardan silme talebinin uygulama
 * dışından da belgelenmesini istiyor.
 */
const accountDeletion = {
  slug: "hesap-silme",
  title: "Hesap ve Veri Silme",
  updatedAt: "12 Ağustos 2026",
  sections: [
    {
      heading: "Hesabını uygulamadan silme",
      body: `${APP_NAME} uygulamasında Profil sekmesini aç, en alttaki "Hesabı Sil" seçeneğine dokun ve onayla. Silme işlemi anında ve geri döndürülemez şekilde uygulanır; ayrıca bir talep göndermene gerek yoktur.`,
    },
    {
      heading: "Silinen veriler",
      body: "Hesabın silindiğinde şunların tamamı kalıcı olarak silinir: hesap bilgilerin (e-posta, isim, profil fotoğrafı), eklediğin bütün anılar (tarih, not ve fotoğraflar), vücut ölçümlerin ve ölçüm tiplerin, birim tercihin ve bildirim ayarların. Fotoğraf dosyaları da depolama alanından kaldırılır.",
    },
    {
      heading: "Saklanan veriler",
      body: "Hesap silindikten sonra hiçbir kişisel veri saklanmaz. Uygulamanın hata izleme kayıtları kimliğinle ilişkilendirilmediği için silme işlemine dahil değildir; bu kayıtlar anılarının veya ölçümlerinin içeriğini taşımaz.",
    },
    {
      heading: "Uygulamaya erişemiyorsan",
      body: `Telefonunu kaybettiysen veya hesabına giriş yapamıyorsan, ${CONTACT} adresine hesabının e-posta adresiyle yazarak silme talebinde bulunabilirsin. Talebin en geç 30 gün içinde sonuçlandırılır.`,
    },
  ],
};

const escape = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Gövdedeki e-posta adreslerini tıklanabilir yapar (kaçışlardan SONRA). */
const linkifyEmail = (s) =>
  s.replace(/([^\s@]+@[^\s@]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');

const PAGES = [
  { file: "gizlilik.html", data: read("privacy.json") },
  { file: "kullanim-sartlari.html", data: read("terms.json") },
  { file: "hesap-silme.html", data: accountDeletion },
];

/**
 * Stil sayfaya GÖMÜLÜ: GitHub Pages'te tek dosyalık sayfalar, harici bir CSS
 * isteğinin yüklenememesi hâlinde okunamaz hâle gelmesin. Renkler uygulamanın
 * tasarım sisteminden (tailwind.config.js).
 */
const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem;
    background: #0A0A08; color: #F5F3EC;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 44rem; margin: 0 auto; }
  a { color: #8CE05A; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .4rem; }
  p { margin: 0 0 .5rem; color: #C9C6BC; }
  .meta { color: #8B8A82; font-size: .82rem; margin: 0 0 2rem; }
  nav { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid #26261F; font-size: .9rem; }
  nav a { margin-right: 1.25rem; display: inline-block; }
`;

function renderPage({ title, updatedAt, sections }) {
  const body = sections
    .map((s) => `    <h2>${escape(s.heading)}</h2>\n    <p>${linkifyEmail(escape(s.body))}</p>`)
    .join("\n");

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — ${APP_NAME}</title>
<style>${STYLE}</style>
</head>
<body>
  <main>
    <h1>${escape(title)}</h1>
    <p class="meta">${APP_NAME} · Son güncelleme: ${escape(updatedAt)}</p>
${body}
    <nav>
      <a href="./">${APP_NAME}</a>
      <a href="./gizlilik.html">Gizlilik Politikası</a>
      <a href="./kullanim-sartlari.html">Kullanım Şartları</a>
      <a href="./hesap-silme.html">Hesap ve Veri Silme</a>
    </nav>
  </main>
</body>
</html>
`;
}

const INDEX = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP_NAME}</title>
<style>${STYLE}</style>
</head>
<body>
  <main>
    <h1>${APP_NAME}</h1>
    <p class="meta">Fotoğraf tabanlı anı ve ilerleme günlüğü</p>
    <p>Bu sayfa ${APP_NAME} uygulamasının yasal metinlerini barındırıyor.</p>
    <nav>
      <a href="./gizlilik.html">Gizlilik Politikası</a>
      <a href="./kullanim-sartlari.html">Kullanım Şartları</a>
      <a href="./hesap-silme.html">Hesap ve Veri Silme</a>
    </nav>
  </main>
</body>
</html>
`;

fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(path.join(DOCS, "index.html"), INDEX);
for (const { file, data } of PAGES) {
  fs.writeFileSync(path.join(DOCS, file), renderPage(data));
}

console.log(`docs/ üretildi: index.html, ${PAGES.map((p) => p.file).join(", ")}`);
