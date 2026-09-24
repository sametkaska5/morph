import { createSupabaseMock, argOf, type SupabaseMock } from "./helpers/supabaseMock";

/**
 * saveWorkoutDay + saveProgram — fotoğrafsız günün ve antrenman programının
 * YAZMA yolu. İkisi de aynı entry'ye bağlanıyor ve birbirinin verisini
 * bozmamak zorunda; buradaki testler o sınırı koruyor.
 */

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

import { saveWorkoutDay, saveProgram } from "../workout";

beforeEach(() => {
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

/** Gün UPSERT zinciri — mevcut tip sorgusundan sonraki ikinci entries çağrısı. */
const workoutUpsert = () => sb.chainsFor("entries")[1];

describe("saveWorkoutDay", () => {
  it("günü verilen tiple upsert eder ve dolu ölçümleri yazar", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });

    await saveWorkoutDay({
      userId: "u1",
      date: "2026-08-01",
      type: "workout",
      note: "ağır gün",
      values: { kilo: "80,5" },
    });

    expect(argOf(workoutUpsert(), "upsert")).toEqual({
      user_id: "u1",
      date: "2026-08-01",
      type: "workout",
      note: "ağır gün",
    });
    expect(argOf(sb.chainsFor("measurement_values")[0], "upsert")).toEqual([
      { entry_id: "e1", measurement_type_id: "kilo", value: 80.5 },
    ]);
  });

  it("off_day tipini olduğu gibi yazar", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });

    await saveWorkoutDay({
      userId: "u1",
      date: "2026-08-01",
      type: "off_day",
      note: null,
      values: {},
    });

    expect(argOf(workoutUpsert(), "upsert")).toMatchObject({ type: "off_day" });
  });

  it("BOŞALTILAN ölçümü siler — düzenlemede değeri kaldırmak gerçekten kaldırmalı", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });

    // kilo dolu, bel BOŞALTILMIŞ. Eskiden yalnızca dolu satırlar upsert
    // ediliyordu; boşaltılan değer DB'de kalıp ekran yenilenince geri geliyordu.
    await saveWorkoutDay({
      userId: "u1",
      date: "2026-08-01",
      type: "workout",
      note: null,
      values: { kilo: "80", bel: "" },
    });

    const chains = sb.chainsFor("measurement_values");
    expect(argOf(chains[0], "upsert")).toEqual([
      { entry_id: "e1", measurement_type_id: "kilo", value: 80 },
    ]);

    const deleteChain = chains[1];
    expect(argOf(deleteChain, "eq", 1)).toBe("e1");
    expect(argOf(deleteChain, "in", 1)).toEqual(["bel"]);
  });

  it("geçersiz girdiyi ne yazar ne siler (boş değil, sayı da değil)", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });

    await saveWorkoutDay({
      userId: "u1",
      date: "2026-08-01",
      type: "workout",
      note: null,
      values: { bel: "abc" },
    });

    // "abc" boş olmadığı için silinmez, sayı olmadığı için de yazılmaz.
    expect(sb.chainsFor("measurement_values")).toHaveLength(0);
  });

  /**
   * Bu ekran fotoğrafsız günler için. `type`'ı koşulsuz yazmak FOTOĞRAFLI bir
   * günü 'workout'/'off_day' yapıp anı akışından düşürüyordu: fotoğraf duruyor
   * ama hiçbir listede görünmüyor, yani kullanıcı için kaybolmuş oluyor.
   * Ekrandaki `isPhotoDay` koruması yalnızca arayüzde — gün sorgusu dönmemişken
   * form çizilip Kaydet'e basılabiliyordu. Kural veri katmanında da olmak zorunda.
   */
  it("FOTOĞRAFLI (log) bir günün tipini DEĞİŞTİRMEZ", async () => {
    sb.queue("entries", { data: { type: "log" } }); // o gün fotoğraflı
    sb.queue("entries", { data: { id: "e1" } });

    await saveWorkoutDay({
      userId: "u1",
      date: "2026-08-01",
      type: "workout",
      note: "not",
      values: {},
    });

    expect(argOf(workoutUpsert(), "upsert")).toMatchObject({ type: "log" });
  });

  it("workout ↔ off_day geçişini engellemez", async () => {
    // Korunan YALNIZCA 'log'. Fotoğrafsız bir günün tipini değiştirmek bu
    // ekranın asıl işi.
    sb.queue("entries", { data: { type: "workout" } });
    sb.queue("entries", { data: { id: "e1" } });

    await saveWorkoutDay({
      userId: "u1",
      date: "2026-08-01",
      type: "off_day",
      note: null,
      values: {},
    });

    expect(argOf(workoutUpsert(), "upsert")).toMatchObject({ type: "off_day" });
  });

  it("gün upsert'ü patlarsa ölçümlere hiç geçmez", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu
    sb.queue("entries", { error: { message: "boom" } });

    await expect(
      saveWorkoutDay({
        userId: "u1",
        date: "2026-08-01",
        type: "workout",
        note: null,
        values: { kilo: "80" },
      }),
    ).rejects.toEqual({ message: "boom" });

    expect(sb.chainsFor("measurement_values")).toHaveLength(0);
  });
});

