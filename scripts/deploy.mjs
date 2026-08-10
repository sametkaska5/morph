// @ts-check
import { spawnSync } from "node:child_process";

/**
 * Kablosuz güncellemeyi yayınlar VE hemen ardından kaynak haritalarını yükler.
 *
 * NEDEN AYRI BİR SCRIPT — iki basit alternatif de çalışmıyor:
 *
 * 1) npm'in `post<script>` kancası: repodaki .npmrc'de `ignore-scripts=true` var
 *    (kurulum sırasında bağımlılıkların betiklerini çalıştırmamak için, bilinçli)
 *    ve bu bayrak pre/post kancalarını da kapatıyor. Kanca yalnızca
 *    `--no-ignore-scripts` ile geçildiğinde çalışıyor — yani "unutulması imkânsız
 *    olsun" amacının tam tersi.
 *
 * 2) `eas update ... && npm run update:sourcemaps` zinciri: `npm run X -- --message "..."`
 *    ile geçen argümanlar zincirin SONUNA ekleniyor, yani eas'a değil harita
 *    yükleyicisine gidiyor. Üstelik token eksikse hata ancak güncelleme ÇOKTAN
 *    yayınlandıktan sonra çıkıyor.
 *
 * Buradaki sıra bunu düzeltiyor: token önce kontrol ediliyor (yayından ÖNCE
 * durur), güncelleme başarısız olursa haritalar hiç yüklenmiyor.
 *
 * Kullanım:
 *   npm run deploy:preview -- --message "kisa aciklama"
 *   npm run deploy:production -- --message "kisa aciklama"
 *
 * --message verilmezse eas kendi sorar. Fazladan yazılan her bayrak (örn.
 * --platform android) olduğu gibi eas update'e geçer.
 */

const [channel, ...passthrough] = process.argv.slice(2);

if (!channel) {
  console.error("Kanal gerekli: node scripts/deploy.mjs <preview|production>");
  process.exit(1);
}

const isWindows = process.platform === "win32";

/**
 * Kaynak haritaları OLMADAN yayınlamak, Sentry'yi sessizce işe yaramaz hale
 * getiriyor: yığın izleri `index.android.bundle:1:284917` gibi çözümlenmemiş
 * geliyor. Token'ı en başta kontrol ediyoruz ki eksikse güncelleme hiç
 * yayınlanmasın — yayınlandıktan sonra fark etmek geri alınamıyor.
 *
 * `$env:SENTRY_AUTH_TOKEN` yalnızca o terminalin içinde yaşıyor, yani her yeni
 * pencerede baştan verilmesi gerekiyor.
 */
if (!process.env.SENTRY_AUTH_TOKEN) {
  console.error(
    [
      "SENTRY_AUTH_TOKEN tanımlı değil — güncelleme YAYINLANMADI.",
      "",
      "Kaynak haritaları yüklenmezse Sentry'deki yığın izleri okunamaz hale gelir,",
      "ve bunu ancak bir hata düştüğünde fark edersin. O yüzden burada duruyoruz.",
      "",
      "Aynı terminalde şunu ver, sonra komutu tekrarla:",
      '  $env:SENTRY_AUTH_TOKEN = "sntrys_ile_baslayan_token"',
    ].join("\n"),
  );
  process.exit(1);
}

/**
 * Windows'ta cmd.exe için argüman tırnaklama.
 *
 * Gerekiyor çünkü Windows'ta `shell: true` ŞART: npm ve npx birer .cmd dosyası ve
 * Node 24, .cmd/.bat dosyalarını shell olmadan çalıştırmayı reddediyor
 * (spawnSync EINVAL — CVE-2024-27980 yamasından beri). shell açıldığında ise
 * argüman dizisi tek bir komut satırına birleşiyor, yani çok kelimeli bir
 * --message değeri tırnaklanmazsa iki ayrı argümana bölünüyor.
 */
function quoteForCmd(arg) {
  if (!/[\s"&|<>^()]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function run(command, args) {
  console.log(`\n→ ${command} ${args.join(" ")}\n`);

  // POSIX'te shell'e hiç gerek yok: argümanları dizi olarak geçmek en güvenlisi,
  // hiçbir yeniden ayrıştırma olmuyor.
  const { status, error } = isWindows
    ? spawnSync([command, ...args.map(quoteForCmd)].join(" "), {
        stdio: "inherit",
        shell: true,
      })
    : spawnSync(command, args, { stdio: "inherit" });

  if (error) {
    console.error(`\n${command} çalıştırılamadı: ${error.message}`);
    process.exit(1);
  }
  return status ?? 1;
}

const updateStatus = run("npx", ["eas-cli", "update", "--branch", channel, ...passthrough]);

if (updateStatus !== 0) {
  // Yayın başarısızsa dist/ ya hiç oluşmadı ya da yarım kaldı; harita yüklemek
  // en iyi durumda boşa iş, en kötü durumda YANLIŞ paketin haritalarını yükler.
  console.error("\nGüncelleme yayınlanamadı — kaynak haritaları yüklenmedi.");
  process.exit(updateStatus);
}

const sourcemapStatus = run("npm", ["run", "update:sourcemaps"]);

if (sourcemapStatus !== 0) {
  // Güncelleme YAYINDA ama haritalar gitmedi. Sessizce başarılı görünmesin:
  // bu durumda tek yapılması gereken token'ı verip `npm run update:sourcemaps`
  // komutunu tekrar çalıştırmak — dist/ hâlâ o yayının paketini içeriyor.
  console.error(
    [
      "",
      "DİKKAT: güncelleme yayınlandı ama kaynak haritaları yüklenemedi.",
      "dist/ hâlâ bu yayının paketini içeriyor, tek başına tekrar denenebilir:",
      "  npm run update:sourcemaps",
    ].join("\n"),
  );
  process.exit(sourcemapStatus);
}

console.log(`\n✓ ${channel} kanalına yayınlandı ve kaynak haritaları yüklendi.`);
