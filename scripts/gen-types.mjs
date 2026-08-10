// @ts-check
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

/**
 * lib/database.types.ts dosyasını üretir.
 *
 * NEDEN AYRI BİR SCRIPT — tek satırlık bir `supabase gen types … > dosya`
 * yönlendirmesi iki şeyi birden yapamıyor:
 *
 * 1) Başlık açıklaması. Üretici çıktısının başına "bu dosya elle düzenlenmez"
 *    notunu koymak istiyoruz; kabuk yönlendirmesiyle bunu eklemek Windows ve
 *    Linux'ta farklı yazılır, çıktı da farklı olur.
 *
 * 2) CI karşılaştırması. CI, dosyayı yeniden üretip commit'lenmiş hâliyle
 *    BİREBİR karşılaştırıyor (git diff --exit-code). Bunun çalışması için
 *    üreten tarafın tek ve aynı olması şart — yerelde başka, CI'da başka bir
 *    komut çalışırsa fark hep çıkar ve kontrol anlamsızlaşır.
 *
 * Kullanım:
 *   node scripts/gen-types.mjs            link'li uzak projeden üretir (npm run gen:types)
 *   node scripts/gen-types.mjs --local    yerel Docker veritabanından üretir (CI)
 *
 * İki kaynağın da aynı çıktıyı vermesi beklenir; vermiyorsa canlı şema ile
 * supabase/migrations/ birbirinden ayrılmış demektir ve asıl bakılacak şey odur.
 */

const TARGET = "lib/database.types.ts";

const source = process.argv.includes("--local") ? "--local" : "--linked";

const header = `/**
 * OTOMATİK ÜRETİLDİ — ELLE DÜZENLEME.
 *
 * supabase/migrations/ altındaki şemanın TypeScript karşılığı. lib/supabase.ts
 * içinde createClient<Database>'e veriliyor; böylece tüm .from()/.select()/
 * .insert() çağrıları kolon adı ve tip düzeyinde denetleniyor, gömülü ilişki
 * seçimleri (photos!entry_id gibi) Relationships üzerinden çözülüyor.
 *
 * Şemayı değiştiren bir migration yazdığında yenile:
 *
 *   npm run gen:types
 *
 * Yenilemeyi unutursan CI yakalar: RLS işi bu dosyayı yerel veritabanından
 * yeniden üretip commit'lenmiş hâliyle karşılaştırıyor.
 */

`;

/**
 * CLI'a nasıl ulaşacağımız ortama göre değişiyor:
 *   - yerelde kurulu değil, `npx` paketi indirip çalıştırıyor
 *   - CI'da supabase/setup-cli onu doğrudan PATH'e koyuyor; orada npx demek
 *     aynı aracı bir de npm kayıt defterinden indirmek olurdu
 * Bu yüzden önce PATH'e bakıyoruz.
 */
function cli() {
  try {
    execSync("supabase --version", { stdio: "ignore" });
    return "supabase";
  } catch {
    return "npx supabase";
  }
}

// stdio: pipe -> çıktıyı yakalıyoruz; CLI'ın kendi ilerleme satırları stderr'e
// gittiği için karışmıyor. maxBuffer varsayılanı (1 MB) büyük şemalarda yetmez.
const generated = execSync(`${cli()} gen types typescript ${source} --schema public`, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  stdio: ["ignore", "pipe", "inherit"],
});

/**
 * İki kaynağın çıktısını aynı noktaya getiren normalizasyon.
 *
 * --linked çalışırken CLI, uzak projedeki PostgREST sürümünü öğrenip çıktının
 * başına bir __InternalSupabase bloğu koyuyor. --local çalışırken bunu
 * bilemiyor (CI'da PostgREST konteyneri hiç başlatılmıyor) ve blok çıkmıyor.
 * Tek farkın bu olması dosyanın geri kalanının birebir aynı olduğunu gösteriyor
 * — ama bu tek fark bile "git diff --exit-code" kontrolünü sürekli kırmızıya
 * düşürürdü.
 *
 * Bloğu atıyoruz: createClient'a verilen tip için gerekli değil (bugüne kadar
 * da dosyada yoktu) ve sürüm bilgisi zaten şemanın değil ortamın özelliği,
 * yani versiyon kontrolünde durmasının bir anlamı yok.
 */
const normalized = generated
  .replace(/\r\n/g, "\n")
  .replace(/^(?: *\/\/.*\n)* *__InternalSupabase: \{\n(?:.*\n)*? *\}\n/m, "")
  .replace(/\s*$/, "\n");

writeFileSync(TARGET, header + normalized, "utf8");

console.log(`${TARGET} yenilendi (kaynak: ${source})`);
