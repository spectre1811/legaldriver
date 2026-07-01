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
          bar_code: string | null
          bar_registration_number: string | null
          courts: string[]
          created_at: string
          id: string
          name: string
          state_code: string | null
          tenant_id: string
        }
        Insert: {
          bar_code?: string | null
          bar_registration_number?: string | null
          courts?: string[]
          created_at?: string
          id?: string
          name: string
          state_code?: string | null
          tenant_id: string
        }
        Update: {
          bar_code?: string | null
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
      agent_thread: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          matter_id: string | null
          tenant_id: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string | null
          tenant_id: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string | null
          tenant_id?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_thread_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_thread_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_thread_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_turn: {
        Row: {
          citations: Json
          content: string
          created_at: string
          id: string
          meta: Json | null
          role: string
          tenant_id: string
          thread_id: string
        }
        Insert: {
          citations?: Json
          content: string
          created_at?: string
          id?: string
          meta?: Json | null
          role: string
          tenant_id: string
          thread_id: string
        }
        Update: {
          citations?: Json
          content?: string
          created_at?: string
          id?: string
          meta?: Json | null
          role?: string
          tenant_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_turn_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_turn_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_thread"
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
      capture_token: {
        Row: {
          created_at: string
          created_by: string | null
          label: string | null
          last_used_at: string | null
          revoked: boolean
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          label?: string | null
          last_used_at?: string | null
          revoked?: boolean
          tenant_id: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          label?: string | null
          last_used_at?: string | null
          revoked?: boolean
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_token_tenant_id_fkey"
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
      corpus_ingest_watermark: {
        Row: {
          last_ingested_at: string | null
          partition: string
          rows: number | null
          source: string
        }
        Insert: {
          last_ingested_at?: string | null
          partition: string
          rows?: number | null
          source: string
        }
        Update: {
          last_ingested_at?: string | null
          partition?: string
          rows?: number | null
          source?: string
        }
        Relationships: []
      }
      corpus_judgment: {
        Row: {
          case_number: string | null
          cnr: string | null
          content_hash: string | null
          court: string | null
          court_code: string | null
          decision_date: string | null
          disposal_nature: string | null
          fts: unknown
          id: string
          ingested_at: string
          judge: string | null
          license: string
          pdf_link: string | null
          petitioner: string | null
          registration_date: string | null
          respondent: string | null
          source: string
          state: string | null
          title: string | null
          year: number | null
        }
        Insert: {
          case_number?: string | null
          cnr?: string | null
          content_hash?: string | null
          court?: string | null
          court_code?: string | null
          decision_date?: string | null
          disposal_nature?: string | null
          fts?: unknown
          id?: string
          ingested_at?: string
          judge?: string | null
          license?: string
          pdf_link?: string | null
          petitioner?: string | null
          registration_date?: string | null
          respondent?: string | null
          source?: string
          state?: string | null
          title?: string | null
          year?: number | null
        }
        Update: {
          case_number?: string | null
          cnr?: string | null
          content_hash?: string | null
          court?: string | null
          court_code?: string | null
          decision_date?: string | null
          disposal_nature?: string | null
          fts?: unknown
          id?: string
          ingested_at?: string
          judge?: string | null
          license?: string
          pdf_link?: string | null
          petitioner?: string | null
          registration_date?: string | null
          respondent?: string | null
          source?: string
          state?: string | null
          title?: string | null
          year?: number | null
        }
        Relationships: []
      }
      corpus_source_batch: {
        Row: {
          finished_at: string | null
          id: string
          note: string | null
          partition: string | null
          rows_seen: number | null
          rows_upserted: number | null
          source: string
          started_at: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          note?: string | null
          partition?: string | null
          rows_seen?: number | null
          rows_upserted?: number | null
          source: string
          started_at?: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          note?: string | null
          partition?: string | null
          rows_seen?: number | null
          rows_upserted?: number | null
          source?: string
          started_at?: string
        }
        Relationships: []
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
          basis: string | null
          created_at: string
          due_date: string
          id: string
          jurisdiction_rule: string | null
          kind: string
          matter_id: string
          source: string
          status: string
          tenant_id: string
        }
        Insert: {
          basis?: string | null
          created_at?: string
          due_date: string
          id?: string
          jurisdiction_rule?: string | null
          kind: string
          matter_id: string
          source?: string
          status?: string
          tenant_id: string
        }
        Update: {
          basis?: string | null
          created_at?: string
          due_date?: string
          id?: string
          jurisdiction_rule?: string | null
          kind?: string
          matter_id?: string
          source?: string
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
          category: string | null
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
          category?: string | null
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
          category?: string | null
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
      document_chunk: {
        Row: {
          chunk_index: number
          client_id: string | null
          content: string
          created_at: string
          document_id: string | null
          embedding: string | null
          fts: unknown
          id: string
          matter_id: string | null
          tenant_id: string
        }
        Insert: {
          chunk_index?: number
          client_id?: string | null
          content: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          matter_id?: string | null
          tenant_id: string
        }
        Update: {
          chunk_index?: number
          client_id?: string | null
          content?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          matter_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunk_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      draft: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          language: string
          matter_id: string | null
          produces_doc_type: string | null
          sections: string[]
          source_document_id: string | null
          status: string
          template_id: string | null
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          matter_id?: string | null
          produces_doc_type?: string | null
          sections?: string[]
          source_document_id?: string | null
          status?: string
          template_id?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          matter_id?: string | null
          produces_doc_type?: string | null
          sections?: string[]
          source_document_id?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "draft_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_template: {
        Row: {
          conventions: string | null
          created_at: string
          default_sections: string[]
          id: string
          is_default: boolean
          jurisdiction: string | null
          language: string
          produces_doc_type: string
          responds_to_category: string
          responds_to_doc_type: string | null
          source: string | null
          structure: Json
          tenant_id: string
          title: string
        }
        Insert: {
          conventions?: string | null
          created_at?: string
          default_sections?: string[]
          id?: string
          is_default?: boolean
          jurisdiction?: string | null
          language?: string
          produces_doc_type: string
          responds_to_category: string
          responds_to_doc_type?: string | null
          source?: string | null
          structure?: Json
          tenant_id: string
          title: string
        }
        Update: {
          conventions?: string | null
          created_at?: string
          default_sections?: string[]
          id?: string
          is_default?: boolean
          jurisdiction?: string | null
          language?: string
          produces_doc_type?: string
          responds_to_category?: string
          responds_to_doc_type?: string | null
          source?: string | null
          structure?: Json
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_template_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_version: {
        Row: {
          assumptions: string[]
          body: string | null
          bullet_points: string[]
          citations: Json
          clarifications: string[]
          created_at: string
          draft_id: string
          generated_by: string | null
          id: string
          meta: Json
          presumptions: string[]
          tenant_id: string
          version: number
        }
        Insert: {
          assumptions?: string[]
          body?: string | null
          bullet_points?: string[]
          citations?: Json
          clarifications?: string[]
          created_at?: string
          draft_id: string
          generated_by?: string | null
          id?: string
          meta?: Json
          presumptions?: string[]
          tenant_id: string
          version: number
        }
        Update: {
          assumptions?: string[]
          body?: string | null
          bullet_points?: string[]
          citations?: Json
          clarifications?: string[]
          created_at?: string
          draft_id?: string
          generated_by?: string | null
          id?: string
          meta?: Json
          presumptions?: string[]
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_version_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "draft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_version_tenant_id_fkey"
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
            foreignKeyName: "expense_invoiced_invoice_id_fkey"
            columns: ["invoiced_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
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
      firm_billing: {
        Row: {
          address: string | null
          bank_details: string | null
          default_gst_rate: number
          gstin: string | null
          hsn_sac: string
          invoice_prefix: string
          legal_name: string | null
          reverse_charge: boolean
          state_code: string | null
          tenant_id: string
          terms: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_details?: string | null
          default_gst_rate?: number
          gstin?: string | null
          hsn_sac?: string
          invoice_prefix?: string
          legal_name?: string | null
          reverse_charge?: boolean
          state_code?: string | null
          tenant_id: string
          terms?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_details?: string | null
          default_gst_rate?: number
          gstin?: string | null
          hsn_sac?: string
          invoice_prefix?: string
          legal_name?: string | null
          reverse_charge?: boolean
          state_code?: string | null
          tenant_id?: string
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_billing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
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
      invoice: {
        Row: {
          cgst_minor: number
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          fy: string | null
          gst_rate: number
          id: string
          igst_minor: number
          issue_date: string
          matter_id: string | null
          notes: string | null
          number: string | null
          place_of_supply: string | null
          reverse_charge: boolean
          sgst_minor: number
          status: string
          subtotal_minor: number
          tenant_id: string
          total_minor: number
          updated_at: string
        }
        Insert: {
          cgst_minor?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fy?: string | null
          gst_rate?: number
          id?: string
          igst_minor?: number
          issue_date?: string
          matter_id?: string | null
          notes?: string | null
          number?: string | null
          place_of_supply?: string | null
          reverse_charge?: boolean
          sgst_minor?: number
          status?: string
          subtotal_minor?: number
          tenant_id: string
          total_minor?: number
          updated_at?: string
        }
        Update: {
          cgst_minor?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fy?: string | null
          gst_rate?: number
          id?: string
          igst_minor?: number
          issue_date?: string
          matter_id?: string | null
          notes?: string | null
          number?: string | null
          place_of_supply?: string | null
          reverse_charge?: boolean
          sgst_minor?: number
          status?: string
          subtotal_minor?: number
          tenant_id?: string
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line: {
        Row: {
          amount_minor: number
          created_at: string
          description: string
          hsn_sac: string | null
          id: string
          invoice_id: string
          kind: string
          quantity: number
          rate_minor: number
          sort: number
          source_expense_id: string | null
          source_time_entry_id: string | null
          tenant_id: string
          unit: string | null
        }
        Insert: {
          amount_minor?: number
          created_at?: string
          description: string
          hsn_sac?: string | null
          id?: string
          invoice_id: string
          kind?: string
          quantity?: number
          rate_minor?: number
          sort?: number
          source_expense_id?: string | null
          source_time_entry_id?: string | null
          tenant_id: string
          unit?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          description?: string
          hsn_sac?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          quantity?: number
          rate_minor?: number
          sort?: number
          source_expense_id?: string | null
          source_time_entry_id?: string | null
          tenant_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_source_expense_id_fkey"
            columns: ["source_expense_id"]
            isOneToOne: false
            referencedRelation: "expense"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_source_time_entry_id_fkey"
            columns: ["source_time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_tenant_id_fkey"
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
      legal_reference: {
        Row: {
          id: string
          kind: string
          new_ref: string | null
          old_ref: string | null
          source: string | null
          summary: string | null
          tags: string[]
          title: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          kind: string
          new_ref?: string | null
          old_ref?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[]
          title?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          kind?: string
          new_ref?: string | null
          old_ref?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[]
          title?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: []
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
      msg_message: {
        Row: {
          body: string | null
          channel: string
          classified: Json | null
          client_id: string | null
          confidence: number | null
          created_at: string
          direction: string
          external_id: string | null
          from_addr: string | null
          id: string
          matter_id: string | null
          media: Json
          provider: string | null
          status: string
          suggested_reply: string | null
          tenant_id: string
          thread_key: string | null
          to_addr: string | null
        }
        Insert: {
          body?: string | null
          channel: string
          classified?: Json | null
          client_id?: string | null
          confidence?: number | null
          created_at?: string
          direction: string
          external_id?: string | null
          from_addr?: string | null
          id?: string
          matter_id?: string | null
          media?: Json
          provider?: string | null
          status?: string
          suggested_reply?: string | null
          tenant_id: string
          thread_key?: string | null
          to_addr?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          classified?: Json | null
          client_id?: string | null
          confidence?: number | null
          created_at?: string
          direction?: string
          external_id?: string | null
          from_addr?: string | null
          id?: string
          matter_id?: string | null
          media?: Json
          provider?: string | null
          status?: string
          suggested_reply?: string | null
          tenant_id?: string
          thread_key?: string | null
          to_addr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "msg_message_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msg_message_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msg_message_tenant_id_fkey"
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
      onboarding_run: {
        Row: {
          advocate_id: string | null
          counts: Json
          created_at: string
          cursor: Json
          id: string
          message: string | null
          stage: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          advocate_id?: string | null
          counts?: Json
          created_at?: string
          cursor?: Json
          id?: string
          message?: string | null
          stage?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          advocate_id?: string | null
          counts?: Json
          created_at?: string
          cursor?: Json
          id?: string
          message?: string | null
          stage?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_run_advocate_id_fkey"
            columns: ["advocate_id"]
            isOneToOne: false
            referencedRelation: "advocate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_run_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_email: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          kind: string
          matter_id: string | null
          provider_id: string | null
          status: string
          subject: string | null
          tenant_id: string
          to_addr: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          matter_id?: string | null
          provider_id?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          to_addr: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          matter_id?: string | null
          provider_id?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          to_addr?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_email_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_email_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_email_tenant_id_fkey"
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
            foreignKeyName: "time_entry_invoiced_invoice_id_fkey"
            columns: ["invoiced_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
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
      voice_recording: {
        Row: {
          client_id: string | null
          consent_disclosed: boolean
          created_at: string
          duration_sec: number | null
          external_id: string | null
          from_number: string | null
          id: string
          language: string | null
          matter_id: string | null
          provider: string | null
          source: string
          status: string
          storage_path: string | null
          summary: Json | null
          tenant_id: string
          to_number: string | null
          transcript: string | null
        }
        Insert: {
          client_id?: string | null
          consent_disclosed?: boolean
          created_at?: string
          duration_sec?: number | null
          external_id?: string | null
          from_number?: string | null
          id?: string
          language?: string | null
          matter_id?: string | null
          provider?: string | null
          source: string
          status?: string
          storage_path?: string | null
          summary?: Json | null
          tenant_id: string
          to_number?: string | null
          transcript?: string | null
        }
        Update: {
          client_id?: string | null
          consent_disclosed?: boolean
          created_at?: string
          duration_sec?: number | null
          external_id?: string | null
          from_number?: string | null
          id?: string
          language?: string | null
          matter_id?: string | null
          provider?: string | null
          source?: string
          status?: string
          storage_path?: string | null
          summary?: Json | null
          tenant_id?: string
          to_number?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_recording_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_recording_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_recording_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      communication_log: {
        Row: {
          channel: string | null
          client_id: string | null
          counterparty: string | null
          direction: string | null
          id: string | null
          matter_id: string | null
          occurred_at: string | null
          preview: string | null
          status: string | null
          subject: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      analytics_summary: { Args: never; Returns: Json }
      current_tenant_id: { Args: never; Returns: string }
      match_document_chunks: {
        Args: { p_embedding: string; p_k?: number; p_tenant: string }
        Returns: {
          content: string
          document_id: string
          matter_id: string
          similarity: number
        }[]
      }
      portal_client_id: { Args: never; Returns: string }
      portal_tenant_id: { Args: never; Returns: string }
      read_secret: { Args: { secret_id: string }; Returns: string }
      seed_draft_templates: { Args: { p_tenant: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
