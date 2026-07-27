import { parseMeasurementInput } from "../measurementInput";

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
