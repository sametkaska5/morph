import { create } from "zustand";

type CapturedPhoto = { uri: string; base64: string } | null;

interface CaptureStore {
  photo: CapturedPhoto;
  setPhoto: (photo: CapturedPhoto) => void;
  clear: () => void;
}

export const useCaptureStore = create<CaptureStore>((set) => ({
  photo: null,
  setPhoto: (photo) => set({ photo }),
  clear: () => set({ photo: null }),
}));
