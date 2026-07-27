import { nextOffDayState } from "../offDay";

describe("nextOffDayState (3 durumlu döngü)", () => {
  it("boş (null) -> off_day", () => {
    expect(nextOffDayState(null)).toBe("off_day");
  });

  it("off_day -> workout", () => {
    expect(nextOffDayState("off_day")).toBe("workout");
  });

  it("workout -> boş (null)", () => {
    expect(nextOffDayState("workout")).toBeNull();
  });

  it("tam bir döngü başladığı yere döner", () => {
    expect(nextOffDayState(nextOffDayState(nextOffDayState(null)))).toBeNull();
  });

  it("beklenmeyen 'log' değeri güvenli varsayılana (off_day) düşer", () => {
    expect(nextOffDayState("log")).toBe("off_day");
  });
});
