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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_event: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          matter_id: string | null
          meta: Json
          summary: string
          tenant_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string | null
          meta?: Json
          summary: string
          tenant_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string | null
          meta?: Json
          summary?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_event_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_event_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      adverse_party: {
        Row: {
          created_at: string
          id: string
          matter_id: string | null
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          matter_id?: string | null
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          matter_id?: string | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adverse_party_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adverse_party_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      advocate: {
        Row: {
          bar_registration_number: string | null
          courts: string[]
          created_at: string
          id: string
          name: string
          state_code: string | null
          tenant_id: string
        }
        Insert: {
          bar_registration_number?: string | null
          courts?: string[]
          created_at?: string
          id?: string
          name: string
          state_code?: string | null
          tenant_id: string
        }
        Update: {
          bar_registration_number?: string | null
          courts?: string[]
          created_at?: string
          id?: string
          name?: string
          state_code?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advocate_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_event: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_event_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event: {
        Row: {
          created_at: string
          created_by: string | null
          event_date: string
          id: string
          kind: string
          matter_id: string | null
          notes: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_date: string
          id?: string
          kind?: string
          matter_id?: string | null
          notes?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_date?: string
          id?: string
          kind?: string
          matter_id?: string | null
          notes?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      cause_list_entry: {
        Row: {
          advocate_id: string
          cnr: string | null
          court: string | null
          created_at: string
          id: string
          item_no: string | null
          list_date: string
          matter_id: string | null
          raw: Json
          tenant_id: string
        }
        Insert: {
          advocate_id: string
          cnr?: string | null
          court?: string | null
          created_at?: string
          id?: string
          item_no?: string | null
          list_date: string
          matter_id?: string | null
          raw?: Json
          tenant_id: string
        }
        Update: {
          advocate_id?: string
          cnr?: string | null
          court?: string | null
          created_at?: string
          id?: string
          item_no?: string | null
          list_date?: string
          matter_id?: string | null
          raw?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cause_list_entry_advocate_id_fkey"
            columns: ["advocate_id"]
            isOneToOne: false
            referencedRelation: "advocate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cause_list_entry_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cause_list_entry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      client: {
        Row: {
          created_at: string
          custom: Json
          emails: string[]
          id: string
          name: string
          phones: string[]
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          custom?: Json
          emails?: string[]
          id?: string
          name: string
          phones?: string[]
          tenant_id: string
          type?: string
        }
        Update: {
          created_at?: string
          custom?: Json
          emails?: string[]
          id?: string
          name?: string
          phones?: string[]
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      court_cache: {
        Row: {
          cache_key: string
          fetched_at: string
          id: string
          kind: string
          normalized: Json | null
          provider: string
          raw: Json | null
        }
        Insert: {
          cache_key: string
          fetched_at?: string
          id?: string
          kind: string
          normalized?: Json | null
          provider: string
          raw?: Json | null
        }
        Update: {
          cache_key?: string
          fetched_at?: string
          id?: string
          kind?: string
          normalized?: Json | null
          provider?: string
          raw?: Json | null
        }
        Relationships: []
      }
      court_order: {
        Row: {
          created_at: string
          id: string
          matter_id: string
          order_date: string | null
          raw: Json | null
          tenant_id: string
          text_ref: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          matter_id: string
          order_date?: string | null
          raw?: Json | null
          tenant_id: string
          text_ref?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          matter_id?: string
          order_date?: string | null
          raw?: Json | null
          tenant_id?: string
          text_ref?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "court_order_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      court_provider_health: {
        Row: {
          last_error: string | null
          last_ok_at: string | null
          ok: boolean
          provider: string
          updated_at: string
        }
        Insert: {
          last_error?: string | null
          last_ok_at?: string | null
          ok?: boolean
          provider: string
          updated_at?: string
        }
        Update: {
          last_error?: string | null
          last_ok_at?: string | null
          ok?: boolean
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      court_refresh_request: {
        Row: {
          cnr: string
          created_at: string
          fulfilled_at: string | null
          id: string
          matter_id: string | null
          note: string | null
          pasted_payload: Json | null
          requested_by: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          cnr: string
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          matter_id?: string | null
          note?: string | null
          pasted_payload?: Json | null
          requested_by?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          cnr?: string
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          matter_id?: string | null
          note?: string | null
          pasted_payload?: Json | null
          requested_by?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_refresh_request_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_refresh_request_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      court_sync_job: {
        Row: {
          cnr: string
          created_at: string
          error: string | null
          id: string
          last_run_at: string | null
          next_run_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          cnr: string
          created_at?: string
          error?: string | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          cnr?: string
          created_at?: string
          error?: string | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_sync_job_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_def: {
        Row: {
          created_at: string
          entity: string
          field_type: string
          id: string
          key: string
          label: string
          options: Json
          practice_area_id: string | null
          sort: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          entity: string
          field_type?: string
          id?: string
          key: string
          label: string
          options?: Json
          practice_area_id?: string | null
          sort?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          entity?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json
          practice_area_id?: string | null
          sort?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_def_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_def_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline: {
        Row: {
          created_at: string
          due_date: string
          id: string
          jurisdiction_rule: string | null
          kind: string
          matter_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          jurisdiction_rule?: string | null
          kind: string
          matter_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          jurisdiction_rule?: string | null
          kind?: string
          matter_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_rule: {
        Row: {
          created_at: string
          days: number
          description: string | null
          id: string
          jurisdiction: string
          kind: string
          tenant_id: string | null
          trigger: string
        }
        Insert: {
          created_at?: string
          days: number
          description?: string | null
          id?: string
          jurisdiction: string
          kind: string
          tenant_id?: string | null
          trigger: string
        }
        Update: {
          created_at?: string
          days?: number
          description?: string | null
          id?: string
          jurisdiction?: string
          kind?: string
          tenant_id?: string | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_rule_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          client_id: string | null
          content_hash: string | null
          created_at: string
          doc_type: string | null
          email_message_id: string | null
          extracted: Json
          filename: string | null
          fts: unknown
          id: string
          matter_id: string | null
          mime: string | null
          parsed_text: string | null
          portal_shared: boolean
          size_bytes: number | null
          source: string
          storage_path: string | null
          tenant_id: string
        }
        Insert: {
          client_id?: string | null
          content_hash?: string | null
          created_at?: string
          doc_type?: string | null
          email_message_id?: string | null
          extracted?: Json
          filename?: string | null
          fts?: unknown
          id?: string
          matter_id?: string | null
          mime?: string | null
          parsed_text?: string | null
          portal_shared?: boolean
          size_bytes?: number | null
          source: string
          storage_path?: string | null
          tenant_id: string
        }
        Update: {
          client_id?: string | null
          content_hash?: string | null
          created_at?: string
          doc_type?: string | null
          email_message_id?: string | null
          extracted?: Json
          filename?: string | null
          fts?: unknown
          id?: string
          matter_id?: string | null
          mime?: string | null
          parsed_text?: string | null
          portal_shared?: boolean
          size_bytes?: number | null
          source?: string
          storage_path?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      email_message: {
        Row: {
          classified_client_id: string | null
          classified_matter_id: string | null
          confidence: number | null
          created_at: string
          from_addr: string | null
          gmail_history_id: string | null
          gmail_id: string
          id: string
          received_at: string | null
          snippet: string | null
          status: string
          subject: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          classified_client_id?: string | null
          classified_matter_id?: string | null
          confidence?: number | null
          created_at?: string
          from_addr?: string | null
          gmail_history_id?: string | null
          gmail_id: string
          id?: string
          received_at?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          classified_client_id?: string | null
          classified_matter_id?: string | null
          confidence?: number | null
          created_at?: string
          from_addr?: string | null
          gmail_history_id?: string | null
          gmail_id?: string
          id?: string
          received_at?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_message_classified_client_id_fkey"
            columns: ["classified_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_message_classified_matter_id_fkey"
            columns: ["classified_matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_message_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      expense: {
        Row: {
          amount_minor: number
          billable: boolean
          category: string
          created_at: string
          entry_date: string
          id: string
          invoiced_invoice_id: string | null
          matter_id: string
          notes: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          amount_minor: number
          billable?: boolean
          category?: string
          created_at?: string
          entry_date?: string
          id?: string
          invoiced_invoice_id?: string | null
          matter_id: string
          notes?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          amount_minor?: number
          billable?: boolean
          category?: string
          created_at?: string
          entry_date?: string
          id?: string
          invoiced_invoice_id?: string | null
          matter_id?: string
          notes?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      hearing: {
        Row: {
          court_no: string | null
          created_at: string
          date: string
          id: string
          judge: string | null
          matter_id: string
          purpose: string | null
          raw: Json
          tenant_id: string
        }
        Insert: {
          court_no?: string | null
          created_at?: string
          date: string
          id?: string
          judge?: string | null
          matter_id: string
          purpose?: string | null
          raw?: Json
          tenant_id: string
        }
        Update: {
          court_no?: string | null
          created_at?: string
          date?: string
          id?: string
          judge?: string | null
          matter_id?: string
          purpose?: string | null
          raw?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hearing_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_asset: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          jurisdiction: string | null
          matter_id: string | null
          notes: string | null
          registration_no: string | null
          renewal_date: string | null
          status: string
          tenant_id: string
          title: string
          type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string | null
          matter_id?: string | null
          notes?: string | null
          registration_no?: string | null
          renewal_date?: string | null
          status?: string
          tenant_id: string
          title: string
          type?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string | null
          matter_id?: string | null
          notes?: string | null
          registration_no?: string | null
          renewal_date?: string | null
          status?: string
          tenant_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ip_asset_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ip_asset_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ip_asset_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      matter: {
        Row: {
          act_names: string[]
          advocate_names: string[]
          ai_summary: Json | null
          case_type: string | null
          client_id: string | null
          cnr: string | null
          court: string | null
          created_at: string
          detail: Json | null
          id: string
          judge_names: string[]
          last_synced_at: string | null
          next_hearing_date: string | null
          parties: Json
          party_names: string[]
          practice_area_id: string | null
          rate_minor: number | null
          source: string | null
          stage: string | null
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          act_names?: string[]
          advocate_names?: string[]
          ai_summary?: Json | null
          case_type?: string | null
          client_id?: string | null
          cnr?: string | null
          court?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          judge_names?: string[]
          last_synced_at?: string | null
          next_hearing_date?: string | null
          parties?: Json
          party_names?: string[]
          practice_area_id?: string | null
          rate_minor?: number | null
          source?: string | null
          stage?: string | null
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          act_names?: string[]
          advocate_names?: string[]
          ai_summary?: Json | null
          case_type?: string | null
          client_id?: string | null
          cnr?: string | null
          court?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          judge_names?: string[]
          last_synced_at?: string | null
          next_hearing_date?: string | null
          parties?: Json
          party_names?: string[]
          practice_area_id?: string | null
          rate_minor?: number | null
          source?: string | null
          stage?: string | null
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      notice: {
        Row: {
          body_ref: string | null
          client_id: string | null
          created_at: string
          escalation_state: string
          id: string
          matter_id: string | null
          next_escalation_at: string | null
          response_due: string | null
          sent_at: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          body_ref?: string | null
          client_id?: string | null
          created_at?: string
          escalation_state?: string
          id?: string
          matter_id?: string | null
          next_escalation_at?: string | null
          response_due?: string | null
          sent_at?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          body_ref?: string | null
          client_id?: string | null
          created_at?: string
          escalation_state?: string
          id?: string
          matter_id?: string | null
          next_escalation_at?: string | null
          response_due?: string | null
          sent_at?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      notification: {
        Row: {
          channel: string
          created_at: string
          id: string
          kind: string
          payload: Json
          scheduled_for: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connection: {
        Row: {
          created_at: string
          gmail_last_history_id: string | null
          id: string
          provider: string
          refresh_token_ref: string | null
          scopes: string[]
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gmail_last_history_id?: string | null
          id?: string
          provider?: string
          refresh_token_ref?: string | null
          scopes?: string[]
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          gmail_last_history_id?: string | null
          id?: string
          provider?: string
          refresh_token_ref?: string | null
          scopes?: string[]
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_connection_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_message: {
        Row: {
          body: string
          client_id: string
          created_at: string
          id: string
          matter_id: string | null
          sender: string
          sender_user_id: string | null
          tenant_id: string
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          id?: string
          matter_id?: string | null
          sender: string
          sender_user_id?: string | null
          tenant_id: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          matter_id?: string | null
          sender?: string
          sender_user_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_message_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_message_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_message_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_user: {
        Row: {
          client_id: string
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id: string
          tenant_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_user_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_user_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_area: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_area_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          rate_minor: number | null
          role: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          rate_minor?: number | null
          role?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          rate_minor?: number | null
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_view: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          query: Json
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          query?: Json
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          query?: Json
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_view_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant: {
        Row: {
          created_at: string
          default_rate_minor: number | null
          id: string
          name: string
          plan: string
        }
        Insert: {
          created_at?: string
          default_rate_minor?: number | null
          id?: string
          name: string
          plan?: string
        }
        Update: {
          created_at?: string
          default_rate_minor?: number | null
          id?: string
          name?: string
          plan?: string
        }
        Relationships: []
      }
      time_entry: {
        Row: {
          billable: boolean
          created_at: string
          entry_date: string
          id: string
          invoiced_invoice_id: string | null
          matter_id: string
          minutes: number
          narrative: string | null
          rate_minor: number
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          billable?: boolean
          created_at?: string
          entry_date?: string
          id?: string
          invoiced_invoice_id?: string | null
          matter_id: string
          minutes: number
          narrative?: string | null
          rate_minor?: number
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          billable?: boolean
          created_at?: string
          entry_date?: string
          id?: string
          invoiced_invoice_id?: string | null
          matter_id?: string
          minutes?: number
          narrative?: string | null
          rate_minor?: number
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      portal_client_id: { Args: never; Returns: string }
      portal_tenant_id: { Args: never; Returns: string }
      read_secret: { Args: { secret_id: string }; Returns: string }
      store_secret: {
        Args: { secret: string; secret_name: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

