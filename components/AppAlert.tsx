import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAppAlertStore } from "@/lib/appAlert";

/**
 * Global bilgi/uyarı kutusu. `_layout.tsx`'te bir kez render ediliyor; içeriği
 * `showAlert(...)` çağrılarından geliyor (bkz. lib/appAlert.ts).
 *
 * Onay kutusuyla aynı bileşeni kullanıyor — `onConfirm` verilmediğinde tek
 * "Tamam" butonlu bilgi kipine düşüyor. Böylece uygulamadaki tüm kutular aynı
 * yüzeyi, kenarlığı ve tipografiyi paylaşıyor.
 */
export function AppAlert() {
  const visible = useAppAlertStore((s) => s.visible);
  const title = useAppAlertStore((s) => s.title);
  const message = useAppAlertStore((s) => s.message);
  const tone = useAppAlertStore((s) => s.tone);
  const hide = useAppAlertStore((s) => s.hide);

  return (
    <ConfirmDialog
      visible={visible}
      icon={tone === "danger" ? "alert-circle" : "info"}
      danger={tone === "danger"}
      title={title}
      message={message}
      onClose={hide}
    />
  );
}
