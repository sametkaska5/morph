import { supabase } from "./supabase";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export async function exportUserData() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Oturum açık değil.");

    // Tüm verileri aynı anda çekiyoruz
    const [
      { data: profile },
      { data: notification_settings },
      { data: measurement_types },
      { data: entries },
      { data: photos },
      { data: measurement_values },
      { data: workout_items },
      { data: workout_sets },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("notification_settings").select("*").eq("user_id", user.id).maybeSingle(),
      // Kullanıcıya özel ve genel(default) olan tipler (RLS genelde okumaya izin verir)
      supabase.from("measurement_types").select("*"),
      supabase.from("entries").select("*").eq("user_id", user.id),
      // RLS sadece kullanıcının görebileceği fotoğrafları döndürür
      supabase.from("photos").select("*"),
      supabase.from("measurement_values").select("*"),
      supabase.from("workout_items").select("*"),
      supabase.from("workout_sets").select("*"),
    ]);

    // İnsanların okuyabileceği ve renkli, sayfa yapısına sahip bir HTML dosyası oluşturuyoruz
    let htmlContent = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Remory Yedeği</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #F7F9FC; color: #333; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 40px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .header h1 { color: #2D3748; font-size: 28px; margin: 0 0 10px 0; }
    .header p { color: #718096; font-size: 15px; margin: 0; }
    .entry-page { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 40px; page-break-after: always; }
    .entry-date { font-size: 24px; color: #2B6CB0; border-bottom: 2px solid #E2E8F0; padding-bottom: 12px; margin-top: 0; margin-bottom: 20px; font-weight: 700; }
    .entry-type { display: inline-block; background-color: #EBF8FF; color: #3182CE; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
    .entry-note { font-size: 16px; color: #4A5568; white-space: pre-wrap; margin-bottom: 25px; padding: 20px; background: #F7FAFC; border-left: 4px solid #CBD5E0; border-radius: 0 8px 8px 0; }
    .section-title { font-size: 13px; color: #A0AEC0; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 12px; }
    .measurements { list-style: none; padding: 0; margin: 0 0 25px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .measurements li { background: #EDF2F7; padding: 12px 16px; border-radius: 8px; display: flex; flex-direction: column; }
    .measurements li span { font-size: 13px; color: #718096; margin-bottom: 4px; }
    .measurements li strong { color: #2D3748; font-size: 18px; }
    .photos { color: #805AD5; font-weight: 600; font-size: 15px; background: #FAF5FF; padding: 15px; border-radius: 8px; display: flex; align-items: center; gap: 8px; }
    @media print {
      body { background-color: white; padding: 0; margin: 0; }
      .header { box-shadow: none; border-bottom: 1px solid #ccc; border-radius: 0; }
      .entry-page { box-shadow: none; margin: 0; padding: 20px 0; border-radius: 0; }
    }
  </style>
</head>
<body>

<div class="header">
  <h1>Remory Yedeği</h1>
  <p>Dışa Aktarılma Tarihi: ${new Date().toLocaleDateString("tr-TR")} ${new Date().toLocaleTimeString("tr-TR")}</p>
  ${profile?.name ? `<p style="margin-top: 5px; font-weight: 600; color: #4A5568;">Kullanıcı: ${profile.name}</p>` : ""}
</div>
`;

    // Anıları tarihe göre sırala (en yeniden en eskiye)
    const sortedEntries = (entries || []).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Measurement tiplerini id'ye göre mapleyelim
    const measurementTypesMap = (measurement_types || []).reduce(
      (acc, curr) => {
        acc[curr.id] = curr;
        return acc;
      },
      {} as Record<string, any>,
    );

    if (sortedEntries.length === 0) {
      htmlContent += `<div class="entry-page"><p style="text-align: center; color: #A0AEC0;">Henüz kaydedilmiş bir anı bulunmuyor.</p></div>\n`;
    } else {
      for (const entry of sortedEntries) {
        htmlContent += `<div class="entry-page">\n`;
        htmlContent += `  <h2 class="entry-date">${new Date(entry.date).toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h2>\n`;

        const typeLabel = entry.type === "workout" ? "Antrenman" : "Anı";
        htmlContent += `  <div class="entry-type">${typeLabel}</div>\n`;

        if (entry.note) {
          htmlContent += `  <div class="entry-note">${entry.note}</div>\n`;
        }

        // Bu anıya ait ölçümler
        const entryMeasurements = (measurement_values || []).filter(
          (m: any) => m.entry_id === entry.id,
        );
        if (entryMeasurements.length > 0) {
          htmlContent += `  <div class="section-title">Ölçümler</div>\n`;
          htmlContent += `  <ul class="measurements">\n`;
          for (const m of entryMeasurements) {
            const mType = measurementTypesMap[m.measurement_type_id];
            if (mType) {
              htmlContent += `    <li><span>${mType.name}</span><strong>${m.value} ${mType.unit}</strong></li>\n`;
            }
          }
          htmlContent += `  </ul>\n`;
        }

        // Bu anıya ait fotoğraflar
        const entryPhotos = (photos || []).filter((p: any) => p.entry_id === entry.id);
        if (entryPhotos.length > 0) {
          htmlContent += `  <div class="photos">📸 ${entryPhotos.length} adet fotoğraf kaydedilmiş</div>\n`;
        }

        htmlContent += `</div>\n`;
      }
    }

    htmlContent += `</body>\n</html>`;

    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `remory-yedek-${dateStr}.html`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, htmlContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/html",
        dialogTitle: "Remory Verilerini Dışa Aktar",
        UTI: "public.html",
      });
    } else {
      throw new Error("Cihazınızda dosya paylaşımı desteklenmiyor.");
    }
  } catch (error) {
    throw error;
  }
}
