export interface ChannelInfo {
  id: number;
  name: string;
  phone_number: string;
  type: string;
}

export interface ContactTag {
  id: number;
  name: string;
  color: string;
}

export interface ExactLeadResult {
  id: number;
  exact_id: number;
  name: string;
  phone1: string | null;
  sub_source: string | null;
  stage: string | null;
}

export interface Contact {
  wa_id: string;
  name: string;
  lead_status: string;
  notes: string | null;
  ai_active: boolean;
  last_message: string;
  last_message_time: string | null;
  direction: string | null;
  tags: ContactTag[];
  unread: number;
  deal_value: number | null;
  created_at: string | null;
  channel_id: number | null;
  assigned_to: number | null;
}

export interface TeamUser {
  id: number;
  name: string;
  role: string;
}

export interface Message {
  id: number;
  wa_message_id: string;
  direction: string;
  type: string;
  content: string;
  timestamp: string;
  status: string;
  sent_by_ai: boolean;
}