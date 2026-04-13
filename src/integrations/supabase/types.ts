export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      booking_emails: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          type: Database["public"]["Enums"]["booking_email_type"]
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          type: Database["public"]["Enums"]["booking_email_type"]
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          type?: Database["public"]["Enums"]["booking_email_type"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_emails_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          created_at: string
          email: string
          google_event_id: string | null
          id: string
          lead_id: string | null
          meet_link: string | null
          name: string
          notes: string | null
          offer_id: string
          owner_id: string
          phone: string | null
          status: Database["public"]["Enums"]["booking_status"]
          time_slot: string
        }
        Insert: {
          booking_date: string
          created_at?: string
          email: string
          google_event_id?: string | null
          id?: string
          lead_id?: string | null
          meet_link?: string | null
          name: string
          notes?: string | null
          offer_id: string
          owner_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          time_slot: string
        }
        Update: {
          booking_date?: string
          created_at?: string
          email?: string
          google_event_id?: string | null
          id?: string
          lead_id?: string | null
          meet_link?: string | null
          name?: string
          notes?: string | null
          offer_id?: string
          owner_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activities: {
        Row: {
          action: string
          client_id: string
          created_at: string
          description: string | null
          id: string
          owner_id: string
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_responses: {
        Row: {
          client_id: string
          completed: boolean
          created_at: string
          form_type: Database["public"]["Enums"]["onboarding_form_type"]
          id: string
          responses: Json
          token: string
          updated_at: string
        }
        Insert: {
          client_id: string
          completed?: boolean
          created_at?: string
          form_type: Database["public"]["Enums"]["onboarding_form_type"]
          id?: string
          responses?: Json
          token?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed?: boolean
          created_at?: string
          form_type?: Database["public"]["Enums"]["onboarding_form_type"]
          id?: string
          responses?: Json
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_responses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_resources: {
        Row: {
          category: string | null
          client_id: string
          created_at: string
          id: string
          name: string
          owner_id: string
          resource_type: string
          storage_path: string | null
          url: string | null
        }
        Insert: {
          category?: string | null
          client_id: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          resource_type?: string
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          category?: string | null
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          resource_type?: string
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_resources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_info: Json | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          objectives: Json | null
          offer_id: string | null
          owner_id: string
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          technical_accesses: Json | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          billing_info?: Json | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          objectives?: Json | null
          offer_id?: string | null
          owner_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          technical_accesses?: Json | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          billing_info?: Json | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          objectives?: Json | null
          offer_id?: string | null
          owner_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          technical_accesses?: Json | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          client_id: string
          contract_data: Json
          created_at: string
          expires_at: string
          id: string
          owner_id: string
          signature_image: string | null
          signed_at: string | null
          signed_pdf_path: string | null
          signer_ip: string | null
          signer_user_agent: string | null
          status: string
          token: string
        }
        Insert: {
          client_id: string
          contract_data?: Json
          created_at?: string
          expires_at?: string
          id?: string
          owner_id?: string
          signature_image?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          status?: string
          token?: string
        }
        Update: {
          client_id?: string
          contract_data?: Json
          created_at?: string
          expires_at?: string
          id?: string
          owner_id?: string
          signature_image?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      generated_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          lead_id: string
          owner_id: string
          type: Database["public"]["Enums"]["message_type"]
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lead_id: string
          owner_id?: string
          type?: Database["public"]["Enums"]["message_type"]
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          owner_id?: string
          type?: Database["public"]["Enums"]["message_type"]
        }
        Relationships: [
          {
            foreignKeyName: "generated_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      google_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at: string
          description: string
          id: string
          lead_id: string
          lead_response: string | null
          owner_id: string
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          description: string
          id?: string
          lead_id: string
          lead_response?: string | null
          owner_id?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          description?: string
          id?: string
          lead_id?: string
          lead_response?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ai_summary: string | null
          company_name: string | null
          created_at: string
          email: string | null
          first_contacted_at: string | null
          id: string
          last_contacted_at: string | null
          lost_reason: string | null
          message: string | null
          name: string
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          offer_id: string | null
          owner_id: string
          phone: string | null
          sales_angle: string | null
          score: Database["public"]["Enums"]["lead_score"]
          show_status: Database["public"]["Enums"]["show_status"]
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_contacted_at?: string | null
          id?: string
          last_contacted_at?: string | null
          lost_reason?: string | null
          message?: string | null
          name: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          offer_id?: string | null
          owner_id?: string
          phone?: string | null
          sales_angle?: string | null
          score?: Database["public"]["Enums"]["lead_score"]
          show_status?: Database["public"]["Enums"]["show_status"]
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_contacted_at?: string | null
          id?: string
          last_contacted_at?: string | null
          lost_reason?: string | null
          message?: string | null
          name?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          offer_id?: string | null
          owner_id?: string
          phone?: string | null
          sales_angle?: string | null
          score?: Database["public"]["Enums"]["lead_score"]
          show_status?: Database["public"]["Enums"]["show_status"]
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_pages: {
        Row: {
          body_content: Json | null
          created_at: string
          cta_color: string | null
          cta_text: string | null
          headline: string | null
          id: string
          offer_id: string
          sections: Json | null
          subheadline: string | null
          testimonials: Json | null
          updated_at: string
        }
        Insert: {
          body_content?: Json | null
          created_at?: string
          cta_color?: string | null
          cta_text?: string | null
          headline?: string | null
          id?: string
          offer_id: string
          sections?: Json | null
          subheadline?: string | null
          testimonials?: Json | null
          updated_at?: string
        }
        Update: {
          body_content?: Json | null
          created_at?: string
          cta_color?: string | null
          cta_text?: string | null
          headline?: string | null
          id?: string
          offer_id?: string
          sections?: Json | null
          subheadline?: string | null
          testimonials?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_pages_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          features: Json | null
          id: string
          is_active: boolean
          name: string
          niche: string | null
          owner_id: string
          price: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          name: string
          niche?: string | null
          owner_id?: string
          price?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          niche?: string | null
          owner_id?: string
          price?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          device_info: string | null
          endpoint: string
          id: string
          keys_auth: string
          keys_p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          endpoint: string
          id?: string
          keys_auth: string
          keys_p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          endpoint?: string
          id?: string
          keys_auth?: string
          keys_p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          action: string
          created_at: string
          done: boolean
          due_date: string
          id: string
          lead_id: string
          owner_id: string
        }
        Insert: {
          action: string
          created_at?: string
          done?: boolean
          due_date: string
          id?: string
          lead_id: string
          owner_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          done?: boolean
          due_date?: string
          id?: string
          lead_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_scripts: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          objections: Json | null
          owner_id: string
          script: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          objections?: Json | null
          owner_id?: string
          script: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          objections?: Json | null
          owner_id?: string
          script?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_scripts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      activity_type:
        | "call"
        | "whatsapp"
        | "email"
        | "note"
        | "relance"
        | "meeting"
      booking_email_type:
        | "confirmation"
        | "24h_before"
        | "12h_before"
        | "1h_before"
      booking_status: "pending" | "confirmed" | "cancelled" | "completed"
      client_status:
        | "nouveau"
        | "signe"
        | "onboarding_envoye"
        | "onboarding_complete"
        | "en_preparation"
        | "en_cours"
        | "actif"
      lead_score: "hot" | "warm" | "cold"
      lead_source:
        | "facebook"
        | "website"
        | "google_sheets"
        | "manual"
        | "other"
        | "organic_social"
        | "recommendation"
        | "google_my_business"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "won"
        | "lost"
        | "ghost"
      message_type: "whatsapp" | "email" | "sms"
      onboarding_form_type: "website" | "ads"
      show_status: "pending" | "show" | "noshow"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "call",
        "whatsapp",
        "email",
        "note",
        "relance",
        "meeting",
      ],
      booking_email_type: [
        "confirmation",
        "24h_before",
        "12h_before",
        "1h_before",
      ],
      booking_status: ["pending", "confirmed", "cancelled", "completed"],
      client_status: [
        "nouveau",
        "signe",
        "onboarding_envoye",
        "onboarding_complete",
        "en_preparation",
        "en_cours",
        "actif",
      ],
      lead_score: ["hot", "warm", "cold"],
      lead_source: [
        "facebook",
        "website",
        "google_sheets",
        "manual",
        "other",
        "organic_social",
        "recommendation",
        "google_my_business",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "proposal",
        "won",
        "lost",
        "ghost",
      ],
      message_type: ["whatsapp", "email", "sms"],
      onboarding_form_type: ["website", "ads"],
      show_status: ["pending", "show", "noshow"],
    },
  },
} as const
