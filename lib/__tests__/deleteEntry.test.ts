import { createSupabaseMock, argOf, stepNames, type SupabaseMock } from "./helpers/supabaseMock";

/**
 * useDeleteEntry'nin içindeki silme yolu.
 *
 * Buradaki SIRA kritik: cover_photo_id, photos'a bir foreign key ile bağlı.
 * Önce o referans temizlenmezse silme FK kısıtına takılabiliyor. Ayrıca
 * storage'daki dosyalar DB cascade'ine dahil DEĞİL — elle silinmezlerse
 * kullanıcının kotasında yetim dosya olarak kalıyorlar.
 */

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

import { useDeleteEntry } from "../entries";

/**
 * Hook'un içindeki mutationFn'i React olmadan çalıştırır: useMutation'ı
 * yakalayıp verilen seçenekleri geri veriyoruz. Böylece silme mantığını
 * render etmeden test edebiliyoruz.
 */
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: (options: { mutationFn: (id: string) => Promise<unknown> }) => options,
  useQuery: jest.fn(),
  useInfiniteQuery: jest.fn(),
}));

function runDelete(entryId: string) {
  const mutation = useDeleteEntry() as unknown as {
    mutationFn: (id: string) => Promise<unknown>;
  };
  return mutation.mutationFn(entryId);
}

beforeEach(() => {
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

describe("deleteEntry", () => {
  it("önce kapak referansını temizler, SONRA dosyaları ve kaydı siler", async () => {
    sb.queue("photos", {
      data: [{ storage_path: "u1/e1/foto.jpg", thumb_path: "u1/e1/thumb-foto.jpg" }],
    });

    await runDelete("e1");

    // 1) entries.update ile cover_photo_id null'lanmalı (FK'yi serbest bırak)
    const [coverClear, entryDelete] = sb.chainsFor("entries");
    expect(argOf(coverClear, "update")).toEqual({ cover_photo_id: null });
    expect(argOf(coverClear, "eq", 1)).toBe("e1");

    // 2) storage'daki tam boy VE küçük kopya silinmeli
    expect(sb.storageRemovals).toEqual([
      { bucket: "photos", paths: ["u1/e1/foto.jpg", "u1/e1/thumb-foto.jpg"] },
    ]);

    // 3) en sonda kaydın kendisi
    expect(stepNames(entryDelete)).toContain("delete");
    expect(argOf(entryDelete, "eq", 1)).toBe("e1");

    // Sıra: kapak temizliği, kaydın silinmesinden ÖNCE gelmeli.
    expect(sb.chains.indexOf(coverClear)).toBeLessThan(sb.chains.indexOf(entryDelete));
  });

  it("thumbnail'i olmayan eski kayıtta yalnızca tam boyu siler", async () => {
    sb.queue("photos", { data: [{ storage_path: "u1/e1/foto.jpg", thumb_path: null }] });

    await runDelete("e1");

    expect(sb.storageRemovals[0].paths).toEqual(["u1/e1/foto.jpg"]);
  });

  it("birden fazla fotoğrafın tüm dosyalarını tek çağrıda siler", async () => {
    sb.queue("photos", {
      data: [
        { storage_path: "u1/e1/a.jpg", thumb_path: "u1/e1/thumb-a.jpg" },
        { storage_path: "u1/e1/b.jpg", thumb_path: null },
      ],
    });

    await runDelete("e1");

    expect(sb.storageRemovals).toHaveLength(1);
    expect(sb.storageRemovals[0].paths).toEqual([
      "u1/e1/a.jpg",
      "u1/e1/thumb-a.jpg",
      "u1/e1/b.jpg",
    ]);
  });

  it("fotoğrafsız kayıtta storage'a hiç dokunmaz ama kaydı yine siler", async () => {
    sb.queue("photos", { data: [] });

    await runDelete("e1");

    expect(sb.storageRemovals).toHaveLength(0);
    // Kapak temizliği de gereksiz — yalnızca kaydın silinmesi kalmalı.
    const entryChains = sb.chainsFor("entries");
    expect(entryChains).toHaveLength(1);
    expect(stepNames(entryChains[0])).toContain("delete");
  });

  it("fotoğraf sorgusu patlarsa hiçbir şey silmez", async () => {
    sb.queue("photos", { error: { message: "select failed" } });

    await expect(runDelete("e1")).rejects.toEqual({ message: "select failed" });
    expect(sb.storageRemovals).toHaveLength(0);
    expect(sb.chainsFor("entries")).toHaveLength(0);
  });
});
