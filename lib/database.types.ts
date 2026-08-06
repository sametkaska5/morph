/**
 * Supabase veritabanı tipleri — supabase/migrations/ altındaki şemanın
 * (0001…0013) TypeScript karşılığı, `supabase gen types` çıktı formatında.
 *
 * NASIL GÜNCELLENİR: Yeni bir migration şemayı değiştirdiğinde bu dosyayı da
 * güncelle. Proje Supabase CLI ile link'liyse (supabase link --project-ref …)
 * elle uğraşmak yerine üret:
 *
 *   npm run gen:types
 *
 * Bu dosya lib/supabase.ts'te createClient<Database>'e verilir — böylece tüm
 * .from()/.select()/.insert() çağrıları kolon adı ve tip düzeyinde denetlenir,
 * gömülü ilişki seçimleri (photos!entry_id gibi) Relationships üzerinden çözülür.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      // İstemciden ERİŞİLMEZ: RLS açık ve hiçbir policy yok, yalnızca
      // public.email_exists (security definer) yazıyor. Şemada var olduğu için
      // burada da duruyor — `supabase gen types` üretse aynısını üretirdi.
      email_lookup_throttle: {
        Row: {
          client_key: string;
          window_started_at: string;
          attempts: number;
        };
        Insert: {
          client_key: string;
          window_started_at?: string;
          attempts?: number;
        };
        Update: {
          client_key?: string;
          window_started_at?: string;
          attempts?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          name: string | null;
          unit_pref: string;
          created_at: string;
          avatar_path: string | null;
        };
        Insert: {
          id: string;
          name?: string | null;
          unit_pref?: string;
          created_at?: string;
          avatar_path?: string | null;
        };
        Update: {
          id?: string;
          name?: string | null;
          unit_pref?: string;
          created_at?: string;
          avatar_path?: string | null;
        };
        Relationships: [];
      };
      measurement_types: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          unit: string;
          target_direction: string;
          is_default: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          unit: string;
          target_direction?: string;
          is_default?: boolean;
          sort_order?: number;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          unit?: string;
          target_direction?: string;
          is_default?: boolean;
          sort_order?: number;
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
      entries: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          type: string;
          note: string | null;
          cover_photo_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          type?: string;
          note?: string | null;
          cover_photo_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          type?: string;
          note?: string | null;
          cover_photo_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entries_cover_photo_fk";
            columns: ["cover_photo_id"];
            isOneToOne: false;
            referencedRelation: "photos";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          id: string;
          entry_id: string;
          storage_path: string;
          thumb_path: string | null;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          storage_path: string;
          thumb_path?: string | null;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          storage_path?: string;
          thumb_path?: string | null;
          order_index?: number;
          created_at?: string;
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
      measurement_values: {
        Row: {
          id: string;
          entry_id: string;
          measurement_type_id: string;
          value: number;
        };
        Insert: {
          id?: string;
          entry_id: string;
          measurement_type_id: string;
          value: number;
        };
        Update: {
          id?: string;
          entry_id?: string;
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
          user_id: string;
          past_memory_enabled: boolean;
          streak_enabled: boolean;
          daily_reminder_enabled: boolean;
          reminder_time: string;
          quiet_start: string;
          quiet_end: string;
        };
        Insert: {
          user_id: string;
          past_memory_enabled?: boolean;
          streak_enabled?: boolean;
          daily_reminder_enabled?: boolean;
          reminder_time?: string;
          quiet_start?: string;
          quiet_end?: string;
        };
        Update: {
          user_id?: string;
          past_memory_enabled?: boolean;
          streak_enabled?: boolean;
          daily_reminder_enabled?: boolean;
          reminder_time?: string;
          quiet_start?: string;
          quiet_end?: string;
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
      workout_items: {
        Row: {
          id: string;
          entry_id: string;
          name: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          name: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          name?: string;
          order_index?: number;
          created_at?: string;
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
          id: string;
          workout_item_id: string;
          reps: number | null;
          weight: number | null;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_item_id: string;
          reps?: number | null;
          weight?: number | null;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_item_id?: string;
          reps?: number | null;
          weight?: number | null;
          order_index?: number;
          created_at?: string;
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
    Views: Record<string, never>;
    Functions: {
      delete_own_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      email_exists: {
        Args: { check_email: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
