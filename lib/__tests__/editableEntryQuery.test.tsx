import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createSupabaseMock, type SupabaseMock } from "./helpers/supabaseMock";
import { createTestQueryClient } from "./helpers/render";

/**
 * useEditableEntry — düzenleme ekranının AÇILMA SÜRESİ.
 *
 * Ekranda "Kaydet" ve ölçüm alanları bu sorgunun tamamlanmasını bekliyor
 * (app/entry/edit/[id].tsx içindeki formReady). Sorgu iki ağ turu sürdüğü
 * sürece kullanıcı o kadar bekliyordu: önce kayıt, sonra fotoğrafın imzalı
 * linki — ve imzalama kaydı beklemek zorunda, çünkü hangi dosyayı imzalayacağını
 * kayıttan öğreniyor.
 *
 * İkinci tur çoğu zaman gereksiz: ekran anı akışından açılıyor ve akış aynı
 * fotoğrafın imzalı linkini çoktan almış oluyor. Aşağıdaki testler "yol aynıysa
 * yeniden imzalama" kuralını kilitliyor. Kural sessizce bozulabilir bir kural:
 * bozulduğunda hiçbir şey hata vermez, ekran sadece yavaşlar.
 */

let sb: SupabaseMock;
let mockSbClient: unknown;
const mockGetPhotoUrl = jest.fn();

// jest.mock fabrikaları hoisting nedeniyle yalnızca `mock` önekli değişkenlere
// erişebiliyor; supabase istemcisi her testte yeniden kurulduğu için getter.
jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));
// storage'ın geri kalanı GERÇEK: coverPhotoRow kapak satırını seçen asıl mantık,
// onu taklit etmek testi kendi kopyasını doğrulayan bir şeye çevirirdi.
jest.mock("../storage", () => ({
  ...jest.requireActual("../storage"),
  getPhotoUrl: (...args: unknown[]) => mockGetPhotoUrl(...args),
}));

import { useEditableEntry } from "../entries";
import { queryKeys } from "../queryKeys";

const PHOTO_PATH = "u1/e1/a.jpg";
const THUMB_PATH = "u1/e1/thumb-a.jpg";

const ROW = {
  id: "e1",
  note: "harika bir gündü",
  cover_photo_id: "p1",
  photos: [{ id: "p1", storage_path: PHOTO_PATH, thumb_path: THUMB_PATH, order_index: 0 }],
  measurement_values: [],
};

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Anı akışının cache'i — ekranın hemen her zaman açıldığı yer. */
function seedCapsule(client: QueryClient, over: Record<string, unknown> = {}) {
  client.setQueryData(queryKeys.entries.capsule(), {
    pages: [
      [
        {
          id: "e1",
          note: "harika bir gündü",
          photoUrl: "https://imzali/akistan.jpg",
          photoPath: PHOTO_PATH,
          ...over,
        },
      ],
    ],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  sb = createSupabaseMock();
  mockSbClient = sb.client;
  mockGetPhotoUrl.mockResolvedValue("https://imzali/yeni.jpg");
});

describe("useEditableEntry imzalı link tazeleme", () => {
  it("akışta aynı fotoğrafın linki varsa yeniden imzalamıyor", async () => {
    const client = createTestQueryClient();
    seedCapsule(client);
    sb.queue("entries", { data: ROW });

    const { result } = await renderHook(() => useEditableEntry("e1"), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));

    expect(mockGetPhotoUrl).not.toHaveBeenCalled();
    expect(result.current.data?.photoUrl).toBe("https://imzali/akistan.jpg");
  });

  it("kapak fotoğrafı değişmişse eski link kullanılmıyor", async () => {
    const client = createTestQueryClient();
    // Akıştaki link BAŞKA bir dosyaya ait (kullanıcı fotoğrafı değiştirmiş,
    // akış henüz tazelenmemiş). Yolu tutmayan bir linki kullanmak yanlış
    // fotoğrafı göstermek olurdu — bu durumda imzalamak zorundayız.
    seedCapsule(client, { photoPath: "u1/e1/eski.jpg" });
    sb.queue("entries", { data: ROW });

    const { result } = await renderHook(() => useEditableEntry("e1"), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.data?.photoUrl).toBe("https://imzali/yeni.jpg"));
    expect(mockGetPhotoUrl).toHaveBeenCalled();
  });

  it("hiç tohum yoksa tam boy ve küçük kopyayı imzalıyor", async () => {
    const client = createTestQueryClient();
    // Derin bağlantı / soğuk açılış: kardeş cache boş. Eski davranış aynen
    // sürüyor — küçük kopya da imzalanıyor, çünkü tam boy diskte olmayabilir ve
    // boş kare yerine düşük çözünürlüklü hâli göstermek gerekiyor.
    sb.queue("entries", { data: ROW });

    const { result } = await renderHook(() => useEditableEntry("e1"), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.data?.photoUrl).toBeTruthy());

    expect(mockGetPhotoUrl).toHaveBeenCalledTimes(2);
    expect(mockGetPhotoUrl).toHaveBeenCalledWith(PHOTO_PATH, "full");
    expect(mockGetPhotoUrl).toHaveBeenCalledWith(THUMB_PATH);
  });
});
