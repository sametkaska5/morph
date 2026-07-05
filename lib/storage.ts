import { supabase } from "./supabase";
import { decode } from "base64-arraybuffer";

export async function uploadPhoto(userId: string, entryId: string, base64: string) {
  // Gelen base64 verisinde "data:image/jpeg;base64," gibi bir ön ek varsa, 
  // virgülden sonrasını (saf base64 verisini) alıyoruz.
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  const fileName = `${Date.now()}.jpg`;
  const path = `${userId}/${entryId}/${fileName}`;

  const { error } = await supabase.storage.from("photos").upload(path, decode(cleanBase64), {
    contentType: "image/jpeg",
  });

  if (error) throw error;
  return path;
}

export async function getPhotoUrl(path: string) {
  const { data, error } = await supabase.storage.from("photos").createSignedUrl(path, 3600); // 1 saat geçerli
  if (error) throw error;
  return data.signedUrl;
}