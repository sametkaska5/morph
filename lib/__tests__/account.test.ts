import { createSupabaseMock, type SupabaseMock } from "./helpers/supabaseMock";

/**
 * Hesap silme — uygulamanın GERİ ALINAMAZ tek işlemi.
 *
 * Kullanıcının tüm verisi (kayıtlar, ölçümler, program, bildirim tercihleri) ve
 * depodaki bütün fotoğrafları kalıcı olarak gidiyor. Yanlış giderse geri dönüş
 * yok, o yüzden sözleşmesi burada sabitleniyor.
 *
 * Korunan üç şey:
 *
 *  1. SIRA — fotoğraflar hesaptan ÖNCE silinmeli. Ters olsaydı auth.users
 *     satırı gidince RLS depoya erişimi keserdi ve dosyalar hem erişilemez hem
 *     silinemez biçimde öksüz kalırdı; kullanıcı "hesabımı sildim" derken
 *     fotoğrafları sunucuda kalırdı.
 *  2. FOTOĞRAF SİLİNEMEZSE HESAP DA SİLİNMEZ. Aksi hâlde aynı öksüz dosya
 *     durumu, üstelik hesap gittiği için bir daha temizlenemez.
 *  3. HESAP SİLİNEMEZSE OTURUM KAPANMAZ. Kapansaydı kullanıcı dışarı atılır,
 *     hesabının silinip silinmediğini anlayamazdı.
 */

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

import { deleteAccount } from "../account";
import { deleteAllUserPhotos } from "../storage";

