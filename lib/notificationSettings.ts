import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type NotificationSettings = {
  user_id: string;
  past_memory_enabled: boolean;
  streak_enabled: boolean;
  daily_reminder_enabled: boolean;
  reminder_time: string; // "HH:MM:SS"
};

export function useNotificationSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ["notification_settings", userId],
    enabled: !!userId,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("user_id, past_memory_enabled, streak_enabled, daily_reminder_enabled, reminder_time")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateNotificationSettings(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["notification_settings", userId];
  return useMutation({
    mutationFn: async (patch: Partial<Omit<NotificationSettings, "user_id">>) => {
      if (!userId) throw new Error("Giriş yapılmamış");
      const { error } = await supabase.from("notification_settings").update(patch).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      // Switch'lerin sunucu round-trip'i beklemeden anında tepki vermesi için —
      // aksi halde ağ gecikmesinde toggle "geri sıçrıyor" gibi görünüyordu.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationSettings>(key);
      queryClient.setQueryData<NotificationSettings>(key, (old) => (old ? { ...old, ...patch } : old));
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
