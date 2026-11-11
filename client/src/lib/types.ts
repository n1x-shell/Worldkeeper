export type { Entity, EntitySummary, Relationship, Realm, EntityType, CanonStatus } from '@shared/domain';

export interface RelationshipView {
  id: number;
  source_id: string;
  target_id: string;
  type: string;
  directed: boolean;
  label: string;
  description: string;
  canon_status: string;
  origin: string;
  source_context: string;
  source_name: string | null;
  target_name: string | null;
  source_type: string | null;
  target_type: string | null;
}

export interface Campaign {
  id: number;
  title: string;
  premise: string;
  starting_location_id: string | null;
  starting_date: string;
  current_date: string;
  status: string;
  players: { name: string; contact: string }[];
  active_factions: string[];
  notes: string;
  updated_at: string;
}

export interface Session {
  id: number;
  campaign_id: number;
  number: number;
  title: string;
  status: 'planned' | 'live' | 'completed';
  played_on: string;
  in_world_date: string;
  prep: Record<string, string> & { relevantIds: string[]; adventureIds: number[] };
  recap: string;
  recap_player_visible: boolean;
  current_scene_id: number | null;
}

export interface StateRow {
  id: number;
  campaign_id: number;
  entity_id: string | null;
  entity_name?: string | null;
  field: string;
  value: string;
  note: string;
  session_id: number | null;
  status: string;
  created_at: string;
  campaign_title?: string;
}
