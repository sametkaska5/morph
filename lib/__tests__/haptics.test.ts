/**
 * lib/haptics.ts — dokunsal geri bildirimin HATA VERMEME garantisi.
 *
 * Bu sarmalayıcının tek sözleşmesi var: hiçbir koşulda uygulamayı bozmamak.
 * Kritik olan sebep, projenin dağıtım biçimi: JS güncellemesi (eas update)
 * cihaza gidebiliyor ama native taraf ancak yeni bir derlemeyle geliyor. Yani
 * expo-haptics'in native modülü OLMAYAN bir derlemede bu kodun çalışması
 * tamamen olağan bir durum — istisna değil.
 *
 * O durumda modülü import etmek çalışma anında hata fırlatıyor. Sarmalayıcı
 * olmasaydı kaydetme ekranı açılışta çökerdi. Aşağıdaki ilk test tam olarak
 * bunu kilitliyor; ikincisi de sessizliğin "hiçbir şey yapmıyor"a dönüşmediğini,
 * modül varken doğru desenlerin çağrıldığını doğruluyor.
 */

describe("dokunsal geri bildirim", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("expo-haptics");
  });

  it("native modül yokken çağrılar sessizce geçer", () => {
    jest.doMock("expo-haptics", () => {
      throw new Error("Cannot find native module 'ExpoHaptics'");
    });

    let haptics: typeof import("../haptics");
    jest.isolateModules(() => {
      haptics = require("../haptics");
    });

    expect(() => haptics!.hapticSuccess()).not.toThrow();
    expect(() => haptics!.hapticWarning()).not.toThrow();
    expect(() => haptics!.hapticSelection()).not.toThrow();
    expect(() => haptics!.hapticLight()).not.toThrow();
  });

  it("native taraf patlarsa da çağıran etkilenmez", () => {
    // Modül var ama çağrı reddediliyor (izin yok, donanım desteklemiyor).
    // Yakalanmayan bir promise reddi RN'de kırmızı ekran uyarısı üretirdi.
    jest.doMock("expo-haptics", () => ({
      notificationAsync: () => Promise.reject(new Error("no vibrator")),
      selectionAsync: () => Promise.reject(new Error("no vibrator")),
      impactAsync: () => Promise.reject(new Error("no vibrator")),
      NotificationFeedbackType: { Success: "success", Warning: "warning" },
      ImpactFeedbackStyle: { Light: "light" },
    }));

    let haptics: typeof import("../haptics");
    jest.isolateModules(() => {
      haptics = require("../haptics");
    });

    expect(() => haptics!.hapticSuccess()).not.toThrow();
  });

  it("modül varken her desen kendi API'sini çağırır", () => {
    const notificationAsync = jest.fn().mockResolvedValue(undefined);
    const selectionAsync = jest.fn().mockResolvedValue(undefined);
    const impactAsync = jest.fn().mockResolvedValue(undefined);

    jest.doMock("expo-haptics", () => ({
      notificationAsync,
      selectionAsync,
      impactAsync,
      NotificationFeedbackType: { Success: "success", Warning: "warning" },
      ImpactFeedbackStyle: { Light: "light" },
    }));

    let haptics: typeof import("../haptics");
    jest.isolateModules(() => {
      haptics = require("../haptics");
    });

    haptics!.hapticSuccess();
    haptics!.hapticWarning();
    haptics!.hapticSelection();
    haptics!.hapticLight();

    // Başarı ve uyarı AYNI API'nin farklı desenleri — karıştırılırsa silme
    // onayı "işlem başarılı" gibi hissettirirdi.
    expect(notificationAsync).toHaveBeenNthCalledWith(1, "success");
    expect(notificationAsync).toHaveBeenNthCalledWith(2, "warning");
    expect(selectionAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith("light");
  });
});
