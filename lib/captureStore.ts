import { create } from "zustand";

// base64 ARTIK opsiyonel: çekim akışı önce ham uri ile kayıt ekranına geçip
// (önizleme anında görünsün diye) ağır küçültme/base64 işini arka planda yapıyor;
// bitince patchPhoto ile base64 dolduruluyor. processing=true iken kaydetme bekler.
// thumbBase64 de opsiyonel: üretimi başarısız olursa akış durmasın (okuyan taraf
// tam boya geri düşer).
// width/height: seçicinin bildirdiği ORİJİNAL piksel ölçüleri. Yalnızca kayıt
// ekranındaki önizlemeyi fotoğrafın kendi en-boy oranında çizmek için var —
// sabit yükseklikli bir kutuda `cover` ile doldurmak dikey fotoğrafların
// üstünü/altını kırpıyordu. Opsiyoneller: eski akışlardan gelen ya da ölçüsü
// bilinmeyen fotoğraflarda okuyan taraf makul bir orana düşüyor.
export type CapturedPhoto = {
  uri: string;
  base64?: string;
  thumbBase64?: string;
  takenAt?: string;
  processing?: boolean;
  width?: number;
  height?: number;
};

interface CaptureStore {
  photos: CapturedPhoto[];
  setPhotos: (photos: CapturedPhoto[]) => void;
  /** Mevcut fotoğrafın üstüne alanları birleştirir (arka plan işlemesi bitince
   *  base64'ü doldurmak için). */
  patchPhoto: (uri: string, partial: Partial<CapturedPhoto>) => void;
  clear: () => void;
}

export const useCaptureStore = create<CaptureStore>((set) => ({
  photos: [],
  setPhotos: (photos) => set({ photos }),
  patchPhoto: (uri, partial) =>
    set((s) => ({
      photos: s.photos.map((p) => (p.uri === uri ? { ...p, ...partial } : p)),
    })),
  clear: () => set({ photos: [] }),
}));