describe("saveProgram", () => {
  it("var olan güne yazarken entry'nin TİPİNİ DEĞİŞTİRMEZ", async () => {
    // Fotoğraflı (type='log') bir güne program ekleniyor. Tip 'workout'a
    // çevrilseydi o gün anı akışından düşerdi — kullanıcı fotoğrafını kaybetmiş
    // gibi hissederdi.
    sb.queue("entries", { data: { id: "e1" } }); // mevcut gün sorgusu
    sb.queue("workout_items", {}); // eski hareketlerin silinmesi
    sb.queue("workout_items", { data: { id: "i1" } }); // yeni hareket insert

    const entryId = await saveProgram({
      userId: "u1",
      date: "2026-08-01",
      items: [{ name: "Bench", sets: [{ reps: "8", weight: "60" }] }],
    });

    expect(entryId).toBe("e1");
    // entries tablosuna YALNIZCA okuma yapılmış olmalı: insert/update yok.
    const entryChains = sb.chainsFor("entries");
    expect(entryChains).toHaveLength(1);
    expect(argOf(entryChains[0], "select")).toBe("id");
  });

  it("gün yoksa 'workout' tipinde yeni entry açar", async () => {
    sb.queue("entries", { data: null }); // gün yok
    sb.queue("entries", { data: { id: "e-new" } }); // insert
    sb.queue("workout_items", {});
    sb.queue("workout_items", { data: { id: "i1" } });

    const entryId = await saveProgram({
      userId: "u1",
      date: "2026-08-01",
      items: [{ name: "Squat", sets: [{ reps: "5", weight: "100" }] }],
    });

    expect(entryId).toBe("e-new");
    expect(argOf(sb.chainsFor("entries")[1], "insert")).toEqual({
      user_id: "u1",
      date: "2026-08-01",
      type: "workout",
    });
  });

  it("boş program + gün yoksa BOŞUNA entry yaratmaz", async () => {
    sb.queue("entries", { data: null });

    const entryId = await saveProgram({ userId: "u1", date: "2026-08-01", items: [] });

    expect(entryId).toBeNull();
    // Yalnızca "var mı?" sorgusu yapılmalı, insert olmamalı.
    expect(sb.chainsFor("entries")).toHaveLength(1);
    expect(sb.chainsFor("workout_items")).toHaveLength(0);
  });

  it("yazmadan önce eski hareketleri siler (sil-ve-yeniden-yaz)", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });
    sb.queue("workout_items", {});
    sb.queue("workout_items", { data: { id: "i1" } });

    await saveProgram({
      userId: "u1",
      date: "2026-08-01",
      items: [{ name: "Bench", sets: [{ reps: "8", weight: "60" }] }],
    });

    const deleteChain = sb.chainsFor("workout_items")[0];
    expect(argOf(deleteChain, "eq", 1)).toBe("e1");
    expect(argOf(deleteChain, "delete")).toBeUndefined();
  });

  it("adı boş hareketleri atar ve sırayı order_index ile korur", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });
    sb.queue("workout_items", {}); // delete
    sb.queue("workout_items", { data: { id: "i1" } });
    sb.queue("workout_items", { data: { id: "i2" } });

    await saveProgram({
      userId: "u1",
      date: "2026-08-01",
      items: [
        { name: "Bench", sets: [{ reps: "8", weight: "60" }] },
        { name: "   ", sets: [{ reps: "10", weight: "20" }] }, // adsız → atılmalı
        { name: "Row", sets: [{ reps: "10", weight: "40" }] },
      ],
    });

    const inserts = sb
      .chainsFor("workout_items")
      .slice(1)
      .map((c) => argOf(c, "insert"));
    // order_index, adsız öğe ELENMEDEN ÖNCEKİ indeksten geliyor; bu yüzden
    // Row 1 değil 2 alıyor. Boşluk bilinçli olarak sorun değil: okurken tek
    // kullanımı `sort((a,b) => a.order_index - b.order_index)` ve sıralama
    // için ardışıklık değil yalnızca büyüklük ilişkisi gerekiyor.
    expect(inserts).toEqual([
      { entry_id: "e1", name: "Bench", order_index: 0 },
      { entry_id: "e1", name: "Row", order_index: 2 },
    ]);
  });

  it("tamamen boş setleri yazmaz, dolu setleri sırasıyla yazar", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });
    sb.queue("workout_items", {});
    sb.queue("workout_items", { data: { id: "i1" } });

    await saveProgram({
      userId: "u1",
      date: "2026-08-01",
      items: [
        {
          name: "Bench",
          sets: [
            { reps: "8", weight: "60" },
            { reps: "", weight: "" }, // tamamen boş → atılmalı
            { reps: "6", weight: "" }, // yalnız tekrar → yazılmalı
          ],
        },
      ],
    });

    // Boş set (index 1) yazılmıyor; hayatta kalan setler orijinal
    // order_index'lerini koruyor (0 ve 2) — hareket sırasındaki boşlukla aynı
    // mantık, sıralamayı etkilemiyor.
    expect(argOf(sb.chainsFor("workout_sets")[0], "insert")).toEqual([
      { workout_item_id: "i1", reps: 8, weight: 60, order_index: 0 },
      { workout_item_id: "i1", reps: 6, weight: null, order_index: 2 },
    ]);
  });

  it("hiç dolu set yoksa workout_sets'e hiç gitmez (kardiyo/esneme)", async () => {
    sb.queue("entries", { data: null }); // mevcut tip sorgusu (o gün henüz yok)
    sb.queue("entries", { data: { id: "e1" } });
    sb.queue("workout_items", {});
    sb.queue("workout_items", { data: { id: "i1" } });

    await saveProgram({
      userId: "u1",
      date: "2026-08-01",
      items: [{ name: "Koşu", sets: [{ reps: "", weight: "" }] }],
    });

    expect(sb.chainsFor("workout_sets")).toHaveLength(0);
  });
});
