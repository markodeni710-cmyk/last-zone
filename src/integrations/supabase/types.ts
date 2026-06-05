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
      account_sessions: {
        Row: {
          asn: string | null
          country_code: string | null
          created_at: string
          fingerprint: string | null
          id: string
          ip_hash: string
          ip_prefix: string | null
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          asn?: string | null
          country_code?: string | null
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip_hash: string
          ip_prefix?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          asn?: string | null
          country_code?: string | null
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip_hash?: string
          ip_prefix?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_trophy_grants: {
        Row: {
          amount: number
          created_at: string
          granted_by: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          granted_by: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          granted_by?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      channel_reads: {
        Row: {
          channel_id: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          created_at: string
          id: string
          message_ttl_seconds: number | null
          name: string
          position: number
          server_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_ttl_seconds?: number | null
          name: string
          position?: number
          server_id: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_ttl_seconds?: number | null
          name?: string
          position?: number
          server_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_comment_bans: {
        Row: {
          banned_by: string
          clip_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          banned_by: string
          clip_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          banned_by?: string
          clip_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      clip_comments: {
        Row: {
          clip_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          clip_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          clip_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clip_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_likes: {
        Row: {
          clip_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          clip_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          clip_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clip_likes_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
        ]
      }
      clips: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          likes_count: number
          tag: string | null
          tags: string[] | null
          thumbnail_url: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          likes_count?: number
          tag?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          likes_count?: number
          tag?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clips_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          player_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          player_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          player_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_calls: {
        Row: {
          accepted_at: string | null
          callee_id: string
          caller_id: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          kind: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          callee_id: string
          caller_id: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          kind?: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          callee_id?: string
          caller_id?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          kind?: string
          status?: string
        }
        Relationships: []
      }
      dm_threads: {
        Row: {
          accepted: boolean
          created_at: string
          id: string
          initiator_id: string
          last_message_at: string | null
          user_a: string
          user_b: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          id?: string
          initiator_id: string
          last_message_at?: string | null
          user_a: string
          user_b: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          id?: string
          initiator_id?: string
          last_message_at?: string | null
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      player_ratings: {
        Row: {
          created_at: string
          has_mic: boolean | null
          id: string
          no_quit: boolean | null
          no_toxic: boolean | null
          note: string | null
          punctual: boolean | null
          rated_id: string
          rater_id: string
          respectful: boolean | null
          skilled: boolean | null
          tournament_ready: boolean | null
        }
        Insert: {
          created_at?: string
          has_mic?: boolean | null
          id?: string
          no_quit?: boolean | null
          no_toxic?: boolean | null
          note?: string | null
          punctual?: boolean | null
          rated_id: string
          rater_id: string
          respectful?: boolean | null
          skilled?: boolean | null
          tournament_ready?: boolean | null
        }
        Update: {
          created_at?: string
          has_mic?: boolean | null
          id?: string
          no_quit?: boolean | null
          no_toxic?: boolean | null
          note?: string | null
          punctual?: boolean | null
          rated_id?: string
          rater_id?: string
          respectful?: boolean | null
          skilled?: boolean | null
          tournament_ready?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          kd: number | null
          language: string | null
          last_seen_at: string | null
          mic_available: boolean | null
          preferred_server: string | null
          pubg_id: string | null
          rank: string | null
          role: string | null
          sensitivity: Json | null
          suspended_at: string | null
          suspended_until: string | null
          suspension_reason: string | null
          updated_at: string
          username: string
          username_changed_at: string | null
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          kd?: number | null
          language?: string | null
          last_seen_at?: string | null
          mic_available?: boolean | null
          preferred_server?: string | null
          pubg_id?: string | null
          rank?: string | null
          role?: string | null
          sensitivity?: Json | null
          suspended_at?: string | null
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string
          username: string
          username_changed_at?: string | null
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          kd?: number | null
          language?: string | null
          last_seen_at?: string | null
          mic_available?: boolean | null
          preferred_server?: string | null
          pubg_id?: string | null
          rank?: string | null
          role?: string | null
          sensitivity?: Json | null
          suspended_at?: string | null
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string
          username?: string
          username_changed_at?: string | null
        }
        Relationships: []
      }
      server_bans: {
        Row: {
          banned_by: string
          created_at: string
          id: string
          reason: string | null
          server_id: string
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          id?: string
          reason?: string | null
          server_id: string
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          id?: string
          reason?: string | null
          server_id?: string
          user_id?: string
        }
        Relationships: []
      }
      server_join_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          server_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          server_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          server_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      server_members: {
        Row: {
          id: string
          joined_at: string
          role: string
          server_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          server_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_text_mutes: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          muted_by: string
          server_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          muted_by: string
          server_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          muted_by?: string
          server_id?: string
          user_id?: string
        }
        Relationships: []
      }
      servers: {
        Row: {
          banner_url: string | null
          code: string
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_public: boolean
          join_password: string | null
          join_requirements: string | null
          member_count: number
          name: string
          owner_id: string
          region: string | null
          tags: string[] | null
        }
        Insert: {
          banner_url?: string | null
          code: string
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_public?: boolean
          join_password?: string | null
          join_requirements?: string | null
          member_count?: number
          name: string
          owner_id: string
          region?: string | null
          tags?: string[] | null
        }
        Update: {
          banner_url?: string | null
          code?: string
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_public?: boolean
          join_password?: string | null
          join_requirements?: string | null
          member_count?: number
          name?: string
          owner_id?: string
          region?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      shop_transactions: {
        Row: {
          coins_delta: number
          created_at: string
          id: string
          is_virtual: boolean
          kind: string
          package_key: string | null
          trophies_added: number
          user_id: string
        }
        Insert: {
          coins_delta: number
          created_at?: string
          id?: string
          is_virtual?: boolean
          kind: string
          package_key?: string | null
          trophies_added?: number
          user_id: string
        }
        Update: {
          coins_delta?: number
          created_at?: string
          id?: string
          is_virtual?: boolean
          kind?: string
          package_key?: string | null
          trophies_added?: number
          user_id?: string
        }
        Relationships: []
      }
      squad_applications: {
        Row: {
          applicant_id: string
          contact: string | null
          created_at: string
          expires_at: string
          id: string
          listing_id: string
          listing_owner_id: string
          message: string | null
          pubg_id: string | null
          status: string
        }
        Insert: {
          applicant_id: string
          contact?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          listing_id: string
          listing_owner_id: string
          message?: string | null
          pubg_id?: string | null
          status?: string
        }
        Update: {
          applicant_id?: string
          contact?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          listing_id?: string
          listing_owner_id?: string
          message?: string | null
          pubg_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_listings: {
        Row: {
          completed_at: string | null
          contact: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          mic_required: boolean
          mode: string | null
          rank: string | null
          server_region: string | null
          slots_needed: number
          status: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          contact?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          mic_required?: boolean
          mode?: string | null
          rank?: string | null
          server_region?: string | null
          slots_needed?: number
          status?: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          contact?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          mic_required?: boolean
          mode?: string | null
          rank?: string | null
          server_region?: string | null
          slots_needed?: number
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_listings_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          banned: boolean
          captain_id: string
          contact: string | null
          created_at: string
          id: string
          members: string | null
          members_ids: string[]
          organizer_id: string
          status: string
          team_name: string
          tournament_id: string
        }
        Insert: {
          banned?: boolean
          captain_id: string
          contact?: string | null
          created_at?: string
          id?: string
          members?: string | null
          members_ids?: string[]
          organizer_id: string
          status?: string
          team_name: string
          tournament_id: string
        }
        Update: {
          banned?: boolean
          captain_id?: string
          contact?: string | null
          created_at?: string
          id?: string
          members?: string | null
          members_ids?: string[]
          organizer_id?: string
          status?: string
          team_name?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_results: {
        Row: {
          created_at: string
          id: string
          position: number
          prize_note: string | null
          recipient_ids: string[]
          registration_id: string
          tournament_id: string
          trophies_awarded: number
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          prize_note?: string | null
          recipient_ids?: string[]
          registration_id: string
          tournament_id: string
          trophies_awarded?: number
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          prize_note?: string | null
          recipient_ids?: string[]
          registration_id?: string
          tournament_id?: string
          trophies_awarded?: number
        }
        Relationships: []
      }
      tournament_team_invites: {
        Row: {
          captain_id: string
          created_at: string
          id: string
          invitee_id: string
          registration_id: string
          responded_at: string | null
          status: string
          tournament_id: string
        }
        Insert: {
          captain_id: string
          created_at?: string
          id?: string
          invitee_id: string
          registration_id: string
          responded_at?: string | null
          status?: string
          tournament_id: string
        }
        Update: {
          captain_id?: string
          created_at?: string
          id?: string
          invitee_id?: string
          registration_id?: string
          responded_at?: string | null
          status?: string
          tournament_id?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          banner_url: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          live_stream_active: boolean
          live_stream_started_at: string | null
          map_mode: string | null
          max_teams: number
          min_rank: string | null
          mode: string | null
          name: string
          organizer_id: string
          prize_pool: string | null
          region: string | null
          room_id: string | null
          room_password: string | null
          rules: string | null
          starts_at: string | null
          status: string
          system: string | null
          team_size: number
          trophies_count: number
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          live_stream_active?: boolean
          live_stream_started_at?: string | null
          map_mode?: string | null
          max_teams?: number
          min_rank?: string | null
          mode?: string | null
          name: string
          organizer_id: string
          prize_pool?: string | null
          region?: string | null
          room_id?: string | null
          room_password?: string | null
          rules?: string | null
          starts_at?: string | null
          status?: string
          system?: string | null
          team_size?: number
          trophies_count?: number
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          live_stream_active?: boolean
          live_stream_started_at?: string | null
          map_mode?: string | null
          max_teams?: number
          min_rank?: string | null
          mode?: string | null
          name?: string
          organizer_id?: string
          prize_pool?: string | null
          region?: string | null
          room_id?: string | null
          room_password?: string | null
          rules?: string | null
          starts_at?: string | null
          status?: string
          system?: string | null
          team_size?: number
          trophies_count?: number
        }
        Relationships: []
      }
      trophy_packages: {
        Row: {
          badge: string | null
          created_at: string
          id: string
          key: string
          perks: string[]
          popular: boolean
          price_label: string | null
          price_usd: number
          sort_order: number
          trophies: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          badge?: string | null
          created_at?: string
          id?: string
          key: string
          perks?: string[]
          popular?: boolean
          price_label?: string | null
          price_usd: number
          sort_order?: number
          trophies: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          badge?: string | null
          created_at?: string
          id?: string
          key?: string
          perks?: string[]
          popular?: boolean
          price_label?: string | null
          price_usd?: number
          sort_order?: number
          trophies?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      uc_packages: {
        Row: {
          badge: string | null
          created_at: string
          id: string
          key: string
          popular: boolean
          sort_order: number
          trophies_cost: number
          uc_amount: number
          updated_at: string
          usd_value: number
          visible: boolean
        }
        Insert: {
          badge?: string | null
          created_at?: string
          id?: string
          key: string
          popular?: boolean
          sort_order?: number
          trophies_cost: number
          uc_amount: number
          updated_at?: string
          usd_value: number
          visible?: boolean
        }
        Update: {
          badge?: string | null
          created_at?: string
          id?: string
          key?: string
          popular?: boolean
          sort_order?: number
          trophies_cost?: number
          uc_amount?: number
          updated_at?: string
          usd_value?: number
          visible?: boolean
        }
        Relationships: []
      }
      uc_withdrawal_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          package_key: string
          processed_at: string | null
          pubg_id: string
          status: string
          trophies_cost: number
          uc_amount: number
          usd_value: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          package_key: string
          processed_at?: string | null
          pubg_id: string
          status?: string
          trophies_cost: number
          uc_amount: number
          usd_value: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          package_key?: string
          processed_at?: string | null
          pubg_id?: string
          status?: string
          trophies_cost?: number
          uc_amount?: number
          usd_value?: number
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          coins: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coins?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_call_invites: {
        Row: {
          channel_id: string
          channel_name: string
          created_at: string
          expires_at: string
          from_user: string
          id: string
          server_id: string
          status: string
          to_user: string
        }
        Insert: {
          channel_id: string
          channel_name: string
          created_at?: string
          expires_at?: string
          from_user: string
          id?: string
          server_id: string
          status?: string
          to_user: string
        }
        Update: {
          channel_id?: string
          channel_name?: string
          created_at?: string
          expires_at?: string
          from_user?: string
          id?: string
          server_id?: string
          status?: string
          to_user?: string
        }
        Relationships: []
      }
      voice_room_bans: {
        Row: {
          banned_by: string
          channel_id: string
          created_at: string
          expires_at: string
          id: string
          server_id: string
          user_id: string
        }
        Insert: {
          banned_by: string
          channel_id: string
          created_at?: string
          expires_at: string
          id?: string
          server_id: string
          user_id: string
        }
        Update: {
          banned_by?: string
          channel_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          server_id?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_room_participants: {
        Row: {
          can_speak: boolean
          channel_id: string
          hand_raised: boolean
          id: string
          is_muted: boolean
          joined_at: string
          server_id: string
          user_id: string
        }
        Insert: {
          can_speak?: boolean
          channel_id: string
          hand_raised?: boolean
          id?: string
          is_muted?: boolean
          joined_at?: string
          server_id: string
          user_id: string
        }
        Update: {
          can_speak?: boolean
          channel_id?: string
          hand_raised?: boolean
          id?: string
          is_muted?: boolean
          joined_at?: string
          server_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_tournament_invite: {
        Args: { _invite_id: string }
        Returns: undefined
      }
      available_trophies: { Args: { _user: string }; Returns: number }
      cleanup_completed_squad_listings: { Args: never; Returns: undefined }
      cleanup_expired_messages: { Args: never; Returns: undefined }
      ensure_admin_friendship: { Args: { _user: string }; Returns: undefined }
      expire_pending_squad_applications: { Args: never; Returns: undefined }
      find_server_by_code: {
        Args: { _code: string }
        Returns: {
          banner_url: string
          code: string
          description: string
          has_password: boolean
          icon_url: string
          id: string
          is_public: boolean
          join_requirements: string
          member_count: number
          name: string
          region: string
        }[]
      }
      get_admin_user_id: { Args: never; Returns: string }
      get_my_server_password: { Args: { _server_id: string }; Returns: string }
      get_my_squad_contact: { Args: { _id: string }; Returns: string }
      get_my_trophies: {
        Args: { _user?: string }
        Returns: {
          finished_at: string
          pos: number
          prize_note: string
          team_name: string
          tournament_id: string
          tournament_name: string
          trophies_awarded: number
        }[]
      }
      get_or_create_dm_thread: { Args: { _other: string }; Returns: string }
      get_suspicious_accounts: {
        Args: never
        Returns: {
          account_count: number
          last_seen_at: string
          match_type: string
          match_value: string
          user_ids: string[]
          usernames: string[]
        }[]
      }
      get_tournament_room_credentials: {
        Args: { _id: string }
        Returns: {
          room_id: string
          room_password: string
        }[]
      }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_blocked_between: { Args: { _a: string; _b: string }; Returns: boolean }
      is_lovable_admin: { Args: never; Returns: boolean }
      is_server_admin: { Args: { _server_id: string }; Returns: boolean }
      is_server_member: { Args: { _server_id: string }; Returns: boolean }
      join_server_with_password: {
        Args: { _password: string; _server_id: string }
        Returns: string
      }
      process_uc_withdrawal: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: undefined
      }
      purchase_trophy_package: { Args: { _package_key: string }; Returns: Json }
      rank_order: { Args: { _rank: string }; Returns: number }
      record_account_session: {
        Args: {
          _asn: string
          _country_code: string
          _fingerprint: string
          _ip_hash: string
          _ip_prefix: string
          _user_agent: string
        }
        Returns: undefined
      }
      request_uc_withdrawal: {
        Args: { _package_key: string; _pubg_id: string }
        Returns: string
      }
      virtual_topup_coins: { Args: { _amount: number }; Returns: number }
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
