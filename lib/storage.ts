import { supabase } from "./supabase";
import { decode } from "base64-arraybuffer";

const SIGNED_URL_EXPIRY = 60 * 60 * 6; // 6 saat — sık sık yenilemeye gerek kalmasın

export async function uploadPhoto(userId: string, entryId: string, base64: string) {
  const fileName = `${Date.now()}.jpg`;
  const path = `${userId}/${entryId}/${fileName}`;

  const { error } = await supabase.storage.from("photos").upload(path, decode(base64), {
    contentType: "image/jpeg",
  });

  if (error) throw error;
  return path;
}

export async function getPhotoUrl(path: string) {
  const { data, error } = await supabase.storage.from("photos").createSignedUrl(path, SIGNED_URL_EXPIRY);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Birden fazla fotoğrafın imzalı linkini TEK istekte üretir.
 * Anı Akışı / Ana Ekran gibi çok sayıda fotoğraf gösteren ekranlarda
 * her biri için ayrı istek atmak yerine bunu kullan — büyük hız farkı yaratıyor.
 */
export async function getPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return new Map();

  const { data, error } = await supabase.storage.from("photos").createSignedUrls(uniquePaths, SIGNED_URL_EXPIRY);
  if (error) throw error;

  const map = new Map<string, string>();
  (data ?? []).forEach((d) => {
    if (d.signedUrl && d.path) map.set(d.path, d.signedUrl);
  });
  return map;
}

