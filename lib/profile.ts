import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { getPhotoUrl } from "./storage";
import { queryKeys } from "./queryKeys";

export type ProfileInfo = {
  name: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile.info(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileInfo> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("name, avatar_path, created_at")
        .eq("id", userId!)
        .single();
      if (error) throw error;

      const avatarUrl = data.avatar_path ? await getPhotoUrl(data.avatar_path) : null;
      return {
        name: data.name,
        avatarPath: data.avatar_path,
        avatarUrl,
        createdAt: data.created_at,
      };
    },
  });
}

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { name?: string | null; avatar_path?: string | null }) => {
      if (!userId) throw new Error("Giriş yapılmamış");
      const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}
