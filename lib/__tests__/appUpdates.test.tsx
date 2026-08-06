/**
 * Kablosuz güncelleme (EAS Update) akışı.
 *
 * Burada iki sessiz kırılma korunuyor:
 *
 *  1. `ready` bayrağını expo-updates'in `isUpdatePending`'inden DEĞİL de kendi
 *     state'imizden okursak, açılıştaki OTOMATİK indirme bizim kodumuzdan
 *     geçmediği için bayrak hiç açılmaz — güncelleme cihazda hazır bekler,
 *     kullanıcı hiç haberdar olmaz. Hiçbir hata çıkmaz.
 *  2. Kısıtlama (throttle) kaldırılırsa uygulamayı gün içinde onlarca kez açan
 *     kullanıcıda her açılış bir ağ isteği olur. Gözle görülmez, faturaya yansır.
 */

const mockCheck = jest.fn();
const mockFetch = jest.fn();
const mockReload = jest.fn();
let mockIsEnabled = true;
let mockPending = false;

jest.mock("expo-updates", () => ({
  get isEnabled() {
    return mockIsEnabled;
  },
  useUpdates: () => ({ isUpdatePending: mockPending }),
  checkForUpdateAsync: () => mockCheck(),
  fetchUpdateAsync: () => mockFetch(),
  reloadAsync: () => mockReload(),
}));

jest.mock("../monitoring", () => ({ captureError: jest.fn() }));

import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  shouldCheckForUpdate,
  useAppUpdate,
  UPDATE_CHECK_INTERVAL_MS,
} from "../appUpdates";
import { UpdateBanner } from "@/components/UpdateBanner";

/** Hook'u gözlemlemek için minik bir sarmalayıcı. */
function Probe() {
  const { ready, apply } = useAppUpdate();
  return <Text onPress={apply}>{ready ? "hazir" : "yok"}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsEnabled = true;
  mockPending = false;
  mockCheck.mockResolvedValue({ isAvailable: false });
  mockFetch.mockResolvedValue({ isNew: true });
  mockReload.mockResolvedValue(undefined);
});

describe("shouldCheckForUpdate", () => {
  it("ilk kontrolde her zaman geçer", () => {
    expect(shouldCheckForUpdate(null, 1_000)).toBe(true);
  });

  it("aralık dolmadan tekrar kontrol etmez", () => {
    const now = 10_000_000;
    expect(shouldCheckForUpdate(now, now + UPDATE_CHECK_INTERVAL_MS - 1)).toBe(false);
  });

  it("aralık dolunca tekrar kontrol eder", () => {
    const now = 10_000_000;
    expect(shouldCheckForUpdate(now, now + UPDATE_CHECK_INTERVAL_MS)).toBe(true);
  });
});

describe("useAppUpdate", () => {
  it("güncelleme varsa indirir", async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });

    await render(<Probe />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("güncelleme yoksa indirmeye kalkmaz", async () => {
    await render(<Probe />);

    await waitFor(() => expect(mockCheck).toHaveBeenCalled());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("expo-updates KAPALIYSA (geliştirme) hiç kontrol etmez", async () => {
    // checkForUpdateAsync geliştirmede hata fırlatıyor.
    mockIsEnabled = false;

    await render(<Probe />);

    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("kontrol patlarsa kullanıcıya yansımaz", async () => {
    // Ağ yokken sık sık olacak; uygulama normal çalışmaya devam etmeli.
    mockCheck.mockRejectedValue(new Error("ağ yok"));

    await render(<Probe />);

    await waitFor(() => expect(mockCheck).toHaveBeenCalled());
    expect(screen.getByText("yok")).toBeTruthy();
  });

  it("hazır durumu expo-updates'in isUpdatePending'inden gelir", async () => {
    // Açılıştaki otomatik indirme bizim kodumuzdan geçmiyor — kendi
    // state'imizi tutsaydık bu senaryoda bayrak hiç açılmazdı.
    mockPending = true;
    mockCheck.mockResolvedValue({ isAvailable: false });

    await render(<Probe />);

    expect(screen.getByText("hazir")).toBeTruthy();
  });

  it("yeniden başlatmayı KENDİLİĞİNDEN yapmaz", async () => {
    // Kullanıcı bir şeyin ortasında olabilir; zamanlama onun kararı.
    mockPending = true;
    mockCheck.mockResolvedValue({ isAvailable: true });

    await render(<Probe />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("apply çağrılınca yeniden başlatır", async () => {
    mockPending = true;

    await render(<Probe />);
    await fireEvent.press(screen.getByText("hazir"));

    expect(mockReload).toHaveBeenCalled();
  });
});

describe("UpdateBanner", () => {
  it("yeniden başlat düğmesi eylemi çağırır", async () => {
    const onApply = jest.fn();

    await render(<UpdateBanner onApply={onApply} />);
    await fireEvent.press(screen.getByLabelText("Yeni sürüme geçmek için yeniden başlat"));

    expect(onApply).toHaveBeenCalled();
  });

  it("kaydetme sürerken yeniden başlatmayı engeller ve sebebini yazar", async () => {
    // Yarıda kesilen bir fotoğraf yüklemesi kullanıcı için veri kaybı gibi görünür.
    const onApply = jest.fn();

    await render(<UpdateBanner onApply={onApply} busy />);
    await fireEvent.press(screen.getByLabelText("Yeni sürüme geçmek için yeniden başlat"));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("Kaydetme bitince yeniden başlat")).toBeTruthy();
  });
});
