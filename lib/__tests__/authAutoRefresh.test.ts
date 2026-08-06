/**
 * Oturum yenilemesinin ön/arka plan durumuna bağlanması.
 *
 * Bu da sessiz bozulan bir davranış: `autoRefreshToken: true` ayarı kodda
 * duruyor, hiçbir hata çıkmıyor, testler geçiyor — ama uygulama uzun süre arka
 * planda kaldıktan sonra açıldığında token süresi dolmuş oluyor ve kullanıcı
 * sebepsiz yere her yeri boş/hatalı görüyor. Kaldırılırsa hiçbir şey kırmızıya
 * dönmez, o yüzden burada kilitliyoruz.
 */

import { AppState, type AppStateStatus } from "react-native";
import { supabase, registerAuthAutoRefresh } from "../supabase";

type Listener = (state: AppStateStatus) => void;

let listeners: Listener[];
let remove: jest.Mock;
let start: jest.SpyInstance;
let stop: jest.SpyInstance;

beforeEach(() => {
  listeners = [];
  remove = jest.fn();

  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener as Listener);
    return { remove } as ReturnType<typeof AppState.addEventListener>;
  });

  // Gerçek yenileme ağa çıkar; yalnızca ÇAĞRILDIĞINI doğruluyoruz.
  start = jest.spyOn(supabase.auth, "startAutoRefresh").mockResolvedValue(undefined);
  stop = jest.spyOn(supabase.auth, "stopAutoRefresh").mockResolvedValue(undefined);

  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Son kaydedilen dinleyiciyi tetikler. */
function emit(state: AppStateStatus) {
  listeners.forEach((l) => l(state));
}

describe("registerAuthAutoRefresh", () => {
  it("kurulur kurulmaz mevcut duruma göre yenilemeyi başlatır", () => {
    // Yalnızca "change" olayını beklersek, uygulama zaten önplandayken hiçbir
    // olay gelmez ve ilk yenileme sonsuza kadar ertelenir.
    registerAuthAutoRefresh();

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it("arka plana geçince durdurur, öne gelince yeniden başlatır", () => {
    registerAuthAutoRefresh();
    start.mockClear();

    emit("background");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();

    // Öne dönüşteki çağrı sadece zamanlayıcıyı kurmuyor, kaçırılan yenilemeyi
    // de hemen deniyor — ilk veri isteğinden ÖNCE olması bu yüzden önemli.
    emit("active");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("iOS'un 'inactive' durumunda da durdurur", () => {
    // Uygulama değiştirici / bildirim merkezi açıkken gelen ara durum.
    registerAuthAutoRefresh();

    emit("inactive");

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("dönen fonksiyon aboneliği kaldırır", () => {
    const unsubscribe = registerAuthAutoRefresh();

    unsubscribe();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("uygulama önplanda değilken kurulursa başlatmaz", () => {
    Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });

    registerAuthAutoRefresh();

    expect(start).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
