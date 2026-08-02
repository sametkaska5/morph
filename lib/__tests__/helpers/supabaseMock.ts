/**
 * Supabase istemcisinin test taklidi (mock).
 *
 * NEDEN GEREKLİ: offline yazma yolu (saveEntry, saveWorkoutDay, saveProgram,
 * deleteEntry) uygulamanın en riskli kodu — veri kaybı en kötü senaryo — ama
 * saf fonksiyon olmadığı için hiç test edilemiyordu. Bu taklit, o fonksiyonların
 * GÖZLEMLENEBİLİR SÖZLEŞMESİNİ test etmeyi sağlıyor: hangi tabloya, hangi
 * sırayla, hangi yükle yazıldı.
 *
 * NOT: Bu dosya bir test paketi DEĞİL — jest yapılandırmasında
 * `testPathIgnorePatterns` ile `__tests__/helpers/` hariç tutuluyor.
 *
 * Kullanım:
 *   const sb = createSupabaseMock();
 *   sb.queue("entries", { data: { id: "e1" } });   // sıradaki entries sorgusu bunu döner
 *   ...
 *   expect(sb.chainsFor("photos")[0]).toMatchChain(...)
 */

export type Result = { data?: unknown; error?: unknown };
export type ChainStep = { method: string; args: unknown[] };
export type QueryChain = { table: string; steps: ChainStep[] };

/** Zincirdeki bir metodun ilk argümanını verir (yoksa undefined). */
export function argOf(chain: QueryChain, method: string, index = 0): unknown {
  return chain.steps.find((s) => s.method === method)?.args[index];
}

/** Zincirde bu metot çağrıldı mı? */
export function hasStep(chain: QueryChain, method: string): boolean {
  return chain.steps.some((s) => s.method === method);
}

/** Zinciri "eq:id" gibi okunabilir bir diziye çevirir — sıra iddiaları için. */
export function stepNames(chain: QueryChain): string[] {
  return chain.steps.map((s) => s.method);
}

// Zincirlenebilir (fluent) filtre/yazma metotları — hepsi builder'ı geri döner.
const CHAINABLE = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "gte",
  "lte",
  "not",
  "order",
  "limit",
  "range",
];

export function createSupabaseMock() {
  const chains: QueryChain[] = [];
  const queues = new Map<string, Result[]>();

  /** storage.from(bucket).remove(paths) çağrılarının kaydı. */
  const storageRemovals: { bucket: string; paths: string[] }[] = [];
  /** storage.from(bucket).upload(path, ...) çağrılarının kaydı. */
  const storageUploads: { bucket: string; path: string }[] = [];

  /**
   * Bir tabloya yapılacak SONRAKİ sorgunun döneceği sonucu kuyruğa ekler.
   * Aynı tabloya birden çok sorgu varsa çağrı sırasıyla kuyruğa ekle.
   */
  function queue(table: string, ...results: Result[]) {
    const existing = queues.get(table) ?? [];
    existing.push(...results);
    queues.set(table, existing);
  }

  function nextResult(table: string): Result {
    const q = queues.get(table);
    const next = q && q.length > 0 ? q.shift() : undefined;
    // Kuyruk boşsa "başarılı ama veri yok" — çoğu yazma çağrısı sonucu okumaz.
    return { data: next?.data ?? null, error: next?.error ?? null };
  }

  function from(table: string) {
    const chain: QueryChain = { table, steps: [] };
    chains.push(chain);

    const builder: Record<string, unknown> = {};

    for (const method of CHAINABLE) {
      builder[method] = (...args: unknown[]) => {
        chain.steps.push({ method, args });
        return builder;
      };
    }

    // Sonlandırıcılar: gerçek bir Promise döndürürler.
    builder.single = () => {
      chain.steps.push({ method: "single", args: [] });
      return Promise.resolve(nextResult(table));
    };
    builder.maybeSingle = () => {
      chain.steps.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(nextResult(table));
    };

    // Builder'ın kendisi de "thenable": `await supabase.from(x).delete().in(...)`
    // gibi .single()'sız zincirler doğrudan await edilebiliyor.
    builder.then = (
      onFulfilled?: (value: Result) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(nextResult(table)).then(onFulfilled, onRejected);

    return builder;
  }

  const storage = {
    from(bucket: string) {
      return {
        remove: (paths: string[]) => {
          storageRemovals.push({ bucket, paths });
          return Promise.resolve({ data: null, error: null });
        },
        upload: (path: string) => {
          storageUploads.push({ bucket, path });
          return Promise.resolve({ data: { path }, error: null });
        },
        list: () => Promise.resolve({ data: [], error: null }),
        createSignedUrl: (path: string) =>
          Promise.resolve({ data: { signedUrl: `signed:${path}` }, error: null }),
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({
            data: paths.map((p) => ({ path: p, signedUrl: `signed:${p}` })),
            error: null,
          }),
      };
    },
  };

  return {
    /** Ekranlara/lib'e verilecek sahte istemci. */
    client: { from, storage },
    queue,
    /** Yapılan tüm sorgu zincirleri, çağrı sırasıyla. */
    chains,
    /** Yalnızca belirtilen tabloya yapılan zincirler. */
    chainsFor(table: string) {
      return chains.filter((c) => c.table === table);
    },
    storageRemovals,
    storageUploads,
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
