// Bu route hiç render edilmez: _layout.tsx'teki tabBarButton, basılınca doğrudan
// kamera/galeri seçimini açıp navigasyonu engelliyor. Dosya sadece Tabs.Screen
// name="capture" eşleşmesi için var.
export default function Screen() {
  return null;
}
