/**
 * OTOMATİK ÜRETİLDİ — ELLE DÜZENLEME.
 *
 * supabase/migrations/ altındaki şemanın TypeScript karşılığı. lib/supabase.ts
 * içinde createClient<Database>'e veriliyor; böylece tüm .from()/.select()/
 * .insert() çağrıları kolon adı ve tip düzeyinde denetleniyor, gömülü ilişki
 * seçimleri (photos!entry_id gibi) Relationships üzerinden çözülüyor.
 *
 * Şemayı değiştiren bir migration yazdığında yenile:
 *
 *   npm run gen:types
 *
 * Yenilemeyi unutursan CI yakalar: RLS işi bu dosyayı yerel veritabanından
 * yeniden üretip commit'lenmiş hâliyle karşılaştırıyor.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      email_lookup_throttle: {
        Row: {
          attempts: number;
          client_key: string;
          window_started_at: string;
        };
        Insert: {
          attempts?: number;
          client_key: string;
          window_started_at?: string;
        };
        Update: {
          attempts?: number;
          client_key?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          cover_photo_id: string | null;
          created_at: string;
          date: string;
          id: string;
          note: string | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cover_photo_id?: string | null;
          created_at?: string;
          date: string;
          id?: string;
          note?: string | null;
          type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cover_photo_id?: string | null;
          created_at?: string;
          date?: string;
          id?: string;
          note?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entries_cover_photo_fk";
            columns: ["cover_photo_id"];
            isOneToOne: false;
            referencedRelation: "photos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      measurement_types: {
        Row: {
          id: string;
          is_default: boolean;
          name: string;
          sort_order: number;
          target_direction: string;
          unit: string;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          is_default?: boolean;
          name: string;
          sort_order?: number;
          target_direction?: string;
          unit: string;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          is_default?: boolean;
          name?: string;
          sort_order?: number;
          target_direction?: string;
          unit?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "measurement_types_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      measurement_values: {
        Row: {
          entry_id: string;
          id: string;
          measurement_type_id: string;
          value: number;
        };
        Insert: {
          entry_id: string;
          id?: string;
          measurement_type_id: string;
          value: number;
        };
        Update: {
          entry_id?: string;
          id?: string;
          measurement_type_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "measurement_values_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "measurement_values_measurement_type_id_fkey";
            columns: ["measurement_type_id"];
            isOneToOne: false;
            referencedRelation: "measurement_types";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_settings: {
        Row: {
          daily_reminder_enabled: boolean;
          past_memory_enabled: boolean;
          quiet_end: string;
          quiet_start: string;
          reminder_time: string;
          streak_enabled: boolean;
          user_id: string;
        };
        Insert: {
          daily_reminder_enabled?: boolean;
          past_memory_enabled?: boolean;
          quiet_end?: string;
          quiet_start?: string;
          reminder_time?: string;
          streak_enabled?: boolean;
          user_id: string;
        };
        Update: {
          daily_reminder_enabled?: boolean;
          past_memory_enabled?: boolean;
          quiet_end?: string;
          quiet_start?: string;
          reminder_time?: string;
          streak_enabled?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          created_at: string;
          entry_id: string;
          id: string;
          order_index: number;
          storage_path: string;
          thumb_path: string | null;
        };
        Insert: {
          created_at?: string;
          entry_id: string;
          id?: string;
          order_index?: number;
          storage_path: string;
          thumb_path?: string | null;
        };
        Update: {
          created_at?: string;
          entry_id?: string;
          id?: string;
          order_index?: number;
          storage_path?: string;
          thumb_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "photos_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          id: string;
          name: string | null;
          unit_pref: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          id: string;
          name?: string | null;
          unit_pref?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          id?: string;
          name?: string | null;
          unit_pref?: string;
        };
        Relationships: [];
      };
      workout_items: {
        Row: {
          created_at: string;
          entry_id: string;
          id: string;
          name: string;
          order_index: number;
        };
        Insert: {
          created_at?: string;
          entry_id: string;
          id?: string;
          name: string;
          order_index?: number;
        };
        Update: {
          created_at?: string;
          entry_id?: string;
          id?: string;
          name?: string;
          order_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workout_items_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sets: {
        Row: {
          created_at: string;
          id: string;
          order_index: number;
          reps: number | null;
          weight: number | null;
          workout_item_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          order_index?: number;
          reps?: number | null;
          weight?: number | null;
          workout_item_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_index?: number;
          reps?: number | null;
          weight?: number | null;
          workout_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_item_id_fkey";
            columns: ["workout_item_id"];
            isOneToOne: false;
            referencedRelation: "workout_items";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_own_account: { Args: never; Returns: undefined };
      email_exists: { Args: { check_email: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
