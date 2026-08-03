import { render, screen, fireEvent } from "@testing-library/react-native";
import type { ProgramData } from "../workout";

/**
 * app/entry/program.tsx — program formunun doldurulması.
 *
 * Bu ekranın hydration mantığı diğerlerinden daha karmaşık: form yalnızca
 * `${dateKey}:${entryId}` anahtarı DEĞİŞTİĞİNDE bir kez doldurulur. Amaç,
 * kullanıcı hareket yazarken geç gelen bir sorgu sonucunun yazdıklarını
 * silmemesi. Anahtar yanlış kurulursa iki uçtan biri olur: form hiç dolmaz,
 * ya da her render'da sıfırlanıp kullanıcıyı yazamaz hâle getirir.
 */

const mockUseAuth = jest.fn();
const mockUseProgramDay = jest.fn();
const mockMutate = jest.fn();

jest.mock("../useAuth", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../workout", () => ({
  useProgramDay: (...args: unknown[]) => mockUseProgramDay(...args),
  saveProgram: jest.fn(),
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ date: "2026-08-01" }),
}));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("../alerts", () => ({ alertError: jest.fn() }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
}));

import ProgramScreen from "@/app/entry/program";

const PROGRAM: ProgramData = {
  entryId: "e1",
  items: [
    {
      name: "Bench Press",
      order_index: 0,
      sets: [
        { reps: 8, weight: 60, order_index: 0 },
        { reps: 6, weight: 65, order_index: 1 },
      ],
    },
    { name: "Squat", order_index: 1, sets: [{ reps: 5, weight: 100, order_index: 0 }] },
  ],
};

/** Ekrandaki hareket adı alanlarının değerleri. */
function exerciseNames() {
  return screen
    .getAllByPlaceholderText("Hareket (örn. Bench Press)")
    .map((input) => input.props.value);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseProgramDay.mockReturnValue({ data: PROGRAM, isLoading: false });
});

describe("program ekranı — form doldurma", () => {
  it("o güne kayıtlı programı hareketleriyle doldurur", async () => {
    await render(<ProgramScreen />);

    expect(exerciseNames()).toEqual(["Bench Press", "Squat"]);
  });

  it("yükleme bitip veri gelince doldurur", async () => {
    mockUseProgramDay.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = await render(<ProgramScreen />);
    expect(screen.queryAllByPlaceholderText("Hareket (örn. Bench Press)")).toHaveLength(0);

    mockUseProgramDay.mockReturnValue({ data: PROGRAM, isLoading: false });
    await rerender(<ProgramScreen />);

    expect(exerciseNames()).toEqual(["Bench Press", "Squat"]);
  });

  it("YÜKLENİRKEN formu doldurmaz (yarım veriyle yazmaya başlatmaz)", async () => {
    // isLoading true iken data da gelmiş olsa bile hydrate edilmemeli;
    // aksi halde sorgu tamamlanınca ikinci kez doldurup kullanıcıyı ezerdi.
    mockUseProgramDay.mockReturnValue({ data: PROGRAM, isLoading: true });
    await render(<ProgramScreen />);

    expect(screen.queryAllByPlaceholderText("Hareket (örn. Bench Press)")).toHaveLength(0);
  });

  it("sorgu HATA verdiyse formu hiç açmaz", async () => {
    // En tehlikeli senaryo: hatada da isLoading false oluyor ve data undefined
    // kalıyor. Form "bu günde hiç hareket yok" diye boş dolarsa, kullanıcının
    // basacağı Kaydet o günün programını gerçekten siler.
    mockUseProgramDay.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    await render(<ProgramScreen />);

    expect(screen.queryAllByPlaceholderText("Hareket (örn. Bench Press)")).toHaveLength(0);
    expect(screen.getByLabelText("Tekrar dene")).toBeTruthy();
  });

  it("hata sonrası veri gelince formu normal doldurur", async () => {
    mockUseProgramDay.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch: jest.fn(),
    });
    const { rerender } = await render(<ProgramScreen />);

    mockUseProgramDay.mockReturnValue({ data: PROGRAM, isLoading: false });
    await rerender(<ProgramScreen />);

    expect(exerciseNames()).toEqual(["Bench Press", "Squat"]);
  });

  it("kullanıcının yazdığını sonraki render'lar EZMEZ", async () => {
    const { rerender } = await render(<ProgramScreen />);

    const [first] = screen.getAllByPlaceholderText("Hareket (örn. Bench Press)");
    await fireEvent.changeText(first, "Incline Press");
    expect(exerciseNames()[0]).toBe("Incline Press");

    // Aynı gün + aynı entry: hydration anahtarı değişmedi, dokunulmamalı.
    await rerender(<ProgramScreen />);
    await rerender(<ProgramScreen />);

    expect(exerciseNames()[0]).toBe("Incline Press");
  });

  it("kullanıcı hareket sildikten sonra da geri getirmez", async () => {
    const { rerender } = await render(<ProgramScreen />);

    await fireEvent.press(screen.getAllByLabelText("Hareketi sil")[0]);
    expect(exerciseNames()).toEqual(["Squat"]);

    await rerender(<ProgramScreen />);

    expect(exerciseNames()).toEqual(["Squat"]);
  });

  it("BAŞKA bir güne ait program gelince formu tazeler", async () => {
    const { rerender } = await render(<ProgramScreen />);
    expect(exerciseNames()).toEqual(["Bench Press", "Squat"]);

    // entryId değişti → hydration anahtarı değişti → yeniden doldurulmalı.
    mockUseProgramDay.mockReturnValue({
      data: {
        entryId: "e2",
        items: [{ name: "Deadlift", order_index: 0, sets: [] }],
      },
      isLoading: false,
    });
    await rerender(<ProgramScreen />);

    expect(exerciseNames()).toEqual(["Deadlift"]);
  });

  it("programı olmayan günde boş açılır ve bilgilendirme gösterir", async () => {
    mockUseProgramDay.mockReturnValue({ data: null, isLoading: false });
    await render(<ProgramScreen />);

    expect(screen.queryAllByPlaceholderText("Hareket (örn. Bench Press)")).toHaveLength(0);
    expect(screen.getByText(/hareket hareket, set set ekle/)).toBeTruthy();
  });

  it("seti olmayan hareketi en az bir boş setle açar (girilebilir olsun)", async () => {
    mockUseProgramDay.mockReturnValue({
      data: { entryId: "e1", items: [{ name: "Koşu", order_index: 0, sets: [] }] },
      isLoading: false,
    });
    await render(<ProgramScreen />);

    expect(exerciseNames()).toEqual(["Koşu"]);
    // Set satırı numarası görünmeli — hareket set girişine hazır olmalı.
    expect(screen.getByText("1")).toBeTruthy();
  });
});
