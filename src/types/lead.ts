export type LeadScore = 'hot' | 'warm' | 'cold';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost' | 'ghost';
export type LeadSource = 'facebook' | 'website' | 'google_sheets' | 'manual' | 'other';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: LeadSource;
  score: LeadScore;
  status: LeadStatus;
  createdAt: string;
  notes: string;
  aiSummary: string;
  salesAngle: string;
  nextAction: string;
  nextActionDate: string;
}

export interface GeneratedMessage {
  id: string;
  leadId: string;
  type: 'whatsapp' | 'email' | 'sms';
  content: string;
  createdAt: string;
}

export interface SalesScript {
  id: string;
  leadId: string;
  script: string;
  objections: { objection: string; response: string }[];
  createdAt: string;
}

export interface Reminder {
  id: string;
  leadId: string;
  leadName: string;
  action: string;
  dueDate: string;
  done: boolean;
}
