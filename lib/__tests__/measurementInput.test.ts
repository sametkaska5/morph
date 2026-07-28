import {
  parseMeasurementInput,
  validateMeasurementInput,
  measurementErrorText,
  MEASUREMENT_GENERIC_MAX,
} from "../measurementInput";

describe("parseMeasurementInput", () => {
  it("düz tam sayıyı ayrıştırır", () => {
    expect(parseMeasurementInput("80")).toBe(80);
  });

  it("nokta ondalığını ayrıştırır", () => {
    expect(parseMeasurementInput("75.5")).toBe(75.5);
  });

  it("virgül ondalığını da kabul eder (Türkçe klavye)", () => {
    expect(parseMeasurementInput("75,5")).toBe(75.5);
  });

  it("baştaki/sondaki boşlukları kırpar", () => {
    expect(parseMeasurementInput("  62.3  ")).toBe(62.3);
  });

  it("boş / yalnızca boşluk girdide null döner", () => {
    expect(parseMeasurementInput("")).toBeNull();
    expect(parseMeasurementInput("   ")).toBeNull();
  });

  it("sayısal olmayan girdide null döner (NaN DB'ye yazılmaz)", () => {
    expect(parseMeasurementInput("abc")).toBeNull();
    expect(parseMeasurementInput("-")).toBeNull();
    expect(parseMeasurementInput(".")).toBeNull();
  });

  it("sonlu olmayan girdide null döner", () => {
    expect(parseMeasurementInput("Infinity")).toBeNull();
    expect(parseMeasurementInput("1e999")).toBeNull(); // taşma -> Infinity -> null
  });

  it("negatif ve sıfırı korur (dönüşüm mantığına bırakılır)", () => {
    expect(parseMeasurementInput("0")).toBe(0);
    expect(parseMeasurementInput("-2.5")).toBe(-2.5);
  });
});

describe("validateMeasurementInput", () => {
  it("boş girdi -> empty", () => {
    expect(validateMeasurementInput("").status).toBe("empty");
    expect(validateMeasurementInput("   ").status).toBe("empty");
  });

  it("geçerli sayı -> ok + değer", () => {
    const v = validateMeasurementInput("80", "kg");
    expect(v.status).toBe("ok");
    expect(v.value).toBe(80);
  });

  it("virgül ondalığını kabul eder", () => {
    expect(validateMeasurementInput("75,5", "kg")).toMatchObject({ status: "ok", value: 75.5 });
  });

  it("sayı olmayan girdi -> invalid", () => {
    expect(validateMeasurementInput("abc", "kg").status).toBe("invalid");
  });

  it("negatif -> negative", () => {
    expect(validateMeasurementInput("-5", "kg").status).toBe("negative");
  });

  it("birime göre üst sınırı aşınca -> too_high (+ max bilgisi)", () => {
    const v = validateMeasurementInput("5000", "kg"); // kg sınırı 1000
    expect(v.status).toBe("too_high");
    expect(v).toMatchObject({ status: "too_high", max: 1000 });
  });

  it("% için 100 üstü too_high", () => {
    expect(validateMeasurementInput("150", "%").status).toBe("too_high");
    expect(validateMeasurementInput("42", "%").status).toBe("ok");
  });

  it("sınır değerin kendisi (tam max) geçerli sayılır", () => {
    expect(validateMeasurementInput("1000", "kg").status).toBe("ok");
  });

  it("bilinmeyen/özel birimde yalnızca genel (çok yüksek) sınır uygulanır", () => {
    // Örn. 'adım' gibi özel bir birim: 40000 geçerli olmalı, sadece saçma büyük eleniyor.
    expect(validateMeasurementInput("40000", "adım").status).toBe("ok");
    expect(validateMeasurementInput(String(MEASUREMENT_GENERIC_MAX + 1), "adım").status).toBe("too_high");
  });

  it("birim verilmezse genel sınır uygulanır", () => {
    expect(validateMeasurementInput("500", undefined).status).toBe("ok");
  });
});

describe("measurementErrorText", () => {
  it("empty ve ok için uyarı yok (null)", () => {
    expect(measurementErrorText(validateMeasurementInput("", "kg"))).toBeNull();
    expect(measurementErrorText(validateMeasurementInput("80", "kg"))).toBeNull();
  });

  it("invalid/negative/too_high için Türkçe uyarı verir", () => {
    expect(measurementErrorText(validateMeasurementInput("abc", "kg"))).toBe("Sayı gir");
    expect(measurementErrorText(validateMeasurementInput("-1", "kg"))).toBe("Negatif olamaz");
    expect(measurementErrorText(validateMeasurementInput("9999", "kg"))).toBe("Çok yüksek (en fazla 1000)");
  });
});
