import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Bileşen testleri için ortak render yardımcısı.
 *
 * NOT: Bu dosya bir test paketi DEĞİL — `testPathIgnorePatterns` ile
 * `__tests__/helpers/` hariç tutuluyor.
 *
 * Uygulamadaki hemen her ekran React Query'ye bağlı olduğu için sarmalayıcı
 * varsayılan olarak bir QueryClientProvider sağlıyor. Test istemcisinde
 * retry KAPALI: gerçek istemci hatalı sorguyu 3 kez tekrar deniyor ve bu,
 * hata durumunu test ederken testi gereksiz yere yavaşlatıp zaman aşımına
 * sokuyor.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { client = createTestQueryClient() }: { client?: QueryClient } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, ...render(ui, { wrapper: Wrapper }) };
}
