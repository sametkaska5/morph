import { create } from "zustand";

/**
 * Uygulamanın kendi bilgi/uyarı kutusu — native `Alert.alert` yerine.
 *
 * Neden bir store: `Alert.alert` her yerden çağrılabilen BUYURGAN bir fonksiyon,
 * temalı kutumuz ise state gerektiren bir bileşen. 18 çağrı yerinin her birine
 * ayrı state eklemek hem çok fazla gereksiz değişiklik olurdu hem de bazı
 * çağrılar ekranda değil modülde (bkz. lib/capture.ts izin uyarıları) — orada
 * hook kullanılamaz. Kutu `_layout.tsx`'te BİR KEZ render ediliyor, her yerden
 * `showAlert(...)` ile açılıyor.
 *
 * Desen yeni değil: CaptureOptionsSheet de aynı şekilde global render edilip
 * `openCapturePicker()` ile açılıyor (bkz. lib/captureSheetStore.ts).
 */

export type AlertTone = "info" | "danger";

interface AppAlertStore {
  visible: boolean;
  title: string;
  message: string;
  tone: AlertTone;
  show: (title: string, message: string, tone: AlertTone) => void;
  hide: () => void;
}

export const useAppAlertStore = create<AppAlertStore>((set) => ({
  visible: false,
  title: "",
  message: "",
  tone: "info",
  show: (title, message, tone) => set({ visible: true, title, message, tone }),
  hide: () => set({ visible: false }),
}));

/**
 * Temalı uyarı kutusunu açar. React dışından da çağrılabilir (getState) —
 * `Alert.alert(baslik, mesaj)` ile birebir aynı kullanım.
 */
export function showAlert(title: string, message: string, tone: AlertTone = "info") {
  useAppAlertStore.getState().show(title, message, tone);
}
