import { create } from "zustand";

interface CaptureSheetStore {
  visible: boolean;
  show: () => void;
  hide: () => void;
}

export const useCaptureSheetStore = create<CaptureSheetStore>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));
