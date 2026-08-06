/**
 * Bildirime dokunulunca kaydın detayına gitme.
 *
 * Buradaki risk sessiz: bildirim yükü doğrulanmadan okunursa `/entry/undefined`
 * route'una gidilir — ekran açılır, "kayıt bulunamadı" der ve kullanıcı bunun
 * bir yazılım hatası mı yoksa silinmiş bir anı mı olduğunu ayırt edemez.
 * `entryId` taşımayan bildirimler gerçekten var (günlük hatırlatma, seri
 * uyarısı), üstelik eski sürümde zamanlanmışlar işletim sisteminde bekliyor
 * olabiliyor.
 */

import { notificationTap } from "../notifications";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "bare" },
  ExecutionEnvironment: { StoreClient: "storeClient", Bare: "bare", Standalone: "standalone" },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
}));

jest.mock("../supabase", () => ({ supabase: {} }));

/** Gerçek NotificationResponse'un bu fonksiyonu ilgilendiren kısmı. */
function response(identifier: string, data: unknown) {
  return { notification: { request: { identifier, content: { data } } } };
}

describe("notificationTap", () => {
  it("anı bildiriminden kayıt kimliğini çıkarır", () => {
    expect(notificationTap(response("memory-abc-3", { entryId: "abc" }))).toEqual({
      notificationId: "memory-abc-3",
      entryId: "abc",
    });
  });

  it("entryId taşımayan bildirimde null döner", () => {
    // Günlük hatırlatma ve seri uyarısı yüksüz zamanlanıyor — bunlara dokunmak
    // uygulamayı açmalı, rastgele bir kayda ATLAMAMALI.
    expect(notificationTap(response("daily-reminder", {}))).toBeNull();
    expect(notificationTap(response("streak-risk", undefined))).toBeNull();
  });

  it("entryId string değilse null döner", () => {
    // Yük işletim sisteminde saklanıyor ve JSON'dan geri okunuyor; tipinin
    // beklediğimiz gibi geldiği garanti değil.
    expect(notificationTap(response("memory-x", { entryId: 42 }))).toBeNull();
    expect(notificationTap(response("memory-x", { entryId: null }))).toBeNull();
    expect(notificationTap(response("memory-x", { entryId: "" }))).toBeNull();
  });

  it("yanıt hiç yoksa null döner", () => {
    // getLastNotificationResponseAsync, bildirimle açılmayan her açılışta null
    // dönüyor — soğuk açılış yolunun normal hâli bu.
    expect(notificationTap(null)).toBeNull();
    expect(notificationTap(undefined)).toBeNull();
  });
});