beforeEach(() => {
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

describe("deleteAccount — sıra", () => {
  it("fotoğrafları hesaptan ÖNCE, oturumu EN SON kapatır", async () => {
    sb.queueStorageList({ data: [{ name: "e1" }] }, { data: [{ name: "a.jpg" }] });

    await deleteAccount("u1");

    // Depodan silme -> hesap silme RPC'si -> oturum kapatma.
    expect(sb.callOrder).toEqual([
      "storage.list",
      "storage.list",
      "storage.remove",
      "rpc:delete_own_account",
      "auth.signOut",
    ]);
  });

  it("hesabı silmek için delete_own_account RPC'sini çağırır", async () => {
    await deleteAccount("u1");

    expect(sb.rpcCalls).toEqual([{ fn: "delete_own_account", args: undefined }]);
  });

  it("fotoğrafı olmayan hesapta depoya silme isteği göndermez", async () => {
    await deleteAccount("u1");

    expect(sb.storageRemovals).toHaveLength(0);
    expect(sb.rpcCalls).toHaveLength(1);
    expect(sb.signOutCount).toBe(1);
  });
});

describe("deleteAccount — hata yolları", () => {
  it("fotoğraflar silinemezse hesabı SİLMEZ", async () => {
    // Silseydi dosyalar erişilemez biçimde öksüz kalırdı — hesap gittiği için
    // bir daha temizlenmeleri de mümkün olmazdı.
    sb.queueStorageList({ error: { message: "storage down" } });

    await expect(deleteAccount("u1")).rejects.toEqual({ message: "storage down" });

    expect(sb.rpcCalls).toHaveLength(0);
    expect(sb.signOutCount).toBe(0);
  });

  it("hesap silinemezse OTURUMU KAPATMAZ", async () => {
    // Kapatsaydı kullanıcı dışarı atılır ve hesabının silinip silinmediğini
    // anlayamazdı.
    sb.queueRpc({ error: { message: "rpc failed" } });

    await expect(deleteAccount("u1")).rejects.toEqual({ message: "rpc failed" });

    expect(sb.signOutCount).toBe(0);
  });
});

/**
 * Depo temizliği: fotoğraflar DB cascade'ine dahil değil, elle siliniyor.
 * Yol yapısı {user_id}/{entry_id}/{dosya} — iki kademeli listeleme gerekiyor.
 */
describe("deleteAllUserPhotos", () => {
  it("her klasördeki dosyaların TAM yolunu toplayıp tek seferde siler", async () => {
    sb.queueStorageList(
      { data: [{ name: "e1" }, { name: "e2" }] }, // kullanıcının klasörleri
      { data: [{ name: "a.jpg" }, { name: "thumb-a.jpg" }] }, // e1 içindekiler
      { data: [{ name: "b.jpg" }] } // e2 içindekiler
    );

    await deleteAllUserPhotos("u1");

    expect(sb.storageRemovals).toEqual([
      {
        bucket: "photos",
        paths: ["u1/e1/a.jpg", "u1/e1/thumb-a.jpg", "u1/e2/b.jpg"],
      },
    ]);
  });

  it("önce kullanıcı klasörünü, sonra her alt klasörü listeler", async () => {
    sb.queueStorageList({ data: [{ name: "e1" }] }, { data: [] });

    await deleteAllUserPhotos("u1");

    expect(sb.storageLists.map((l) => l.prefix)).toEqual(["u1", "u1/e1"]);
  });

  it("hiç dosya yoksa silme isteği göndermez", async () => {
    // Boş listeyle remove çağırmak gereksiz bir istek; bazı sağlayıcılarda hata.
    sb.queueStorageList({ data: [{ name: "e1" }] }, { data: [] });

    await deleteAllUserPhotos("u1");

    expect(sb.storageRemovals).toHaveLength(0);
  });

  it("klasör listelenemezse hata fırlatır (sessizce geçmez)", async () => {
    // Sessizce geçseydi çağıran taraf temizliğin başarılı olduğunu sanır ve
    // hesabı silerdi.
    sb.queueStorageList({ error: { message: "list failed" } });

    await expect(deleteAllUserPhotos("u1")).rejects.toEqual({ message: "list failed" });
  });

  it("alt klasör listelenemezse de hata fırlatır", async () => {
    sb.queueStorageList({ data: [{ name: "e1" }] }, { error: { message: "inner list failed" } });

    await expect(deleteAllUserPhotos("u1")).rejects.toEqual({ message: "inner list failed" });
  });

  /**
   * storage.list() VARSAYILAN olarak yalnızca 100 kayıt döndürüyor ve fazlasını
   * sessizce atıyor. Sayfalama olmadan 100'den fazla günü olan bir kullanıcının
   * fotoğrafları hesap silindikten SONRA da depoda kalıyordu — kullanıcı "tüm
   * verin silindi" diyen bir onay görüyor, gerçekte silinmiyordu.
   */
  describe("sayfalama", () => {
    it("100'den fazla klasörü de kapsar — hiçbirini atlamaz", async () => {
      const folders = Array.from({ length: 250 }, (_, i) => ({ name: `e${i}` }));
      sb.queueStorageList({ data: folders });
      // Her klasörün içi tek dosya.
      folders.forEach((f) => sb.queueStorageList({ data: [{ name: `${f.name}.jpg` }] }));

      await deleteAllUserPhotos("u1");

      const removed = sb.storageRemovals.flatMap((r) => r.paths);
      expect(removed).toHaveLength(250);
      expect(removed).toContain("u1/e0/e0.jpg");
      expect(removed).toContain("u1/e249/e249.jpg");
    });

    it("tek klasördeki 1000'den fazla dosya için sayfa sayfa okur", async () => {
      const files = Array.from({ length: 1200 }, (_, i) => ({ name: `${i}.jpg` }));
      sb.queueStorageList({ data: [{ name: "e1" }] }, { data: files });

      await deleteAllUserPhotos("u1");

      const removed = sb.storageRemovals.flatMap((r) => r.paths);
      expect(removed).toHaveLength(1200);
      expect(removed).toContain("u1/e1/1199.jpg");

      // İkinci sayfa gerçekten offset ile istenmiş olmalı.
      const innerLists = sb.storageLists.filter((l) => l.prefix === "u1/e1");
      expect(innerLists).toHaveLength(2);
      expect(innerLists[1].options?.offset).toBe(1000);
    });

    it("silmeyi parçalara böler — tek dev istek atmaz", async () => {
      const files = Array.from({ length: 1200 }, (_, i) => ({ name: `${i}.jpg` }));
      sb.queueStorageList({ data: [{ name: "e1" }] }, { data: files });

      await deleteAllUserPhotos("u1");

      expect(sb.storageRemovals.length).toBeGreaterThan(1);
      expect(Math.max(...sb.storageRemovals.map((r) => r.paths.length))).toBeLessThanOrEqual(500);
    });
  });
});
