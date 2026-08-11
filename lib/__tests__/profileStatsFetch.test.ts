import { createSupabaseMock, type SupabaseMock } from "./helpers/supabaseMock";

/**
 * fetchProfileStats — profil ekranının AÇILMA SÜRESİ.
 *
 * Ekran bu tek fonksiyonu bekliyor ve fonksiyon eskiden ÜÇ sorguyu ARDIŞIK
 * yapıyordu: kayıtlar → "kilo" ölçüm tipinin id'si → o tipin değerleri. İkincisi
 * birincinin verisine hiç ihtiyaç duymuyordu (yalnızca bir `if` bloğunun
 * arkasındaydı), üçüncüsünün ikinciye bağımlılığı ise gömülü ilişki filtresiyle
 * tamamen ortadan kalkıyordu.
 *
 * Aşağıdaki testler bu yapıyı kilitliyor. Özellikle "ölçüm tipi için ayrı sorgu
 * atılmıyor" testi önemli: o sorgu geri gelirse hiçbir şey bozulmaz, ekran
 * yalnızca yeniden yavaşlar — yani hata sessizdir.
 */

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

import { fetchProfileStats } from "../profileStats";

/** Bugüne göreli tarih — test ne zaman koşarsa koşsun kararlı olsun. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

describe("fetchProfileStats", () => {
  it("olcum tipi icin AYRI bir sorgu atmiyor", async () => {
    sb.queue("entries", { data: [{ date: daysAgo(2), type: "log" }] });
    sb.queue("measurement_values", { data: [] });

    await fetchProfileStats("u1");

    // Tip artık gömülü ilişki üzerinden süzülüyor; ayrı bir lookup sorgusu
    // olsaydı bekleme yeniden bir tur uzardı.
    expect(sb.chainsFor("measurement_types")).toHaveLength(0);
    expect(sb.chainsFor("entries")).toHaveLength(1);
    expect(sb.chainsFor("measurement_values")).toHaveLength(1);
  });

  it("kilo degisimini ilk ve son degerden hesapliyor", async () => {
    sb.queue("entries", {
      data: [
        { date: daysAgo(30), type: "log" },
        { date: daysAgo(1), type: "log" },
      ],
    });
    // Sıra BİLEREK karışık: PostgREST gömülü kolona göre sıralamayı garanti
    // etmiyor, sıralama JS'te yapılıyor. Karışık gelen veri doğru sonucu
    // vermezse o koruma kaybolmuş demektir.
    sb.queue("measurement_values", {
      data: [
        { value: 78, entries: { date: daysAgo(1) } },
        { value: 82, entries: { date: daysAgo(30) } },
      ],
    });

    const stats = await fetchProfileStats("u1");

    expect(stats.weightDiff).toBe(-4);
    expect(stats.totalMemories).toBe(2);
  });

  it("tek kilo degeri varken degisim hesaplamiyor", async () => {
    sb.queue("entries", { data: [{ date: daysAgo(1), type: "log" }] });
    sb.queue("measurement_values", { data: [{ value: 80, entries: { date: daysAgo(1) } }] });

    const stats = await fetchProfileStats("u1");

    // İki nokta olmadan "değişim" diye bir şey yok; 0 yazmak yanlış olurdu.
    expect(stats.weightDiff).toBeNull();
  });

  it("kilo sorgusu patlasa da profil yuklenmeye devam ediyor", async () => {
    sb.queue("entries", { data: [{ date: daysAgo(1), type: "log" }] });
    sb.queue("measurement_values", { error: new Error("kilo okunamadi") });

    const stats = await fetchProfileStats("u1");

    // Kilo değişimi ekrandaki TEK bir satır; onun için tüm profili hataya
    // düşürmek orantısız olurdu.
    expect(stats.weightDiff).toBeNull();
    expect(stats.totalMemories).toBe(1);
  });

  it("kayit sorgusu patlarsa hata firlatiyor", async () => {
    sb.queue("entries", { error: new Error("baglanti yok") });
    sb.queue("measurement_values", { data: [] });

    // Bu sorgu ekranın TAMAMINI besliyor; sessizce boş dönmek "hiç anın yok"
    // demek olurdu.
    await expect(fetchProfileStats("u1")).rejects.toThrow("baglanti yok");
  });

  it("fotografsiz gunler toplam ani sayisina girmiyor", async () => {
    sb.queue("entries", {
      data: [
        { date: daysAgo(3), type: "log" },
        { date: daysAgo(2), type: "off_day" },
        { date: daysAgo(1), type: "workout" },
      ],
    });
    sb.queue("measurement_values", { data: [] });

    const stats = await fetchProfileStats("u1");

    // Seri ÜÇ gün (off day ve antrenman seriyi sürdürüyor) ama "Toplam Anı"
    // yalnızca fotoğraflı günleri sayıyor.
    expect(stats.totalMemories).toBe(1);
    expect(stats.current).toBe(3);
  });
});
