/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.4';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      agent_capabilities: {
        Row: {
          accepts_tasks: boolean;
          agent_key_id: string;
          created_at: string;
          description: string | null;
          skills: string[];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          accepts_tasks?: boolean;
          agent_key_id: string;
          created_at?: string;
          description?: string | null;
          skills?: string[];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          accepts_tasks?: boolean;
          agent_key_id?: string;
          created_at?: string;
          description?: string | null;
          skills?: string[];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_capabilities_agent_key_id_fkey';
            columns: ['agent_key_id'];
            isOneToOne: true;
            referencedRelation: 'agent_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_capabilities_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_keys: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_active: boolean;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          name: string;
          role: Database['public']['Enums']['agent_role'];
          special_prompt: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          is_active?: boolean;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          name: string;
          role?: Database['public']['Enums']['agent_role'];
          special_prompt?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          name?: string;
          role?: Database['public']['Enums']['agent_role'];
          special_prompt?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_keys_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_permissions: {
        Row: {
          agent_key_id: string;
          can_assign: boolean;
          can_create: boolean;
          can_read: boolean;
          can_update: boolean;
          created_at: string;
          department_id: string | null;
          id: string;
          project_id: string;
          workspace_id: string;
        };
        Insert: {
          agent_key_id: string;
          can_assign?: boolean;
          can_create?: boolean;
          can_read?: boolean;
          can_update?: boolean;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          project_id: string;
          workspace_id: string;
        };
        Update: {
          agent_key_id?: string;
          can_assign?: boolean;
          can_create?: boolean;
          can_read?: boolean;
          can_update?: boolean;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          project_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_permissions_agent_key_id_fkey';
            columns: ['agent_key_id'];
            isOneToOne: false;
            referencedRelation: 'agent_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_permissions_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_permissions_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_permissions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: {
          created_at: string;
          department_required: boolean;
          id: string;
          max_agent_keys_per_manager: number | null;
          require_human_approval_for_agent_keys: boolean;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          department_required?: boolean;
          id?: string;
          max_agent_keys_per_manager?: number | null;
          require_human_approval_for_agent_keys?: boolean;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          department_required?: boolean;
          id?: string;
          max_agent_keys_per_manager?: number | null;
          require_human_approval_for_agent_keys?: boolean;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'app_settings_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      auth_rate_limits: {
        Row: {
          failure_count: number;
          ip_address: string;
          window_start: string;
        };
        Insert: {
          failure_count?: number;
          ip_address: string;
          window_start: string;
        };
        Update: {
          failure_count?: number;
          ip_address?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_archived: boolean;
          name: string;
          slug: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_archived?: boolean;
          name: string;
          slug: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_archived?: boolean;
          name?: string;
          slug?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'departments_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      event_log: {
        Row: {
          actor_id: string;
          actor_label: string;
          actor_type: Database['public']['Enums']['actor_type'];
          created_at: string;
          event_category: Database['public']['Enums']['event_category'];
          event_type: string;
          field_name: string | null;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
          source: Database['public']['Enums']['source'];
          target_id: string;
          target_type: Database['public']['Enums']['target_type'];
          workspace_id: string;
        };
        Insert: {
          actor_id: string;
          actor_label: string;
          actor_type: Database['public']['Enums']['actor_type'];
          created_at?: string;
          event_category: Database['public']['Enums']['event_category'];
          event_type: string;
          field_name?: string | null;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          source: Database['public']['Enums']['source'];
          target_id: string;
          target_type: Database['public']['Enums']['target_type'];
          workspace_id: string;
        };
        Update: {
          actor_id?: string;
          actor_label?: string;
          actor_type?: Database['public']['Enums']['actor_type'];
          created_at?: string;
          event_category?: Database['public']['Enums']['event_category'];
          event_type?: string;
          field_name?: string | null;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          source?: Database['public']['Enums']['source'];
          target_id?: string;
          target_type?: Database['public']['Enums']['target_type'];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_log_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_archived: boolean;
          name: string;
          slug: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_archived?: boolean;
          name: string;
          slug: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_archived?: boolean;
          name?: string;
          slug?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      rate_limits: {
        Row: {
          agent_key_id: string;
          request_count: number;
          window_start: string;
        };
        Insert: {
          agent_key_id: string;
          request_count?: number;
          window_start: string;
        };
        Update: {
          agent_key_id?: string;
          request_count?: number;
          window_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rate_limits_agent_key_id_fkey';
            columns: ['agent_key_id'];
            isOneToOne: false;
            referencedRelation: 'agent_keys';
            referencedColumns: ['id'];
          },
        ];
      };
      request_log: {
        Row: {
          agent_key_id: string;
          created_at: string;
          error_code: string | null;
          id: string;
          latency_ms: number | null;
          project_id: string | null;
          status: string;
          tool_name: string;
          workspace_id: string;
        };
        Insert: {
          agent_key_id: string;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          latency_ms?: number | null;
          project_id?: string | null;
          status: string;
          tool_name: string;
          workspace_id: string;
        };
        Update: {
          agent_key_id?: string;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          latency_ms?: number | null;
          project_id?: string | null;
          status?: string;
          tool_name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_log_agent_key_id_fkey';
            columns: ['agent_key_id'];
            isOneToOne: false;
            referencedRelation: 'agent_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_log_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_log_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: {
          assigned_to_agent_key_id: string | null;
          assignment_chain: string[];
          created_at: string;
          created_by_id: string;
          created_by_type: Database['public']['Enums']['actor_type'];
          delegation_depth: number;
          department_id: string | null;
          description: string;
          due_date: string | null;
          id: string;
          notes: string | null;
          priority: Database['public']['Enums']['priority'];
          project_id: string;
          requested_by_agent_key_id: string | null;
          search_vector: unknown;
          source: Database['public']['Enums']['source'];
          status: Database['public']['Enums']['status'];
          updated_at: string;
          updated_by_id: string;
          updated_by_type: Database['public']['Enums']['actor_type'];
          version: number;
          workspace_id: string;
        };
        Insert: {
          assigned_to_agent_key_id?: string | null;
          assignment_chain?: string[];
          created_at?: string;
          created_by_id: string;
          created_by_type: Database['public']['Enums']['actor_type'];
          delegation_depth?: number;
          department_id?: string | null;
          description: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          priority?: Database['public']['Enums']['priority'];
          project_id: string;
          requested_by_agent_key_id?: string | null;
          search_vector?: unknown;
          source: Database['public']['Enums']['source'];
          status?: Database['public']['Enums']['status'];
          updated_at?: string;
          updated_by_id: string;
          updated_by_type: Database['public']['Enums']['actor_type'];
          version?: number;
          workspace_id: string;
        };
        Update: {
          assigned_to_agent_key_id?: string | null;
          assignment_chain?: string[];
          created_at?: string;
          created_by_id?: string;
          created_by_type?: Database['public']['Enums']['actor_type'];
          delegation_depth?: number;
          department_id?: string | null;
          description?: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          priority?: Database['public']['Enums']['priority'];
          project_id?: string;
          requested_by_agent_key_id?: string | null;
          search_vector?: unknown;
          source?: Database['public']['Enums']['source'];
          status?: Database['public']['Enums']['status'];
          updated_at?: string;
          updated_by_id?: string;
          updated_by_type?: Database['public']['Enums']['actor_type'];
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_assigned_to_agent_key_id_fkey';
            columns: ['assigned_to_agent_key_id'];
            isOneToOne: false;
            referencedRelation: 'agent_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_requested_by_agent_key_id_fkey';
            columns: ['requested_by_agent_key_id'];
            isOneToOne: false;
            referencedRelation: 'agent_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      user_rate_limits: {
        Row: {
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          request_count?: number;
          user_id: string;
          window_start: string;
        };
        Update: {
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      webhook_subscriptions: {
        Row: {
          agent_key_id: string;
          created_at: string;
          event_types: string[];
          id: string;
          is_active: boolean;
          project_id: string;
          secret: string;
          updated_at: string;
          url: string;
          workspace_id: string;
        };
        Insert: {
          agent_key_id: string;
          created_at?: string;
          event_types?: string[];
          id?: string;
          is_active?: boolean;
          project_id: string;
          secret: string;
          updated_at?: string;
          url: string;
          workspace_id: string;
        };
        Update: {
          agent_key_id?: string;
          created_at?: string;
          event_types?: string[];
          id?: string;
          is_active?: boolean;
          project_id?: string;
          secret?: string;
          updated_at?: string;
          url?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'webhook_subscriptions_agent_key_id_fkey';
            columns: ['agent_key_id'];
            isOneToOne: false;
            referencedRelation: 'agent_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'webhook_subscriptions_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'webhook_subscriptions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          role: Database['public']['Enums']['workspace_role'];
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          role?: Database['public']['Enums']['workspace_role'];
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database['public']['Enums']['workspace_role'];
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      check_auth_rate_limit: { Args: { p_ip: string }; Returns: number };
      cleanup_auth_rate_limits: { Args: never; Returns: undefined };
      cleanup_rate_limits: { Args: never; Returns: number };
      create_task_with_event: {
        Args: { p_payload: Json };
        Returns: {
          assigned_to_agent_key_id: string | null;
          assignment_chain: string[];
          created_at: string;
          created_by_id: string;
          created_by_type: Database['public']['Enums']['actor_type'];
          delegation_depth: number;
          department_id: string | null;
          description: string;
          due_date: string | null;
          id: string;
          notes: string | null;
          priority: Database['public']['Enums']['priority'];
          project_id: string;
          requested_by_agent_key_id: string | null;
          search_vector: unknown;
          source: Database['public']['Enums']['source'];
          status: Database['public']['Enums']['status'];
          updated_at: string;
          updated_by_id: string;
          updated_by_type: Database['public']['Enums']['actor_type'];
          version: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'tasks';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ensure_user_workspace: { Args: never; Returns: string };
      get_tasks_page:
        | {
            Args: {
              p_cursor_created_at?: string;
              p_cursor_id?: string;
              p_department_id?: string;
              p_limit?: number;
              p_priority?: Database['public']['Enums']['priority'];
              p_project_id: string;
              p_status?: Database['public']['Enums']['status'];
              p_updated_after?: string;
            };
            Returns: {
              created_at: string;
              created_by_id: string;
              created_by_type: Database['public']['Enums']['actor_type'];
              department_id: string;
              description: string;
              due_date: string;
              id: string;
              notes: string;
              priority: Database['public']['Enums']['priority'];
              project_id: string;
              source: Database['public']['Enums']['source'];
              status: Database['public']['Enums']['status'];
              updated_at: string;
              updated_by_id: string;
              updated_by_type: Database['public']['Enums']['actor_type'];
              version: number;
            }[];
          }
        | {
            Args: {
              p_cursor_created_at?: string;
              p_cursor_id?: string;
              p_department_id?: string;
              p_limit?: number;
              p_priority?: Database['public']['Enums']['priority'];
              p_project_id: string;
              p_search?: string;
              p_status?: Database['public']['Enums']['status'];
              p_updated_after?: string;
            };
            Returns: {
              created_at: string;
              created_by_id: string;
              created_by_type: Database['public']['Enums']['actor_type'];
              department_id: string;
              description: string;
              due_date: string;
              id: string;
              notes: string;
              priority: Database['public']['Enums']['priority'];
              project_id: string;
              source: Database['public']['Enums']['source'];
              status: Database['public']['Enums']['status'];
              updated_at: string;
              updated_by_id: string;
              updated_by_type: Database['public']['Enums']['actor_type'];
              version: number;
            }[];
          }
        | {
            Args: {
              p_assigned_to?: string;
              p_cursor_created_at?: string;
              p_cursor_id?: string;
              p_department_id?: string;
              p_limit?: number;
              p_priority?: Database['public']['Enums']['priority'];
              p_project_id: string;
              p_requested_by?: string;
              p_search?: string;
              p_status?: Database['public']['Enums']['status'];
              p_updated_after?: string;
            };
            Returns: {
              assigned_to_agent_key_id: string;
              assignment_chain: string[];
              created_at: string;
              created_by_id: string;
              created_by_type: Database['public']['Enums']['actor_type'];
              delegation_depth: number;
              department_id: string;
              description: string;
              due_date: string;
              id: string;
              notes: string;
              priority: Database['public']['Enums']['priority'];
              project_id: string;
              requested_by_agent_key_id: string;
              source: Database['public']['Enums']['source'];
              status: Database['public']['Enums']['status'];
              updated_at: string;
              updated_by_id: string;
              updated_by_type: Database['public']['Enums']['actor_type'];
              version: number;
            }[];
          }
        | {
            Args: {
              p_assigned_to?: string;
              p_cursor_created_at?: string;
              p_cursor_id?: string;
              p_department_id?: string;
              p_limit?: number;
              p_priority?: Database['public']['Enums']['priority'];
              p_project_id: string;
              p_requested_by?: string;
              p_search?: string;
              p_status?: Database['public']['Enums']['status'];
              p_updated_after?: string;
              p_workspace_id: string;
            };
            Returns: {
              assigned_to_agent_key_id: string;
              assignment_chain: string[];
              created_at: string;
              created_by_id: string;
              created_by_type: Database['public']['Enums']['actor_type'];
              delegation_depth: number;
              department_id: string;
              description: string;
              due_date: string;
              id: string;
              notes: string;
              priority: Database['public']['Enums']['priority'];
              project_id: string;
              requested_by_agent_key_id: string;
              source: Database['public']['Enums']['source'];
              status: Database['public']['Enums']['status'];
              updated_at: string;
              updated_by_id: string;
              updated_by_type: Database['public']['Enums']['actor_type'];
              version: number;
            }[];
          };
      get_user_workspace_ids: { Args: never; Returns: string[] };
      increment_auth_rate_limit: { Args: { p_ip: string }; Returns: number };
      increment_rate_limit: { Args: { p_key_id: string }; Returns: number };
      increment_user_rate_limit: {
        Args: { p_user_id: string };
        Returns: number;
      };
      update_agent_permissions: {
        Args: { p_key_id: string; p_rows: Json };
        Returns: undefined;
      };
      update_task_with_events: {
        Args: { p_payload: Json };
        Returns: {
          assigned_to_agent_key_id: string | null;
          assignment_chain: string[];
          created_at: string;
          created_by_id: string;
          created_by_type: Database['public']['Enums']['actor_type'];
          delegation_depth: number;
          department_id: string | null;
          description: string;
          due_date: string | null;
          id: string;
          notes: string | null;
          priority: Database['public']['Enums']['priority'];
          project_id: string;
          requested_by_agent_key_id: string | null;
          search_vector: unknown;
          source: Database['public']['Enums']['source'];
          status: Database['public']['Enums']['status'];
          updated_at: string;
          updated_by_id: string;
          updated_by_type: Database['public']['Enums']['actor_type'];
          version: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'tasks';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      actor_type: 'human' | 'agent' | 'system';
      agent_role: 'worker' | 'manager';
      event_category: 'task' | 'admin' | 'system';
      priority: 'low' | 'medium' | 'high' | 'critical';
      source: 'ui' | 'mcp' | 'api' | 'system';
      status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | 'failed';
      target_type: 'task' | 'agent_key' | 'project' | 'department';
      workspace_role: 'owner' | 'admin' | 'member';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_type: ['human', 'agent', 'system'],
      agent_role: ['worker', 'manager'],
      event_category: ['task', 'admin', 'system'],
      priority: ['low', 'medium', 'high', 'critical'],
      source: ['ui', 'mcp', 'api', 'system'],
      status: ['todo', 'in_progress', 'blocked', 'done', 'cancelled', 'failed'],
      target_type: ['task', 'agent_key', 'project', 'department'],
      workspace_role: ['owner', 'admin', 'member'],
    },
  },
} as const;
