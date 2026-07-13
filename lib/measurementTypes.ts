import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type TargetDirection = "decrease_is_good" | "increase_is_good";

export type MeasurementType = {
  id: string;
  name: string;
  unit: string;
  target_direction: TargetDirection;
  is_default: boolean;
  sort_order: number;
};

export function measurementTypesQueryKey(userId: string | undefined) {
  return ["measurement_types", userId] as const;
}

/**
 * Sistem varsayılanları (user_id null) + kullanıcının kendi özel ölçüm tiplerini
 * birlikte döner. Ayrıca bir .eq("is_default", ...) filtresi GEREKMİYOR — RLS
 * politikası zaten "user_id is null or auth.uid() = user_id" olduğu için sorgu
 * filtresiz bırakılınca doğru satırlar otomatik geliyor.
 */
export function useMeasurementTypes(userId: string | undefined) {
  return useQuery({
    queryKey: measurementTypesQueryKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<MeasurementType[]> => {
      const { data, error } = await supabase
        .from("measurement_types")
        .select("id, name, unit, target_direction, is_default, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddMeasurementType(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; unit: string; target_direction: TargetDirection }) => {
      if (!userId) throw new Error("Giriş yapılmamış");
      const { error } = await supabase.from("measurement_types").insert({
        user_id: userId,
        name: input.name,
        unit: input.unit,
        target_direction: input.target_direction,
        is_default: false,
        sort_order: 100,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementTypesQueryKey(userId) });
    },
  });
}

export function useDeleteMeasurementType(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (typeId: string) => {
      const { error } = await supabase.from("measurement_types").delete().eq("id", typeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementTypesQueryKey(userId) });
    },
  });
}
