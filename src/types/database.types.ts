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
      business_settings: {
        Row: {
          bank_account_name: string
          bank_account_number: string
          bank_branch_code: string
          bank_iban: string
          bank_name: string
          bank_reference: string
          bank_swift: string
          billing_address: string
          business_email: string
          business_logo_path: string | null
          created_at: string
          default_currency: Database["public"]["Enums"]["currency_code"]
          default_day_rate: number
          default_equipment_rental: number
          default_included_hours: number
          default_invoice_detail_mode: Database["public"]["Enums"]["invoice_detail_mode"]
          default_min_turnaround: number
          default_ot_band1_hours: number
          default_ot_band1_mult: number
          default_ot_band2_mult: number
          default_overtime_rule: Database["public"]["Enums"]["overtime_rule_id"]
          default_per_diem: number
          default_turnaround_mode: Database["public"]["Enums"]["turnaround_mode"]
          default_turnaround_pen_mult: number
          default_vat: number
          full_name: string
          id: string
          invoice_label: string
          invoice_number_history: string[]
          invoice_number_prefix: string
          invoice_preferences: Json
          next_invoice_number: number
          overtime_config: Json
          payment_terms: string
          phone: string
          role: string
          tax_number: string
          trading_name: string
          turnaround_config: Json
          updated_at: string
          user_id: string
          vat_number: string
          vat_registered: boolean
        }
        Insert: {
          bank_account_name?: string
          bank_account_number?: string
          bank_branch_code?: string
          bank_iban?: string
          bank_name?: string
          bank_reference?: string
          bank_swift?: string
          billing_address?: string
          business_email?: string
          business_logo_path?: string | null
          created_at?: string
          default_currency?: Database["public"]["Enums"]["currency_code"]
          default_day_rate?: number
          default_equipment_rental?: number
          default_included_hours?: number
          default_invoice_detail_mode?: Database["public"]["Enums"]["invoice_detail_mode"]
          default_min_turnaround?: number
          default_ot_band1_hours?: number
          default_ot_band1_mult?: number
          default_ot_band2_mult?: number
          default_overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          default_per_diem?: number
          default_turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          default_turnaround_pen_mult?: number
          default_vat?: number
          full_name?: string
          id?: string
          invoice_label?: string
          invoice_number_history?: string[]
          invoice_number_prefix?: string
          invoice_preferences?: Json
          next_invoice_number?: number
          overtime_config?: Json
          payment_terms?: string
          phone?: string
          role?: string
          tax_number?: string
          trading_name?: string
          turnaround_config?: Json
          updated_at?: string
          user_id: string
          vat_number?: string
          vat_registered?: boolean
        }
        Update: {
          bank_account_name?: string
          bank_account_number?: string
          bank_branch_code?: string
          bank_iban?: string
          bank_name?: string
          bank_reference?: string
          bank_swift?: string
          billing_address?: string
          business_email?: string
          business_logo_path?: string | null
          created_at?: string
          default_currency?: Database["public"]["Enums"]["currency_code"]
          default_day_rate?: number
          default_equipment_rental?: number
          default_included_hours?: number
          default_invoice_detail_mode?: Database["public"]["Enums"]["invoice_detail_mode"]
          default_min_turnaround?: number
          default_ot_band1_hours?: number
          default_ot_band1_mult?: number
          default_ot_band2_mult?: number
          default_overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          default_per_diem?: number
          default_turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          default_turnaround_pen_mult?: number
          default_vat?: number
          full_name?: string
          id?: string
          invoice_label?: string
          invoice_number_history?: string[]
          invoice_number_prefix?: string
          invoice_preferences?: Json
          next_invoice_number?: number
          overtime_config?: Json
          payment_terms?: string
          phone?: string
          role?: string
          tax_number?: string
          trading_name?: string
          turnaround_config?: Json
          updated_at?: string
          user_id?: string
          vat_number?: string
          vat_registered?: boolean
        }
        Relationships: []
      }
      clients: {
        Row: {
          accounts_email: string
          billing_address: string
          company_name: string
          contact_person: string
          created_at: string
          default_payment_terms: string
          email: string
          id: string
          notes: string
          payment_terms: string
          phone: string
          po_required: boolean
          preferred_invoice_detail_mode: Database["public"]["Enums"]["invoice_detail_mode"]
          rate_memory: Json | null
          updated_at: string
          user_id: string
          vat_number: string
          vendor_number: string
        }
        Insert: {
          accounts_email?: string
          billing_address?: string
          company_name?: string
          contact_person?: string
          created_at?: string
          default_payment_terms?: string
          email?: string
          id?: string
          notes?: string
          payment_terms?: string
          phone?: string
          po_required?: boolean
          preferred_invoice_detail_mode?: Database["public"]["Enums"]["invoice_detail_mode"]
          rate_memory?: Json | null
          updated_at?: string
          user_id: string
          vat_number?: string
          vendor_number?: string
        }
        Update: {
          accounts_email?: string
          billing_address?: string
          company_name?: string
          contact_person?: string
          created_at?: string
          default_payment_terms?: string
          email?: string
          id?: string
          notes?: string
          payment_terms?: string
          phone?: string
          po_required?: boolean
          preferred_invoice_detail_mode?: Database["public"]["Enums"]["invoice_detail_mode"]
          rate_memory?: Json | null
          updated_at?: string
          user_id?: string
          vat_number?: string
          vendor_number?: string
        }
        Relationships: []
      }
      day_expenses: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          legacy_id: string | null
          notes: string
          quantity: number
          timesheet_entry_id: string
          total_amount: number
          unit_amount: number
          updated_at: string
          user_id: string
          vat_applicable: boolean
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          legacy_id?: string | null
          notes?: string
          quantity?: number
          timesheet_entry_id: string
          total_amount?: number
          unit_amount?: number
          updated_at?: string
          user_id: string
          vat_applicable?: boolean
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          legacy_id?: string | null
          notes?: string
          quantity?: number
          timesheet_entry_id?: string
          total_amount?: number
          unit_amount?: number
          updated_at?: string
          user_id?: string
          vat_applicable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "day_expenses_entry_owner_fk"
            columns: ["user_id", "timesheet_entry_id"]
            isOneToOne: false
            referencedRelation: "timesheet_entries"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          imported_counts: Json
          source: string
          source_app_version: string | null
          source_data_version: number | null
          source_fingerprint: string
          started_at: string
          status: Database["public"]["Enums"]["import_batch_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          imported_counts?: Json
          source: string
          source_app_version?: string | null
          source_data_version?: number | null
          source_fingerprint: string
          started_at?: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          imported_counts?: Json
          source?: string
          source_app_version?: string | null
          source_data_version?: number | null
          source_fingerprint?: string
          started_at?: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["invoice_line_category"]
          created_at: string
          description: string
          id: string
          invoice_id: string
          is_extra: boolean
          is_manual: boolean
          legacy_id: string | null
          line_order: number
          metadata: Json
          quantity: number
          source_day_expense_id: string | null
          source_timesheet_entry_id: string | null
          source_type: Database["public"]["Enums"]["invoice_line_source_type"]
          taxable: boolean
          unit_label: string
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["invoice_line_category"]
          created_at?: string
          description?: string
          id?: string
          invoice_id: string
          is_extra?: boolean
          is_manual?: boolean
          legacy_id?: string | null
          line_order?: number
          metadata?: Json
          quantity?: number
          source_day_expense_id?: string | null
          source_timesheet_entry_id?: string | null
          source_type?: Database["public"]["Enums"]["invoice_line_source_type"]
          taxable?: boolean
          unit_label?: string
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["invoice_line_category"]
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          is_extra?: boolean
          is_manual?: boolean
          legacy_id?: string | null
          line_order?: number
          metadata?: Json
          quantity?: number
          source_day_expense_id?: string | null
          source_timesheet_entry_id?: string | null
          source_type?: Database["public"]["Enums"]["invoice_line_source_type"]
          taxable?: boolean
          unit_label?: string
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_owner_fk"
            columns: ["user_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_source_day_expense_owner_fk"
            columns: ["user_id", "source_day_expense_id"]
            isOneToOne: false
            referencedRelation: "day_expenses"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_source_timesheet_entry_owner_fk"
            columns: ["user_id", "source_timesheet_entry_id"]
            isOneToOne: false
            referencedRelation: "timesheet_entries"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_due: number
          banking: Json
          client_id: string | null
          client_name: string
          company_name: string
          created_at: string
          crew_name: string
          currency: Database["public"]["Enums"]["currency_code"]
          detail_mode: Database["public"]["Enums"]["invoice_detail_mode"]
          due_date: string
          from_timesheet_id: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_amount: number
          paid_date: string | null
          payment_notes: string
          payment_terms: string | null
          po_number: string | null
          production_name: string | null
          role: string
          seller_logo_path: string | null
          seller_snapshot: Json | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          timesheet_dates: string | null
          timesheet_number: string
          total: number
          updated_at: string
          user_id: string
          vat: number
          vat_amount: number
        }
        Insert: {
          balance_due?: number
          banking?: Json
          client_id?: string | null
          client_name?: string
          company_name?: string
          created_at?: string
          crew_name?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          detail_mode?: Database["public"]["Enums"]["invoice_detail_mode"]
          due_date: string
          from_timesheet_id?: string | null
          id?: string
          invoice_number: string
          issue_date: string
          notes?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_notes?: string
          payment_terms?: string | null
          po_number?: string | null
          production_name?: string | null
          role?: string
          seller_logo_path?: string | null
          seller_snapshot?: Json | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          timesheet_dates?: string | null
          timesheet_number?: string
          total?: number
          updated_at?: string
          user_id: string
          vat?: number
          vat_amount?: number
        }
        Update: {
          balance_due?: number
          banking?: Json
          client_id?: string | null
          client_name?: string
          company_name?: string
          created_at?: string
          crew_name?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          detail_mode?: Database["public"]["Enums"]["invoice_detail_mode"]
          due_date?: string
          from_timesheet_id?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_notes?: string
          payment_terms?: string | null
          po_number?: string | null
          production_name?: string | null
          role?: string
          seller_logo_path?: string | null
          seller_snapshot?: Json | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          timesheet_dates?: string | null
          timesheet_number?: string
          total?: number
          updated_at?: string
          user_id?: string
          vat?: number
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_owner_fk"
            columns: ["user_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "invoices_timesheet_owner_fk"
            columns: ["user_id", "from_timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          legacy_id: string | null
          method: string
          notes: string
          payment_date: string
          reference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          legacy_id?: string | null
          method?: string
          notes?: string
          payment_date: string
          reference?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          legacy_id?: string | null
          method?: string
          notes?: string
          payment_date?: string
          reference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_owner_fk"
            columns: ["user_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string
          bank_account_name: string
          bank_account_number: string
          bank_branch_code: string
          bank_iban: string
          bank_name: string
          bank_reference: string
          bank_swift: string
          business_logo_path: string | null
          company_name: string
          created_at: string
          default_currency: Database["public"]["Enums"]["currency_code"]
          default_day_rate: number
          default_equipment_rental: number
          default_included_hours: number
          default_min_turnaround: number
          default_ot_band1_hours: number
          default_ot_band1_mult: number
          default_ot_band2_mult: number
          default_overtime_rule: Database["public"]["Enums"]["overtime_rule_id"]
          default_per_diem: number
          default_turnaround_mode: Database["public"]["Enums"]["turnaround_mode"]
          default_turnaround_pen_mult: number
          default_vat: number
          email: string
          equipment_rental_daily: boolean
          full_name: string
          id: string
          invoice_label: string
          invoice_number_history: string[]
          meal_breaks_deducted: boolean
          payment_terms: string
          phone: string
          role: string
          travel_time_paid: boolean
          updated_at: string
          vat_number: string
          vat_registered: boolean
        }
        Insert: {
          address?: string
          bank_account_name?: string
          bank_account_number?: string
          bank_branch_code?: string
          bank_iban?: string
          bank_name?: string
          bank_reference?: string
          bank_swift?: string
          business_logo_path?: string | null
          company_name?: string
          created_at?: string
          default_currency?: Database["public"]["Enums"]["currency_code"]
          default_day_rate?: number
          default_equipment_rental?: number
          default_included_hours?: number
          default_min_turnaround?: number
          default_ot_band1_hours?: number
          default_ot_band1_mult?: number
          default_ot_band2_mult?: number
          default_overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          default_per_diem?: number
          default_turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          default_turnaround_pen_mult?: number
          default_vat?: number
          email?: string
          equipment_rental_daily?: boolean
          full_name?: string
          id: string
          invoice_label?: string
          invoice_number_history?: string[]
          meal_breaks_deducted?: boolean
          payment_terms?: string
          phone?: string
          role?: string
          travel_time_paid?: boolean
          updated_at?: string
          vat_number?: string
          vat_registered?: boolean
        }
        Update: {
          address?: string
          bank_account_name?: string
          bank_account_number?: string
          bank_branch_code?: string
          bank_iban?: string
          bank_name?: string
          bank_reference?: string
          bank_swift?: string
          business_logo_path?: string | null
          company_name?: string
          created_at?: string
          default_currency?: Database["public"]["Enums"]["currency_code"]
          default_day_rate?: number
          default_equipment_rental?: number
          default_included_hours?: number
          default_min_turnaround?: number
          default_ot_band1_hours?: number
          default_ot_band1_mult?: number
          default_ot_band2_mult?: number
          default_overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          default_per_diem?: number
          default_turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          default_turnaround_pen_mult?: number
          default_vat?: number
          email?: string
          equipment_rental_daily?: boolean
          full_name?: string
          id?: string
          invoice_label?: string
          invoice_number_history?: string[]
          meal_breaks_deducted?: boolean
          payment_terms?: string
          phone?: string
          role?: string
          travel_time_paid?: boolean
          updated_at?: string
          vat_number?: string
          vat_registered?: boolean
        }
        Relationships: []
      }
      rate_presets: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          day_rate: number
          equipment_rental: number
          id: string
          included_hours: number
          is_default: boolean
          legacy_id: string | null
          min_turnaround: number
          name: string
          ot_band1_hours: number
          ot_band1_mult: number
          ot_band2_mult: number
          overtime_config: Json
          overtime_rule: Database["public"]["Enums"]["overtime_rule_id"]
          per_diem: number
          preset_type: string
          turnaround_config: Json
          turnaround_mode: Database["public"]["Enums"]["turnaround_mode"]
          turnaround_pen_mult: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          day_rate?: number
          equipment_rental?: number
          id?: string
          included_hours?: number
          is_default?: boolean
          legacy_id?: string | null
          min_turnaround?: number
          name: string
          ot_band1_hours?: number
          ot_band1_mult?: number
          ot_band2_mult?: number
          overtime_config?: Json
          overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          per_diem?: number
          preset_type?: string
          turnaround_config?: Json
          turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          turnaround_pen_mult?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          day_rate?: number
          equipment_rental?: number
          id?: string
          included_hours?: number
          is_default?: boolean
          legacy_id?: string | null
          min_turnaround?: number
          name?: string
          ot_band1_hours?: number
          ot_band1_mult?: number
          ot_band2_mult?: number
          overtime_config?: Json
          overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          per_diem?: number
          preset_type?: string
          turnaround_config?: Json
          turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          turnaround_pen_mult?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      timesheet_entries: {
        Row: {
          calc_snapshot: Json
          call_time: string | null
          created_at: string
          date: string
          day_rate: number
          day_subtotal: number
          day_total: number
          entry_order: number
          equipment_rental: number
          expense_description: string
          expenses: number
          id: string
          included_hours: number
          is_public_holiday: boolean
          is_sunday: boolean
          legacy_id: string | null
          location: string
          manual_override: boolean
          meal_break_minutes: number
          meal_deducted: boolean
          meal_hours: number
          min_turnaround: number
          notes: string
          on_set_hours: number
          ot_band1_amount: number
          ot_band1_hours: number
          ot_band1_mult: number
          ot_band1_worked_hours: number
          ot_band2_amount: number
          ot_band2_mult: number
          ot_band2_worked_hours: number
          overnight: boolean
          overtime_hours: number
          overtime_rule: Database["public"]["Enums"]["overtime_rule_id"]
          paid_hours: number
          per_diem: number
          production_name: string
          rate_snapshot: Json
          timesheet_id: string
          travel_distance: string
          travel_end_time: string | null
          travel_hours: number
          travel_paid: boolean
          travel_start_time: string | null
          turnaround_hours: number
          turnaround_mode: Database["public"]["Enums"]["turnaround_mode"]
          turnaround_pen_mult: number
          turnaround_penalty: number
          updated_at: string
          user_id: string
          vat_rate: number
          wrap_time: string | null
        }
        Insert: {
          calc_snapshot?: Json
          call_time?: string | null
          created_at?: string
          date: string
          day_rate?: number
          day_subtotal?: number
          day_total?: number
          entry_order?: number
          equipment_rental?: number
          expense_description?: string
          expenses?: number
          id?: string
          included_hours?: number
          is_public_holiday?: boolean
          is_sunday?: boolean
          legacy_id?: string | null
          location?: string
          manual_override?: boolean
          meal_break_minutes?: number
          meal_deducted?: boolean
          meal_hours?: number
          min_turnaround?: number
          notes?: string
          on_set_hours?: number
          ot_band1_amount?: number
          ot_band1_hours?: number
          ot_band1_mult?: number
          ot_band1_worked_hours?: number
          ot_band2_amount?: number
          ot_band2_mult?: number
          ot_band2_worked_hours?: number
          overnight?: boolean
          overtime_hours?: number
          overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          paid_hours?: number
          per_diem?: number
          production_name?: string
          rate_snapshot?: Json
          timesheet_id: string
          travel_distance?: string
          travel_end_time?: string | null
          travel_hours?: number
          travel_paid?: boolean
          travel_start_time?: string | null
          turnaround_hours?: number
          turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          turnaround_pen_mult?: number
          turnaround_penalty?: number
          updated_at?: string
          user_id: string
          vat_rate?: number
          wrap_time?: string | null
        }
        Update: {
          calc_snapshot?: Json
          call_time?: string | null
          created_at?: string
          date?: string
          day_rate?: number
          day_subtotal?: number
          day_total?: number
          entry_order?: number
          equipment_rental?: number
          expense_description?: string
          expenses?: number
          id?: string
          included_hours?: number
          is_public_holiday?: boolean
          is_sunday?: boolean
          legacy_id?: string | null
          location?: string
          manual_override?: boolean
          meal_break_minutes?: number
          meal_deducted?: boolean
          meal_hours?: number
          min_turnaround?: number
          notes?: string
          on_set_hours?: number
          ot_band1_amount?: number
          ot_band1_hours?: number
          ot_band1_mult?: number
          ot_band1_worked_hours?: number
          ot_band2_amount?: number
          ot_band2_mult?: number
          ot_band2_worked_hours?: number
          overnight?: boolean
          overtime_hours?: number
          overtime_rule?: Database["public"]["Enums"]["overtime_rule_id"]
          paid_hours?: number
          per_diem?: number
          production_name?: string
          rate_snapshot?: Json
          timesheet_id?: string
          travel_distance?: string
          travel_end_time?: string | null
          travel_hours?: number
          travel_paid?: boolean
          travel_start_time?: string | null
          turnaround_hours?: number
          turnaround_mode?: Database["public"]["Enums"]["turnaround_mode"]
          turnaround_pen_mult?: number
          turnaround_penalty?: number
          updated_at?: string
          user_id?: string
          vat_rate?: number
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_timesheet_owner_fk"
            columns: ["user_id", "timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      timesheets: {
        Row: {
          client_id: string | null
          client_incomplete: boolean
          client_name: string | null
          created_at: string
          crew_name: string
          currency: Database["public"]["Enums"]["currency_code"]
          default_day_rate: number | null
          default_equipment_rental: number | null
          default_included_hours: number | null
          default_min_turnaround: number | null
          default_ot_band1_hours: number | null
          default_ot_band1_mult: number | null
          default_ot_band2_mult: number | null
          default_overtime_rule:
            | Database["public"]["Enums"]["overtime_rule_id"]
            | null
          default_per_diem: number | null
          default_turnaround_mode:
            | Database["public"]["Enums"]["turnaround_mode"]
            | null
          default_turnaround_pen_mult: number | null
          equipment_rental_daily: boolean | null
          id: string
          invoice_id: string | null
          meal_breaks_deducted: boolean | null
          notes: string | null
          payment_terms: string | null
          production_name: string
          role: string
          start_date: string | null
          status: Database["public"]["Enums"]["timesheet_status"]
          timesheet_number: string
          travel_time_paid: boolean | null
          updated_at: string
          user_id: string
          vat: number
        }
        Insert: {
          client_id?: string | null
          client_incomplete?: boolean
          client_name?: string | null
          created_at?: string
          crew_name?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          default_day_rate?: number | null
          default_equipment_rental?: number | null
          default_included_hours?: number | null
          default_min_turnaround?: number | null
          default_ot_band1_hours?: number | null
          default_ot_band1_mult?: number | null
          default_ot_band2_mult?: number | null
          default_overtime_rule?:
            | Database["public"]["Enums"]["overtime_rule_id"]
            | null
          default_per_diem?: number | null
          default_turnaround_mode?:
            | Database["public"]["Enums"]["turnaround_mode"]
            | null
          default_turnaround_pen_mult?: number | null
          equipment_rental_daily?: boolean | null
          id?: string
          invoice_id?: string | null
          meal_breaks_deducted?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          production_name?: string
          role?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["timesheet_status"]
          timesheet_number: string
          travel_time_paid?: boolean | null
          updated_at?: string
          user_id: string
          vat?: number
        }
        Update: {
          client_id?: string | null
          client_incomplete?: boolean
          client_name?: string | null
          created_at?: string
          crew_name?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          default_day_rate?: number | null
          default_equipment_rental?: number | null
          default_included_hours?: number | null
          default_min_turnaround?: number | null
          default_ot_band1_hours?: number | null
          default_ot_band1_mult?: number | null
          default_ot_band2_mult?: number | null
          default_overtime_rule?:
            | Database["public"]["Enums"]["overtime_rule_id"]
            | null
          default_per_diem?: number | null
          default_turnaround_mode?:
            | Database["public"]["Enums"]["turnaround_mode"]
            | null
          default_turnaround_pen_mult?: number | null
          equipment_rental_daily?: boolean | null
          id?: string
          invoice_id?: string | null
          meal_breaks_deducted?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          production_name?: string
          role?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["timesheet_status"]
          timesheet_number?: string
          travel_time_paid?: boolean | null
          updated_at?: string
          user_id?: string
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_client_owner_fk"
            columns: ["user_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "timesheets_invoice_owner_fk"
            columns: ["user_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          onboarding_dismissed: boolean
          ui_preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          onboarding_dismissed?: boolean
          ui_preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          onboarding_dismissed?: boolean
          ui_preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      currency_code: "ZAR" | "USD" | "GBP" | "EUR"
      import_batch_status: "started" | "completed" | "failed"
      invoice_detail_mode: "summary" | "detailed" | "summary_timesheet"
      invoice_line_category:
        | "day-rate"
        | "overtime"
        | "equipment"
        | "travel"
        | "expenses"
        | "turnaround"
        | "additional"
      invoice_line_source_type:
        | "manual"
        | "timesheet"
        | "timesheet_entry"
        | "day_expense"
        | "other"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "partial"
        | "overdue"
        | "cancelled"
      overtime_rule_id: "sa-film" | "sa-bcea" | "custom"
      timesheet_status: "open" | "submitted" | "invoiced"
      turnaround_mode: "warning" | "penalty" | "manual"
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
      currency_code: ["ZAR", "USD", "GBP", "EUR"],
      import_batch_status: ["started", "completed", "failed"],
      invoice_detail_mode: ["summary", "detailed", "summary_timesheet"],
      invoice_line_category: [
        "day-rate",
        "overtime",
        "equipment",
        "travel",
        "expenses",
        "turnaround",
        "additional",
      ],
      invoice_line_source_type: [
        "manual",
        "timesheet",
        "timesheet_entry",
        "day_expense",
        "other",
      ],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "partial",
        "overdue",
        "cancelled",
      ],
      overtime_rule_id: ["sa-film", "sa-bcea", "custom"],
      timesheet_status: ["open", "submitted", "invoiced"],
      turnaround_mode: ["warning", "penalty", "manual"],
    },
  },
} as const
