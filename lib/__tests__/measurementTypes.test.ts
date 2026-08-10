import { createSupabaseMock, argOf, type SupabaseMock } from "./helpers/supabaseMock";

/**
 * useAddMeasurementType'ın YAZMA yolu.
 *
 * Sıra numarası kullanıcının gördüğü şeyi belirliyor: ölçüm listesi ve
 * istatistiklerdeki sekmeler `order("sort_order")` ile diziliyor. Eskiden her
 * özel tipe sabit 100 yazılıyordu — ikinci özel ölçümden sonra hepsi eşit
 * oluyor ve eşitler sıralanmadığı için liste her yeniden çekmede farklı
 * dizilebiliyordu.
 */

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

// mutationFn'i React olmadan çalıştırmak için useMutation'ı seçenekleriyle
// geri veriyoruz (deleteEntry.test.ts ile aynı kalıp).
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: (options: unknown) => options,
}));

import { useAddMeasurementType } from "../measurementTypes";

type AddInput = { name: string; unit: string; target_direction: "increase_is_good" };

function runAdd(userId: string | undefined, input: AddInput) {
  // Yukarıdaki jest.mock sayesinde bu bir React hook'u değil, seçeneklerini
  // döndüren düz bir fonksiyon — kural bilerek susturuluyor. (Direktif TEK
  // satırda olmak zorunda; bölünürse bir sonraki YORUM satırına uygulanıyor.)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const mutation = useAddMeasurementType(userId) as unknown as {
    mutationFn: (input: AddInput) => Promise<unknown>;
  };
  return mutation.mutationFn(input);
}

const INPUT: AddInput = { name: "kol çevresi", unit: "cm", target_direction: "increase_is_good" };

beforeEach(() => {
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

describe("useAddMeasurementType", () => {
  /** insert zinciri — mevcut sıra sorgusundan sonraki ikinci çağrı. */
  const insertChain = () => sb.chainsFor("measurement_types")[1];

  it("ilk özel ölçüm 100'den başlar (sistem varsayılanlarının ARDINDA)", async () => {
    // Varsayılanlar 1-4 aralığında (0001/0007 migration) — özel tipler onların
    // arasına karışmamalı.
    sb.queue("measurement_types", { data: [] });

    await runAdd("u1", INPUT);

    expect(argOf(insertChain(), "insert")).toMatchObject({
      user_id: "u1",
      name: "kol çevresi",
      is_default: false,
      sort_order: 100,
    });
  });

  it("sonraki özel ölçümler ARTAN sıra alır — eşitlik olmaz", async () => {
    sb.queue("measurement_types", { data: [{ sort_order: 100 }, { sort_order: 101 }] });

    await runAdd("u1", INPUT);

    expect(argOf(insertChain(), "insert")).toMatchObject({ sort_order: 102 });
  });

  it("mevcut sıra sorgusu yalnızca KULLANICININ tiplerine bakar", async () => {
    // Sistem varsayılanları da sayılsaydı taban onlara göre kayardı.
    sb.queue("measurement_types", { data: [] });

    await runAdd("u1", INPUT);

    expect(argOf(sb.chainsFor("measurement_types")[0], "eq", 1)).toBe("u1");
  });

  it("mevcut tipler okunamazsa EKLEMEZ (yanlış sırayla yazmaktan iyi)", async () => {
    sb.queue("measurement_types", { error: { message: "network" } });

    await expect(runAdd("u1", INPUT)).rejects.toEqual({ message: "network" });
    expect(sb.chainsFor("measurement_types")).toHaveLength(1);
  });

  it("oturum yoksa hiç yazmaya kalkışmaz", async () => {
    await expect(runAdd(undefined, INPUT)).rejects.toThrow("Giriş yapılmamış");
    expect(sb.chainsFor("measurement_types")).toHaveLength(0);
  });
});
