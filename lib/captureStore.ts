import { create } from "zustand";

// thumbBase64 opsiyonel: üretimi başarısız olursa akış durmasın, sadece
// thumbnail'siz devam edilsin (okuyan taraf tam boya geri düşer).
type CapturedPhoto = { uri: string; base64: string; thumbBase64?: string; takenAt?: string } | null;

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
