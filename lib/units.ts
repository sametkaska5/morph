import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { queryKeys } from "./queryKeys";

export type UnitPref = "metric" | "imperial";

const KG_TO_LB = 2.20462;
const CM_TO_IN = 0.393701;

export function useUnitPreference(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile.unitPref(userId),
    enabled: !!userId,
    queryFn: async (): Promise<UnitPref> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("unit_pref")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return (data?.unit_pref as UnitPref) ?? "metric";
    },
  });
}

export function useSetUnitPreference(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pref: UnitPref) => {
      if (!userId) throw new Error("Giriş yapılmamış");
      const { error } = await supabase
        .from("profiles")
        .update({ unit_pref: pref })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.unitPref(userId) });
    },
  });
}

/**
 * DB'de değerler her zaman metrik (kg/cm) saklanır — bu üç fonksiyon sadece
 * gösterim/girdi sınırında dönüşüm yapar, "%"  gibi ölçüm birimlerine ya da
 * kullanıcı özel birimlerine (kg/cm dışında) dokunmaz.
 */
export function displayUnit(baseUnit: string, pref: UnitPref): string {
  if (pref !== "imperial") return baseUnit;
  if (baseUnit === "kg") return "lb";
  if (baseUnit === "cm") return "in";
  return baseUnit;
}

export function toDisplayValue(valueMetric: number, baseUnit: string, pref: UnitPref): number {
  if (pref !== "imperial") return valueMetric;
  if (baseUnit === "kg") return Number((valueMetric * KG_TO_LB).toFixed(1));
  if (baseUnit === "cm") return Number((valueMetric * CM_TO_IN).toFixed(1));
  return valueMetric;
}

export function toMetricValue(valueDisplay: number, baseUnit: string, pref: UnitPref): number {
  if (pref !== "imperial") return valueDisplay;
  if (baseUnit === "kg") return Number((valueDisplay / KG_TO_LB).toFixed(2));
  if (baseUnit === "cm") return Number((valueDisplay / CM_TO_IN).toFixed(2));
  return valueDisplay;
}
