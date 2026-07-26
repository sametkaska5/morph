import { displayUnit, toDisplayValue, toMetricValue } from "../units";

// DB'de değerler HER ZAMAN metrik (kg/cm) saklanır. Bu üç fonksiyon yalnızca
// gösterim/girdi sınırında dönüşür ve "%" gibi diğer birimlere dokunmaz.

describe("displayUnit", () => {
  it("metrik tercihte birimi olduğu gibi bırakır", () => {
    expect(displayUnit("kg", "metric")).toBe("kg");
    expect(displayUnit("cm", "metric")).toBe("cm");
  });

  it("imperial tercihte kg->lb, cm->in çevirir", () => {
    expect(displayUnit("kg", "imperial")).toBe("lb");
    expect(displayUnit("cm", "imperial")).toBe("in");
  });

  it("imperial'de bile kg/cm dışı birimlere dokunmaz", () => {
    expect(displayUnit("%", "imperial")).toBe("%");
    expect(displayUnit("adet", "imperial")).toBe("adet");
  });
});

describe("toDisplayValue", () => {
  it("metrikte değeri değiştirmez", () => {
    expect(toDisplayValue(80, "kg", "metric")).toBe(80);
  });

  it("kg -> lb çevirir ve 1 ondalığa yuvarlar", () => {
    // 80 * 2.20462 = 176.3696 -> 176.4
    expect(toDisplayValue(80, "kg", "imperial")).toBe(176.4);
  });

  it("cm -> in çevirir ve 1 ondalığa yuvarlar", () => {
    // 180 * 0.393701 = 70.86618 -> 70.9
    expect(toDisplayValue(180, "cm", "imperial")).toBe(70.9);
  });

  it("imperial'de kg/cm dışı birimi dönüştürmez", () => {
    expect(toDisplayValue(15, "%", "imperial")).toBe(15);
  });
});

describe("toMetricValue", () => {
  it("metrikte değeri değiştirmez", () => {
    expect(toMetricValue(176.4, "kg", "metric")).toBe(176.4);
  });

  it("lb -> kg çevirir ve 2 ondalığa yuvarlar", () => {
    // 176.4 / 2.20462 = 80.0138... -> 80.01
    expect(toMetricValue(176.4, "kg", "imperial")).toBe(80.01);
  });

  it("in -> cm çevirir ve 2 ondalığa yuvarlar", () => {
    // 70.9 / 0.393701 = 180.0863... -> 180.09
    expect(toMetricValue(70.9, "cm", "imperial")).toBe(180.09);
  });

  it("imperial'de kg/cm dışı birimi dönüştürmez", () => {
    expect(toMetricValue(15, "%", "imperial")).toBe(15);
  });
});

describe("toDisplayValue <-> toMetricValue gidiş-dönüş", () => {
  it("kg için değere yakın döner (yuvarlama toleransıyla)", () => {
    const back = toMetricValue(toDisplayValue(75, "kg", "imperial"), "kg", "imperial");
    expect(Math.abs(back - 75)).toBeLessThan(0.05);
  });
});
