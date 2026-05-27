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
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          snapshot: Json
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          snapshot: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          snapshot?: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      availability_blackouts: {
        Row: {
          blackout_date: string
          created_at: string
          id: string
          owner_id: string
          reason: string
        }
        Insert: {
          blackout_date: string
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string
        }
        Update: {
          blackout_date?: string
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string
        }
        Relationships: []
      }
      availability_settings: {
        Row: {
          afternoon_slot: string
          created_at: string
          day_end_time: string
          day_start_time: string
          max_future_days: number
          min_lead_time_hours: number
          morning_slot: string
          owner_id: string
          slot_duration_minutes: number
          timezone: string
          updated_at: string
          working_days: number[]
        }
        Insert: {
          afternoon_slot?: string
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          max_future_days?: number
          min_lead_time_hours?: number
          morning_slot?: string
          owner_id?: string
          slot_duration_minutes?: number
          timezone?: string
          updated_at?: string
          working_days?: number[]
        }
        Update: {
          afternoon_slot?: string
          created_at?: string
          day_end_time?: string
          day_start_time?: string
          max_future_days?: number
          min_lead_time_hours?: number
          morning_slot?: string
          owner_id?: string
          slot_duration_minutes?: number
          timezone?: string
          updated_at?: string
          working_days?: number[]
        }
        Relationships: []
      }
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
      booking_wa_reminders: {
        Row: {
          booking_id: string
          created_at: string
          error_message: string | null
          id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          type: Database["public"]["Enums"]["booking_email_type"]
        }
        Insert: {
          booking_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          type: Database["public"]["Enums"]["booking_email_type"]
        }
        Update: {
          booking_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          type?: Database["public"]["Enums"]["booking_email_type"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_wa_reminders_booking_id_fkey"
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
          client_timezone: string | null
          created_at: string
          created_from: string | null
          deleted_at: string | null
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
          workspace_id: string | null
        }
        Insert: {
          booking_date: string
          client_timezone?: string | null
          created_at?: string
          created_from?: string | null
          deleted_at?: string | null
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
          workspace_id?: string | null
        }
        Update: {
          booking_date?: string
          client_timezone?: string | null
          created_at?: string
          created_from?: string | null
          deleted_at?: string | null
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
          workspace_id?: string | null
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
          {
            foreignKeyName: "bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_resources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_resources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_info: Json | null
          company_name: string | null
          created_at: string
          deleted_at: string | null
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
          workspace_id: string | null
        }
        Insert: {
          billing_info?: Json | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
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
          workspace_id?: string | null
        }
        Update: {
          billing_info?: Json | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          client_id: string
          contract_data: Json
          created_at: string
          deleted_at: string | null
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
          workspace_id: string | null
        }
        Insert: {
          client_id: string
          contract_data?: Json
          created_at?: string
          deleted_at?: string | null
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
          workspace_id?: string | null
        }
        Update: {
          client_id?: string
          contract_data?: Json
          created_at?: string
          deleted_at?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_label_assignments: {
        Row: {
          created_at: string
          label_id: string
          lead_id: string
          owner_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          label_id: string
          lead_id: string
          owner_id?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          label_id?: string
          lead_id?: string
          owner_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "conversation_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
          sort_order: number
          workspace_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          sort_order?: number
          workspace_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          sort_order?: number
          workspace_id?: string | null
        }
        Relationships: []
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
      followup_automation_settings: {
        Row: {
          ai_examples: string
          ai_instructions: string
          ai_model: string
          allow_repeated_greeting: boolean
          allow_signature: boolean
          anti_repetition: boolean
          auto_stop_on_not_interested: boolean
          call_escalation_min_followups: number
          call_escalation_required_score: string
          created_at: string
          dry_run: boolean
          enable_24h_template_switch: boolean
          enable_ab_test: boolean
          enable_call_escalation: boolean
          followup_1_delay_hours: number
          followup_2_delay_hours: number
          forbidden_words: string[]
          history_scan_count: number
          id: string
          inactivity_threshold_hours: number
          initial_delay_minutes: number
          interest_threshold_closing: number
          is_enabled: boolean
          last_followup_delay_hours: number
          max_emojis: number
          max_questions: number
          max_sentences: number
          never_reask_fields: string[]
          niche_strict: boolean
          owner_id: string
          prompt_closing: string
          prompt_objection: string
          prompt_qualification: string
          prompt_reactivation: string
          prompt_slot_confirmation: string
          propose_meeting_dedup_minutes: number
          qualify_model: string
          qualify_system_prompt: string
          slot_confirmation_dedup_minutes: number
          suggest_replies_model: string
          suggest_replies_system_prompt: string
          template_followup_1_id: string | null
          template_followup_2_id: string | null
          template_initial_id: string | null
          template_last_followup_id: string | null
          template_reactivation_id: string | null
          trigger_only_new_status: boolean
          trigger_sources: Database["public"]["Enums"]["lead_source"][]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ai_examples?: string
          ai_instructions?: string
          ai_model?: string
          allow_repeated_greeting?: boolean
          allow_signature?: boolean
          anti_repetition?: boolean
          auto_stop_on_not_interested?: boolean
          call_escalation_min_followups?: number
          call_escalation_required_score?: string
          created_at?: string
          dry_run?: boolean
          enable_24h_template_switch?: boolean
          enable_ab_test?: boolean
          enable_call_escalation?: boolean
          followup_1_delay_hours?: number
          followup_2_delay_hours?: number
          forbidden_words?: string[]
          history_scan_count?: number
          id?: string
          inactivity_threshold_hours?: number
          initial_delay_minutes?: number
          interest_threshold_closing?: number
          is_enabled?: boolean
          last_followup_delay_hours?: number
          max_emojis?: number
          max_questions?: number
          max_sentences?: number
          never_reask_fields?: string[]
          niche_strict?: boolean
          owner_id?: string
          prompt_closing?: string
          prompt_objection?: string
          prompt_qualification?: string
          prompt_reactivation?: string
          prompt_slot_confirmation?: string
          propose_meeting_dedup_minutes?: number
          qualify_model?: string
          qualify_system_prompt?: string
          slot_confirmation_dedup_minutes?: number
          suggest_replies_model?: string
          suggest_replies_system_prompt?: string
          template_followup_1_id?: string | null
          template_followup_2_id?: string | null
          template_initial_id?: string | null
          template_last_followup_id?: string | null
          template_reactivation_id?: string | null
          trigger_only_new_status?: boolean
          trigger_sources?: Database["public"]["Enums"]["lead_source"][]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ai_examples?: string
          ai_instructions?: string
          ai_model?: string
          allow_repeated_greeting?: boolean
          allow_signature?: boolean
          anti_repetition?: boolean
          auto_stop_on_not_interested?: boolean
          call_escalation_min_followups?: number
          call_escalation_required_score?: string
          created_at?: string
          dry_run?: boolean
          enable_24h_template_switch?: boolean
          enable_ab_test?: boolean
          enable_call_escalation?: boolean
          followup_1_delay_hours?: number
          followup_2_delay_hours?: number
          forbidden_words?: string[]
          history_scan_count?: number
          id?: string
          inactivity_threshold_hours?: number
          initial_delay_minutes?: number
          interest_threshold_closing?: number
          is_enabled?: boolean
          last_followup_delay_hours?: number
          max_emojis?: number
          max_questions?: number
          max_sentences?: number
          never_reask_fields?: string[]
          niche_strict?: boolean
          owner_id?: string
          prompt_closing?: string
          prompt_objection?: string
          prompt_qualification?: string
          prompt_reactivation?: string
          prompt_slot_confirmation?: string
          propose_meeting_dedup_minutes?: number
          qualify_model?: string
          qualify_system_prompt?: string
          slot_confirmation_dedup_minutes?: number
          suggest_replies_model?: string
          suggest_replies_system_prompt?: string
          template_followup_1_id?: string | null
          template_followup_2_id?: string | null
          template_initial_id?: string | null
          template_last_followup_id?: string | null
          template_reactivation_id?: string | null
          trigger_only_new_status?: boolean
          trigger_sources?: Database["public"]["Enums"]["lead_source"][]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_automation_settings_template_followup_1_id_fkey"
            columns: ["template_followup_1_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_automation_settings_template_followup_2_id_fkey"
            columns: ["template_followup_2_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_automation_settings_template_initial_id_fkey"
            columns: ["template_initial_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_automation_settings_template_last_followup_id_fkey"
            columns: ["template_last_followup_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_automation_settings_template_reactivation_id_fkey"
            columns: ["template_reactivation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_automation_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_scripts: {
        Row: {
          content: string
          created_at: string
          id: string
          is_enabled: boolean
          owner_id: string
          phase: Database["public"]["Enums"]["followup_script_phase"]
          sort_order: number
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          owner_id?: string
          phase?: Database["public"]["Enums"]["followup_script_phase"]
          sort_order?: number
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          owner_id?: string
          phase?: Database["public"]["Enums"]["followup_script_phase"]
          sort_order?: number
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_scripts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_sequence_steps: {
        Row: {
          created_at: string
          delay_unit: string
          delay_value: number
          id: string
          is_enabled: boolean
          label: string
          offer_id: string | null
          owner_id: string
          step_order: number
          task_type: Database["public"]["Enums"]["followup_task_type"]
          template_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          delay_unit?: string
          delay_value?: number
          id?: string
          is_enabled?: boolean
          label?: string
          offer_id?: string | null
          owner_id?: string
          step_order: number
          task_type?: Database["public"]["Enums"]["followup_task_type"]
          template_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          delay_unit?: string
          delay_value?: number
          id?: string
          is_enabled?: boolean
          label?: string
          offer_id?: string | null
          owner_id?: string
          step_order?: number
          task_type?: Database["public"]["Enums"]["followup_task_type"]
          template_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_sequence_steps_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          lead_id: string
          owner_id: string
          type: Database["public"]["Enums"]["message_type"]
          workspace_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lead_id: string
          owner_id?: string
          type?: Database["public"]["Enums"]["message_type"]
          workspace_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          owner_id?: string
          type?: Database["public"]["Enums"]["message_type"]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          token: string
          used_at: string | null
          used_by: string | null
          workspace_id: string | null
          workspace_role: Database["public"]["Enums"]["workspace_role"]
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
          workspace_id?: string | null
          workspace_role?: Database["public"]["Enums"]["workspace_role"]
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
          workspace_id?: string | null
          workspace_role?: Database["public"]["Enums"]["workspace_role"]
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          deleted_at: string | null
          due_date: string | null
          id: string
          invoice_data: Json
          invoice_number: string
          issue_date: string
          owner_id: string
          paid_at: string | null
          sent_at: string | null
          status: string
          token: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_data?: Json
          invoice_number: string
          issue_date?: string
          owner_id?: string
          paid_at?: string | null
          sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_data?: Json
          invoice_number?: string
          issue_date?: string
          owner_id?: string
          paid_at?: string | null
          sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          description: string
          id?: string
          lead_id: string
          lead_response?: string | null
          owner_id?: string
          workspace_id?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          description?: string
          id?: string
          lead_id?: string
          lead_response?: string | null
          owner_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_conversation_state: {
        Row: {
          automation_paused_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          lead_id: string
          owner_id: string
          resolved_at: string | null
          snoozed_until: string | null
          state: Database["public"]["Enums"]["conversation_state"]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          automation_paused_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lead_id: string
          owner_id?: string
          resolved_at?: string | null
          snoozed_until?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          automation_paused_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lead_id?: string
          owner_id?: string
          resolved_at?: string | null
          snoozed_until?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_conversation_state_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_conversation_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_followup_tasks: {
        Row: {
          ai_generated: boolean
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          lead_id: string
          message_content: string | null
          message_variant: string | null
          owner_id: string
          scheduled_at: string
          status: Database["public"]["Enums"]["followup_task_status"]
          step_order: number
          task_type: Database["public"]["Enums"]["followup_task_type"]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          lead_id: string
          message_content?: string | null
          message_variant?: string | null
          owner_id?: string
          scheduled_at: string
          status?: Database["public"]["Enums"]["followup_task_status"]
          step_order?: number
          task_type: Database["public"]["Enums"]["followup_task_type"]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string
          message_content?: string | null
          message_variant?: string | null
          owner_id?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["followup_task_status"]
          step_order?: number
          task_type?: Database["public"]["Enums"]["followup_task_type"]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_followup_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_followup_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification: {
        Row: {
          budget_signal: string | null
          created_at: string
          decision_maker: string | null
          intent: string | null
          interest_level: number
          last_qualified_at: string | null
          lead_id: string
          objections: Json
          owner_id: string
          pain_point: string | null
          summary: string | null
          updated_at: string
          urgency: string | null
          workspace_id: string | null
        }
        Insert: {
          budget_signal?: string | null
          created_at?: string
          decision_maker?: string | null
          intent?: string | null
          interest_level?: number
          last_qualified_at?: string | null
          lead_id: string
          objections?: Json
          owner_id?: string
          pain_point?: string | null
          summary?: string | null
          updated_at?: string
          urgency?: string | null
          workspace_id?: string | null
        }
        Update: {
          budget_signal?: string | null
          created_at?: string
          decision_maker?: string | null
          intent?: string | null
          interest_level?: number
          last_qualified_at?: string | null
          lead_id?: string
          objections?: Json
          owner_id?: string
          pain_point?: string | null
          summary?: string | null
          updated_at?: string
          urgency?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_qualification_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ai_summary: string | null
          company_name: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_contacted_at: string | null
          id: string
          last_contacted_at: string | null
          lost_reason: string | null
          message: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_form_id: string | null
          meta_page_id: string | null
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
          whatsapp_engagement_score: number
          workspace_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_contacted_at?: string | null
          id?: string
          last_contacted_at?: string | null
          lost_reason?: string | null
          message?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_page_id?: string | null
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
          whatsapp_engagement_score?: number
          workspace_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_contacted_at?: string | null
          id?: string
          last_contacted_at?: string | null
          lost_reason?: string | null
          message?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_page_id?: string | null
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
          whatsapp_engagement_score?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaign_insights_cache: {
        Row: {
          campaign_id: string
          clicks: number
          created_at: string
          currency: string | null
          date_from: string
          date_to: string
          fetched_at: string
          id: string
          impressions: number
          leads_meta: number
          owner_id: string
          spend: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          campaign_id: string
          clicks?: number
          created_at?: string
          currency?: string | null
          date_from: string
          date_to: string
          fetched_at?: string
          id?: string
          impressions?: number
          leads_meta?: number
          owner_id?: string
          spend?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          campaign_id?: string
          clicks?: number
          created_at?: string
          currency?: string | null
          date_from?: string
          date_to?: string
          fetched_at?: string
          id?: string
          impressions?: number
          leads_meta?: number
          owner_id?: string
          spend?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      meta_campaigns_cache: {
        Row: {
          ad_account_id: string | null
          campaign_id: string
          campaign_name: string
          created_at: string
          daily_budget: number | null
          effective_status: string | null
          fetched_at: string
          id: string
          lifetime_budget: number | null
          objective: string | null
          owner_id: string
          page_id: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          campaign_id: string
          campaign_name?: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          fetched_at?: string
          id?: string
          lifetime_budget?: number | null
          objective?: string | null
          owner_id?: string
          page_id: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          campaign_id?: string
          campaign_name?: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          fetched_at?: string
          id?: string
          lifetime_budget?: number | null
          objective?: string | null
          owner_id?: string
          page_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      meta_capi_configs: {
        Row: {
          access_token: string
          created_at: string
          dataset_id: string
          enabled: boolean
          id: string
          send_booking: boolean
          send_qualified: boolean
          send_won: boolean
          test_event_code: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          dataset_id: string
          enabled?: boolean
          id?: string
          send_booking?: boolean
          send_qualified?: boolean
          send_won?: boolean
          test_event_code?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          dataset_id?: string
          enabled?: boolean
          id?: string
          send_booking?: boolean
          send_qualified?: boolean
          send_won?: boolean
          test_event_code?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_channel_identities: {
        Row: {
          created_at: string
          id: string
          instagram_access_token: string | null
          instagram_business_account_id: string | null
          instagram_username: string | null
          is_subscribed_instagram: boolean
          is_subscribed_messages: boolean
          owner_id: string
          page_access_token: string
          page_id: string
          page_name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instagram_access_token?: string | null
          instagram_business_account_id?: string | null
          instagram_username?: string | null
          is_subscribed_instagram?: boolean
          is_subscribed_messages?: boolean
          owner_id?: string
          page_access_token?: string
          page_id: string
          page_name?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instagram_access_token?: string | null
          instagram_business_account_id?: string | null
          instagram_username?: string | null
          is_subscribed_instagram?: boolean
          is_subscribed_messages?: boolean
          owner_id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      meta_form_offer_mapping: {
        Row: {
          created_at: string
          form_id: string
          form_name: string
          id: string
          offer_id: string
          owner_id: string
          page_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          form_id: string
          form_name?: string
          id?: string
          offer_id: string
          owner_id?: string
          page_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          form_id?: string
          form_name?: string
          id?: string
          offer_id?: string
          owner_id?: string
          page_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      meta_ignored_forms: {
        Row: {
          created_at: string
          form_id: string
          form_name: string | null
          id: string
          owner_id: string
          page_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          form_id: string
          form_name?: string | null
          id?: string
          owner_id: string
          page_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          form_id?: string
          form_name?: string | null
          id?: string
          owner_id?: string
          page_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ignored_forms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_oauth_pending: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          owner_id: string
          pages: Json
          user_token: string
          wa_numbers: Json
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          owner_id: string
          pages?: Json
          user_token: string
          wa_numbers?: Json
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          owner_id?: string
          pages?: Json
          user_token?: string
          wa_numbers?: Json
          workspace_id?: string | null
        }
        Relationships: []
      }
      meta_pages: {
        Row: {
          created_at: string
          forms: Json
          id: string
          is_active: boolean
          last_token_notified_at: string | null
          owner_id: string
          page_access_token: string
          page_id: string
          page_name: string
          subscribed: boolean
          token_invalidated_at: string | null
          token_valid: boolean
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          forms?: Json
          id?: string
          is_active?: boolean
          last_token_notified_at?: string | null
          owner_id?: string
          page_access_token: string
          page_id: string
          page_name?: string
          subscribed?: boolean
          token_invalidated_at?: string | null
          token_valid?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          forms?: Json
          id?: string
          is_active?: boolean
          last_token_notified_at?: string | null
          owner_id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string
          subscribed?: boolean
          token_invalidated_at?: string | null
          token_valid?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_ai_chats: {
        Row: {
          content: string
          created_at: string
          id: string
          offer_id: string
          owner_id: string
          role: string
          snapshot: Json | null
          workspace_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          offer_id: string
          owner_id?: string
          role: string
          snapshot?: Json | null
          workspace_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          offer_id?: string
          owner_id?: string
          role?: string
          snapshot?: Json | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_ai_chats_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_ai_chats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_booking_email_templates: {
        Row: {
          body_html: string
          created_at: string
          enabled: boolean
          id: string
          offer_id: string
          owner_id: string
          subject: string
          type: Database["public"]["Enums"]["booking_email_type"]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          body_html?: string
          created_at?: string
          enabled?: boolean
          id?: string
          offer_id: string
          owner_id?: string
          subject?: string
          type: Database["public"]["Enums"]["booking_email_type"]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string
          enabled?: boolean
          id?: string
          offer_id?: string
          owner_id?: string
          subject?: string
          type?: Database["public"]["Enums"]["booking_email_type"]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_booking_email_templates_offer_id_fkey"
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
          deleted_at: string | null
          description: string | null
          features: Json | null
          hero_image_url: string | null
          id: string
          is_active: boolean
          name: string
          niche: string | null
          owner_id: string
          price: string | null
          show_price: boolean
          slug: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          niche?: string | null
          owner_id?: string
          price?: string | null
          show_price?: boolean
          slug: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          niche?: string | null
          owner_id?: string
          price?: string | null
          show_price?: boolean
          slug?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_profiles: {
        Row: {
          address: string | null
          brand_color: string | null
          company_name: string
          created_at: string
          email: string | null
          email_sender_name: string | null
          email_signature: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          notification_preferences: Json
          onboarding_completed: boolean
          phone: string | null
          signature_url: string | null
          siret: string | null
          slug: string | null
          updated_at: string
          user_id: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          email_sender_name?: string | null
          email_signature?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          notification_preferences?: Json
          onboarding_completed?: boolean
          phone?: string | null
          signature_url?: string | null
          siret?: string | null
          slug?: string | null
          updated_at?: string
          user_id: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          email_sender_name?: string | null
          email_signature?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          notification_preferences?: Json
          onboarding_completed?: boolean
          phone?: string | null
          signature_url?: string | null
          siret?: string | null
          slug?: string | null
          updated_at?: string
          user_id?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      push_delivery_logs: {
        Row: {
          body_preview: string | null
          created_at: string
          device_label: string | null
          error_message: string | null
          id: string
          provider_status: number | null
          source: string
          status: string
          subscription_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          device_label?: string | null
          error_message?: string | null
          id?: string
          provider_status?: number | null
          source?: string
          status: string
          subscription_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          device_label?: string | null
          error_message?: string | null
          id?: string
          provider_status?: number | null
          source?: string
          status?: string
          subscription_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          browser: string | null
          created_at: string
          device_id: string | null
          device_info: string | null
          device_label: string | null
          endpoint: string
          id: string
          is_standalone: boolean | null
          keys_auth: string
          keys_p256dh: string
          last_error: string | null
          last_failure_at: string | null
          last_seen_at: string | null
          last_success_at: string | null
          platform: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_id?: string | null
          device_info?: string | null
          device_label?: string | null
          endpoint: string
          id?: string
          is_standalone?: boolean | null
          keys_auth: string
          keys_p256dh: string
          last_error?: string | null
          last_failure_at?: string | null
          last_seen_at?: string | null
          last_success_at?: string | null
          platform?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_id?: string | null
          device_info?: string | null
          device_label?: string | null
          endpoint?: string
          id?: string
          is_standalone?: boolean | null
          keys_auth?: string
          keys_p256dh?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_seen_at?: string | null
          last_success_at?: string | null
          platform?: string | null
          status?: string
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
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          done?: boolean
          due_date: string
          id?: string
          lead_id: string
          owner_id?: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          done?: boolean
          due_date?: string
          id?: string
          lead_id?: string
          owner_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          objections?: Json | null
          owner_id?: string
          script: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          objections?: Json | null
          owner_id?: string
          script?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_scripts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_scripts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_calls: {
        Row: {
          answered_at: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          lead_id: string
          notes: string | null
          owner_id: string
          recording_path: string | null
          started_at: string
          status: string
          updated_at: string
          wa_call_id: string | null
          workspace_id: string | null
        }
        Insert: {
          answered_at?: string | null
          created_at?: string
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          owner_id?: string
          recording_path?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          wa_call_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          answered_at?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          owner_id?: string
          recording_path?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          wa_call_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_calls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          access_token: string
          business_account_id: string
          created_at: string
          display_phone_number: string | null
          id: string
          is_active: boolean
          last_test_status: string | null
          last_tested_at: string | null
          owner_id: string
          phone_number_id: string
          updated_at: string
          verified_name: string | null
          verify_token: string
          webhook_subscribed: boolean
          workspace_id: string
        }
        Insert: {
          access_token: string
          business_account_id: string
          created_at?: string
          display_phone_number?: string | null
          id?: string
          is_active?: boolean
          last_test_status?: string | null
          last_tested_at?: string | null
          owner_id?: string
          phone_number_id: string
          updated_at?: string
          verified_name?: string | null
          verify_token?: string
          webhook_subscribed?: boolean
          workspace_id: string
        }
        Update: {
          access_token?: string
          business_account_id?: string
          created_at?: string
          display_phone_number?: string | null
          id?: string
          is_active?: boolean
          last_test_status?: string | null
          last_tested_at?: string | null
          owner_id?: string
          phone_number_id?: string
          updated_at?: string
          verified_name?: string | null
          verify_token?: string
          webhook_subscribed?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"]
          content: string
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["wa_direction"]
          duration_seconds: number | null
          error_message: string | null
          external_thread_id: string | null
          id: string
          intent: string | null
          is_pinned: boolean
          lead_id: string
          media_filename: string | null
          media_size_bytes: number | null
          media_storage_path: string | null
          media_thumbnail_path: string | null
          media_type: string | null
          media_url: string | null
          message_type: string
          metadata: Json
          owner_id: string
          reactions: Json
          read_at: string | null
          reply_to_snapshot: Json | null
          reply_to_wa_id: string | null
          sent_at: string
          status: string
          summary_oneline: string | null
          task_id: string | null
          transcript: string | null
          wa_message_id: string | null
          workspace_id: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["message_channel"]
          content: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["wa_direction"]
          duration_seconds?: number | null
          error_message?: string | null
          external_thread_id?: string | null
          id?: string
          intent?: string | null
          is_pinned?: boolean
          lead_id: string
          media_filename?: string | null
          media_size_bytes?: number | null
          media_storage_path?: string | null
          media_thumbnail_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          owner_id?: string
          reactions?: Json
          read_at?: string | null
          reply_to_snapshot?: Json | null
          reply_to_wa_id?: string | null
          sent_at?: string
          status?: string
          summary_oneline?: string | null
          task_id?: string | null
          transcript?: string | null
          wa_message_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"]
          content?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["wa_direction"]
          duration_seconds?: number | null
          error_message?: string | null
          external_thread_id?: string | null
          id?: string
          intent?: string | null
          is_pinned?: boolean
          lead_id?: string
          media_filename?: string | null
          media_size_bytes?: number | null
          media_storage_path?: string | null
          media_thumbnail_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          owner_id?: string
          reactions?: Json
          read_at?: string | null
          reply_to_snapshot?: Json | null
          reply_to_wa_id?: string | null
          sent_at?: string
          status?: string
          summary_oneline?: string | null
          task_id?: string | null
          transcript?: string | null
          wa_message_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "lead_followup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body_text: string
          business_account_id: string | null
          category: string
          created_at: string
          id: string
          is_synced: boolean
          language: string
          meta_template_id: string | null
          name: string
          owner_id: string
          status: string
          updated_at: string
          variables_count: number
          workspace_id: string | null
        }
        Insert: {
          body_text?: string
          business_account_id?: string | null
          category?: string
          created_at?: string
          id?: string
          is_synced?: boolean
          language?: string
          meta_template_id?: string | null
          name: string
          owner_id?: string
          status?: string
          updated_at?: string
          variables_count?: number
          workspace_id?: string | null
        }
        Update: {
          body_text?: string
          business_account_id?: string | null
          category?: string
          created_at?: string
          id?: string
          is_synced?: boolean
          language?: string
          meta_template_id?: string | null
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
          variables_count?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_booking_email_templates: {
        Row: {
          body_html: string
          created_at: string
          enabled: boolean
          id: string
          owner_id: string
          subject: string
          type: Database["public"]["Enums"]["booking_email_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body_html?: string
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id?: string
          subject?: string
          type: Database["public"]["Enums"]["booking_email_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body_html?: string
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id?: string
          subject?: string
          type?: Database["public"]["Enums"]["booking_email_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_booking_email_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_booking_wa_templates: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          language: string
          owner_id: string
          template_id: string | null
          type: Database["public"]["Enums"]["booking_email_type"]
          updated_at: string
          variables_map: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          owner_id?: string
          template_id?: string | null
          type: Database["public"]["Enums"]["booking_email_type"]
          updated_at?: string
          variables_map?: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          owner_id?: string
          template_id?: string | null
          type?: Database["public"]["Enums"]["booking_email_type"]
          updated_at?: string
          variables_map?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_booking_wa_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_booking_wa_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_features_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          address: string | null
          booking_admin_reminders_enabled: boolean
          brand_color: string | null
          company_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          email_sender_name: string | null
          email_signature: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          logo_url_dark: string | null
          logo_url_light: string | null
          notification_email: string | null
          onboarding_completed: boolean
          phone: string | null
          signature_url: string | null
          siret: string | null
          slug: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          booking_admin_reminders_enabled?: boolean
          brand_color?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_sender_name?: string | null
          email_signature?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          logo_url_light?: string | null
          notification_email?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          signature_url?: string | null
          siret?: string | null
          slug?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          booking_admin_reminders_enabled?: boolean
          brand_color?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_sender_name?: string | null
          email_signature?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          logo_url_light?: string | null
          notification_email?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          signature_url?: string | null
          siret?: string | null
          slug?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: boolean
      }
      consume_workspace_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_followup_cron_status: { Args: never; Returns: Json }
      get_invitation_by_token: { Args: { p_token: string }; Returns: Json }
      get_invoice_by_token: { Args: { p_token: string }; Returns: Json }
      get_lead_ai_status: { Args: { p_lead_id: string }; Returns: Json }
      get_offer_branding: { Args: { p_slug: string }; Returns: Json }
      get_onboarding_by_token: { Args: { p_token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      list_ai_monitor:
        | { Args: { p_limit?: number }; Returns: Json }
        | { Args: { p_limit?: number; p_workspace_id?: string }; Returns: Json }
      list_workspace_members: {
        Args: { _workspace_id: string }
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
        }[]
      }
      mark_overdue_invoices: { Args: never; Returns: undefined }
      merge_leads:
        | { Args: { p_source: string; p_target: string }; Returns: Json }
        | {
            Args: {
              p_field_overrides: Json
              p_source: string
              p_target: string
            }
            Returns: Json
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
      purge_soft_deleted_records: { Args: never; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      remove_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      restore_from_snapshot: { Args: { p_audit_id: string }; Returns: Json }
      save_onboarding_by_token: {
        Args: { p_completed?: boolean; p_responses: Json; p_token: string }
        Returns: undefined
      }
      search_wa_messages: {
        Args: { p_lead_id: string; p_query: string }
        Returns: {
          content: string
          direction: Database["public"]["Enums"]["wa_direction"]
          id: string
          rank: number
          sent_at: string
          transcript: string
        }[]
      }
      seed_default_followup_scripts: {
        Args: { p_owner: string; p_workspace: string }
        Returns: undefined
      }
      send_meta_capi_event: {
        Args: {
          p_booking_id?: string
          p_event_name: string
          p_lead_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      update_workspace_member_role: {
        Args: {
          _role: Database["public"]["Enums"]["workspace_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      user_workspace_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      activity_type:
        | "call"
        | "whatsapp"
        | "email"
        | "note"
        | "relance"
        | "meeting"
      app_role: "admin" | "user"
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
      conversation_state:
        | "NEW"
        | "CONTACTED"
        | "WAITING_REPLY"
        | "FOLLOWUP_1_SENT"
        | "FOLLOWUP_2_SENT"
        | "QUALIFIED"
        | "BOOKED"
        | "CLOSED"
      followup_script_phase:
        | "missed_appointment"
        | "no_response_3d"
        | "no_response_10d"
        | "final_attempt"
        | "post_offer"
        | "custom"
      followup_task_status:
        | "pending"
        | "scheduled"
        | "sent"
        | "cancelled"
        | "failed"
        | "skipped"
        | "processing"
      followup_task_type:
        | "initial_message"
        | "followup_1"
        | "followup_2"
        | "last_followup"
        | "qualification"
        | "propose_meeting"
        | "reactivation"
        | "manual_call"
        | "template_24h"
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
        | "whatsapp"
        | "messenger"
        | "instagram"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "won"
        | "lost"
        | "ghost"
      message_channel: "whatsapp" | "messenger" | "instagram"
      message_type: "whatsapp" | "email" | "sms"
      onboarding_form_type: "website" | "ads"
      show_status: "pending" | "show" | "noshow"
      wa_direction: "inbound" | "outbound"
      workspace_role: "owner" | "member"
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
      app_role: ["admin", "user"],
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
      conversation_state: [
        "NEW",
        "CONTACTED",
        "WAITING_REPLY",
        "FOLLOWUP_1_SENT",
        "FOLLOWUP_2_SENT",
        "QUALIFIED",
        "BOOKED",
        "CLOSED",
      ],
      followup_script_phase: [
        "missed_appointment",
        "no_response_3d",
        "no_response_10d",
        "final_attempt",
        "post_offer",
        "custom",
      ],
      followup_task_status: [
        "pending",
        "scheduled",
        "sent",
        "cancelled",
        "failed",
        "skipped",
        "processing",
      ],
      followup_task_type: [
        "initial_message",
        "followup_1",
        "followup_2",
        "last_followup",
        "qualification",
        "propose_meeting",
        "reactivation",
        "manual_call",
        "template_24h",
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
        "whatsapp",
        "messenger",
        "instagram",
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
      message_channel: ["whatsapp", "messenger", "instagram"],
      message_type: ["whatsapp", "email", "sms"],
      onboarding_form_type: ["website", "ads"],
      show_status: ["pending", "show", "noshow"],
      wa_direction: ["inbound", "outbound"],
      workspace_role: ["owner", "member"],
    },
  },
} as const
