import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createSupabaseMock, type SupabaseMock } from "./helpers/supabaseMock";
import { createTestQueryClient } from "./helpers/render";

/**
 * usePrefetchStatsScreen — istatistikler ekranının AÇILMA SÜRESİ.
 *
 * Grafik ve hafta şeridi kendi yükleme dönenceleriyle geliyordu, çünkü ikisi de
 * ekran açıldıktan SONRA başlıyordu. Üstelik grafik zincirin ikinci halkası:
 * ölçüm tipleri gelmeden hangi tipin serisi çekileceği bilinmiyor.
 *
 * Bu hook sekmeler monte olurken ikisini de hazırlıyor. Sessizce bozulabilir
 * bir davranış: bozulduğunda hiçbir şey hata vermez, ekran sadece yeniden
 * yavaşlar — testler onu sessiz olmaktan çıkarıyor.
 */

let sb: SupabaseMock;
let mockSbClient: unknown;

jest.mock("../supabase", () => ({
  get supabase() {
    return mockSbClient;
  },
}));

import { usePrefetchStatsScreen } from "../stats";
import { queryKeys } from "../queryKeys";

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Hafta sorgusu entries'i, seri sorgusu measurement_values'ı okuyor. */
function queueBoth() {
  sb.queue("entries", { data: [{ id: "e1", date: "2026-08-10", type: "log" }] });
  sb.queue("measurement_values", {
    data: [{ value: 80, entries: { date: "2026-08-10" } }],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  sb = createSupabaseMock();
  mockSbClient = sb.client;
});

describe("istatistikler ön yüklemesi", () => {
  it("hafta şeridini ve grafik serisini önden doldurur", async () => {
    const client = createTestQueryClient();
    queueBoth();

    await renderHook(() => usePrefetchStatsScreen("u1", "t1"), { wrapper: wrapperFor(client) });

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.currentWeek.byWeek("u1", 0))).toBeDefined();
      expect(client.getQueryData(queryKeys.measurementSeries.byType("u1", "t1"))).toBeDefined();
    });

    // Hafta her zaman yedi gün — sorgu hiç kayıt döndürmese de şerit çizilebilsin.
    expect(client.getQueryData(queryKeys.currentWeek.byWeek("u1", 0))).toHaveLength(7);
    expect(client.getQueryData(queryKeys.measurementSeries.byType("u1", "t1"))).toEqual([
      { date: "2026-08-10", value: 80 },
    ]);
  });

  it("ölçüm tipi henüz bilinmiyorken yalnızca hafta şeridini çeker", async () => {
    const client = createTestQueryClient();
    queueBoth();

    // types henüz gelmemiş: hangi tipin serisinin çekileceği belli değil. Hafta
    // şeridi ona bağlı olmadığı için beklemeye gerek yok, o çekilebilir.
    await renderHook(() => usePrefetchStatsScreen("u1", undefined), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() =>
      expect(client.getQueryData(queryKeys.currentWeek.byWeek("u1", 0))).toBeDefined()
    );
    expect(sb.chainsFor("measurement_values")).toHaveLength(0);
  });

  it("oturum açılmamışken hiçbir şey çekmez", async () => {
    const client = createTestQueryClient();
    queueBoth();

    await renderHook(() => usePrefetchStatsScreen(undefined, undefined), {
      wrapper: wrapperFor(client),
    });

    expect(sb.chainsFor("entries")).toHaveLength(0);
    expect(sb.chainsFor("measurement_values")).toHaveLength(0);
  });
});
