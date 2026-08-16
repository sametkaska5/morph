import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { queryKeys } from "./queryKeys";

export type TargetDirection = "decrease_is_good" | "increase_is_good";

export type MeasurementType = {
  id: string;
  name: string;
  unit: string;
  target_direction: TargetDirection;
  is_default: boolean;
  sort_order: number;
};

/**
 * Sistem varsayılanları (user_id null) + kullanıcının kendi özel ölçüm tiplerini
 * birlikte döner. Ayrıca bir .eq("is_default", ...) filtresi GEREKMİYOR — RLS
 * politikası zaten "user_id is null or auth.uid() = user_id" olduğu için sorgu
 * filtresiz bırakılınca doğru satırlar otomatik geliyor.
 */
async function fetchMeasurementTypes(): Promise<MeasurementType[]> {
  const { data, error } = await supabase
    .from("measurement_types")
    .select("id, name, unit, target_direction, is_default, sort_order")
    .order("sort_order");
  if (error) throw error;
  // DB'de target_direction düz text kolonu ama check constraint yalnızca bu
  // iki değere izin veriyor (0001_init.sql) — daraltma güvenli.
  return (data ?? []) as MeasurementType[];
}

export function useMeasurementTypes(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.measurementTypes.byUser(userId),
    enabled: !!userId,
    queryFn: fetchMeasurementTypes,
  });
}

/**
 * Ölçüm tiplerini KULLANICI DÜZENLEME EKRANINI AÇMADAN ÖNCE hazırlar.
 *
 * Düzenleme formundaki alanlar bu listeden üretiliyor, yani liste gelmeden form
 * çizilemiyor (app/entry/edit/[id].tsx içindeki formReady buna da bakıyor).
 * Liste genelde AsyncStorage'daki kalıcı cache'ten anında geliyor, ama o cache
 * boşsa — yeni kurulum, çıkış/giriş, cache sürümü değişmiş — kendi ağ turunu
 * beklettiriyor ve kullanıcı bunu "Kaydet geç geldi" olarak görüyor.
 *
 * Kayıt verisiyle aynı ana bağlı (anı akışında kartın çevrilmesi) ve onunla
 * PARALEL gidiyor: ikisi ayrı sorgu olduğu için biri diğerini beklemiyor.
 */
export function usePrefetchMeasurementTypes(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (!userId) return;
    queryClient.prefetchQuery({
      queryKey: queryKeys.measurementTypes.byUser(userId),
      queryFn: fetchMeasurementTypes,
    });
  }, [queryClient, userId]);
}

export function useAddMeasurementType(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; unit: string; target_direction: TargetDirection }) => {
      if (!userId) throw new Error("Giriş yapılmamış");

      // Sıra numarası ARTAN olmalı. Eskiden her özel tipe sabit 100 yazılıyordu:
      // ikinci özel ölçümden sonra hepsi eşit oluyor ve sorgu `order("sort_order")`
      // ile eşitleri sıralamadığı için liste her yeniden çekmede farklı dizilebiliyordu
      // (istatistiklerdeki ölçüm sekmelerinin sırası da buna bağlı).
      // Taban 100: sistem varsayılanları 1-4 aralığında (0001/0007 migration),
      // özel tipler her zaman onların ARDINDA kalsın.
      const { data: existing, error: readError } = await supabase
        .from("measurement_types")
        .select("sort_order")
        .eq("user_id", userId);
      if (readError) throw readError;

      const nextSortOrder = Math.max(
        100,
        ...(existing ?? []).map((t) => t.sort_order + 1)
      );

      const { error } = await supabase.from("measurement_types").insert({
        user_id: userId,
        name: input.name,
        unit: input.unit,
        target_direction: input.target_direction,
        is_default: false,
        sort_order: nextSortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.measurementTypes.byUser(userId) });
    },
  });
}

export function useDeleteMeasurementType(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (typeId: string) => {
      // Önce bağlı değerleri sil — DB'de ON DELETE CASCADE var (0019 migration)
      // ama istemci tarafından da yapıyoruz: hem açıklayıcı hata mesajı alırız
      // hem eski DB sürümlerine karşı güvende oluruz.
      const { error: valuesError } = await supabase
        .from("measurement_values")
        .delete()
        .eq("measurement_type_id", typeId);
      if (valuesError) throw valuesError;

      const { error } = await supabase.from("measurement_types").delete().eq("id", typeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.measurementTypes.byUser(userId) });
    },
  });
}
